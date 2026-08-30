// Cuenta corriente de acreedores — el saldo es una LECTURA, no un registro aparte.
//
// Con algunos proveedores de servicios (el abogado, el contador) no hay "una factura, un
// vencimiento, un pago": se les va devengando un abono mensual más trabajos sueltos, y se les
// manda plata cuando hay. Lo único que importa es que el saldo dé cero.
//
// Acá NO se guarda nada: los conceptos salen de `gastos` (los que tienen `proveedor_id`) y los
// pagos de la tabla `pagos` (`tipo_origen='GASTO'`). El saldo es la resta. Por eso esta pantalla
// no suma ni resta nada al patrimonio: el pasivo lo siguen aportando los gastos pendientes,
// exactamente como antes (ver la migración 079).
//
// Un pago cuenta cuando está DEBITADO — igual que en lib/gastos-estado.ts. Un pago agendado a
// futuro todavía no bajó la deuda.

export interface AcreedorPagoInput {
  id: string
  origen_id: string
  monto: number | string
  fecha_emision: string
  fecha_debito?: string | null
  debitado?: boolean | null
  instrumento?: string | null
  /** La nota suele decir CON QUÉ PLATA se pagó (ej. "Nazarena Luciani - BDI Mayorista"). */
  notas?: string | null
}

export interface AcreedorGastoInput {
  id: string
  concepto: string
  categoria?: string | null
  mes: string
  fecha: string
  monto: number | string
  moneda?: string | null
  estado?: string | null
  notas?: string | null
  proveedor_id?: string | null
}

export interface ConceptoCC extends AcreedorGastoInput {
  /** Suma de los pagos DEBITADOS aplicados a este gasto. */
  pagado: number
  /** monto − pagado, nunca negativo. Es lo que se muestra como deuda. */
  saldo: number
  /**
   * Suma de TODOS los pagos, debitados o no. Un pago agendado todavía no baja la deuda, pero sí
   * ocupa lugar: `createPagoUnificado` valida contra esto y rechaza lo que exceda el monto del
   * gasto. Repartir por `saldo` en vez de por acá haría rebotar el pago.
   */
  comprometido: number
  /** monto − comprometido: cuánto se le puede imputar todavía a este gasto. */
  disponible: number
  pagos: AcreedorPagoInput[]
}

export interface CuentaAcreedor {
  proveedorId: string
  nombre: string
  conceptos: ConceptoCC[]
  /** Σ de lo devengado. */
  totalDevengado: number
  /** Σ de lo pagado y debitado. */
  totalPagado: number
  /** Lo que se le debe hoy. Tiene que dar 0 cuando la cuenta está saldada. */
  saldo: number
  /** Fecha del último pago debitado, para ordenar y mostrar "último movimiento". */
  ultimoPago: string | null
}

function num(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Arma la cuenta corriente de cada acreedor a partir de los gastos que lo tienen asignado
 * y de los pagos del ledger. `proveedores` da el nombre; los que no tienen ningún gasto
 * no aparecen (la cuenta existe recién cuando hay algo devengado).
 */
export function armarCuentas(
  gastos: AcreedorGastoInput[],
  pagos: AcreedorPagoInput[],
  proveedores: { id: string; nombre: string }[],
): CuentaAcreedor[] {
  const nombrePorId = new Map(proveedores.map((p) => [p.id, p.nombre]))

  const pagosPorGasto = new Map<string, AcreedorPagoInput[]>()
  for (const p of pagos) {
    if (!p.origen_id) continue
    const lista = pagosPorGasto.get(p.origen_id)
    if (lista) lista.push(p)
    else pagosPorGasto.set(p.origen_id, [p])
  }

  const cuentas = new Map<string, CuentaAcreedor>()

  for (const g of gastos) {
    const provId = g.proveedor_id
    if (!provId) continue

    const susPagos = (pagosPorGasto.get(g.id) ?? []).sort((a, b) =>
      a.fecha_emision.localeCompare(b.fecha_emision),
    )
    const pagado = susPagos.reduce((s, p) => s + (p.debitado ? num(p.monto) : 0), 0)
    const comprometido = susPagos.reduce((s, p) => s + num(p.monto), 0)
    const monto = num(g.monto)
    // Un pago de más no genera saldo a favor: se corta en cero, como en el resto del sistema.
    const saldo = Math.max(0, monto - pagado)
    const disponible = Math.max(0, monto - comprometido)

    const cuenta = cuentas.get(provId) ?? {
      proveedorId: provId,
      nombre: nombrePorId.get(provId) ?? 'Acreedor sin nombre',
      conceptos: [],
      totalDevengado: 0,
      totalPagado: 0,
      saldo: 0,
      ultimoPago: null,
    }

    cuenta.conceptos.push({ ...g, pagado, saldo, comprometido, disponible, pagos: susPagos })
    cuenta.totalDevengado += monto
    cuenta.totalPagado += pagado
    cuenta.saldo += saldo
    for (const p of susPagos) {
      if (!p.debitado) continue
      const dia = p.fecha_debito ?? p.fecha_emision
      if (!cuenta.ultimoPago || dia > cuenta.ultimoPago) cuenta.ultimoPago = dia
    }
    cuentas.set(provId, cuenta)
  }

  for (const c of cuentas.values()) {
    // Del más viejo al más nuevo: así se lee como un extracto.
    c.conceptos.sort((a, b) => a.mes.localeCompare(b.mes) || a.fecha.localeCompare(b.fecha))
    // Los centavos de redondeo no son deuda.
    if (Math.abs(c.saldo) < 0.01) c.saldo = 0
  }

  // Primero los que tienen saldo (que es lo que hay que mirar), después por nombre.
  return [...cuentas.values()].sort(
    (a, b) => (b.saldo > 0 ? 1 : 0) - (a.saldo > 0 ? 1 : 0) || a.nombre.localeCompare(b.nombre, 'es'),
  )
}

// ─── Repartir un pago entre varios conceptos ──────────────────────────────────
//
// Cuando se le manda plata a un acreedor, no se paga "un gasto": se paga a cuenta. La plata se
// imputa del concepto más viejo al más nuevo, que es como funciona una cuenta corriente y es lo
// que se venía haciendo a mano (la transferencia del 12/08/2026 por $221.537 se partió en $4.892
// para mayo y $216.645 para el litigio).
//
// Devuelve un renglón por cada gasto que recibe plata. Si sobra, `sobrante` lo dice: el que llama
// decide si avisar o no. Nunca imputa más que el `disponible` de cada concepto, porque
// `createPagoUnificado` rechaza lo que exceda el monto del gasto.

export interface RenglonReparto {
  gastoId: string
  concepto: string
  mes: string
  /** Lo que se le imputa a ESTE gasto. */
  monto: number
  /** Lo que se le podía imputar como mucho — para que la pantalla avise si se pasa. */
  disponible: number
}

export interface Reparto {
  renglones: RenglonReparto[]
  /** Plata que no se pudo imputar porque no hay más deuda. */
  sobrante: number
  /** Σ de los renglones. */
  imputado: number
}

/** Redondeo a centavos, para que sumar los renglones dé exactamente el total. */
function centavos(n: number): number {
  return Math.round(n * 100) / 100
}

export function repartirPago(conceptos: ConceptoCC[], monto: number): Reparto {
  let restante = centavos(monto)
  const renglones: RenglonReparto[] = []

  // Del más viejo al más nuevo. `armarCuentas` ya los deja en ese orden, pero no se depende de eso.
  const ordenados = [...conceptos].sort(
    (a, b) => a.mes.localeCompare(b.mes) || a.fecha.localeCompare(b.fecha),
  )

  for (const c of ordenados) {
    if (restante <= 0.005) break
    if (c.disponible <= 0.005) continue
    const cuota = centavos(Math.min(restante, c.disponible))
    renglones.push({ gastoId: c.id, concepto: c.concepto, mes: c.mes, monto: cuota, disponible: c.disponible })
    restante = centavos(restante - cuota)
  }

  const imputado = centavos(renglones.reduce((s, r) => s + r.monto, 0))
  return { renglones, sobrante: Math.max(0, centavos(monto) - imputado), imputado }
}
