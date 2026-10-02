// Qué adelantos de sueldo se enganchan a qué nómina, y por cuánto. Puro: sin base, sin fechas de hoy.
//
// Un adelanto es plata que un cliente mayorista le transfirió directo a un empleado ANTES de que se
// liquidara su sueldo (se anota y se confirma en el Monitor). Cuando la nómina existe, se cuelga de
// ella como pago parcial. Las reglas, decididas con Darío el 28-sep-2026:
//
//   - Cada transferencia paga **el sueldo más viejo que se le deba** al empleado (Darío, 2-oct-2026:
//     "cuando ya hay liquidación, se imputan los pagos registrados correspondientes a ese sueldo y la
//     diferencia es saldo a pagar"). Una que entra el 2-oct con septiembre liquidado e impago paga
//     septiembre, aunque el Monitor la anote para octubre por su fecha. Sólo si no se debe nada
//     queda esperando la próxima nómina.
//   - ⛔ Pero sólo hasta UN mes atrás: el sueldo de su mes o el del anterior. Una deuda más vieja
//     suele ser un sueldo pagado que quedó sin marcar (el 2-oct una transferencia fue a parar a un
//     abril "impago" de Agustina Piriz); eso se arregla a mano, no con la plata de un adelanto.
//   - Si se adelantó más que el sueldo, **lo que sobra pasa al mes siguiente**: queda pendiente y lo
//     toma la próxima nómina que se liquide.
//   - Lo ya aplicado no se guarda en ningún lado: se cuenta de los pagos con `adelanto_id`. Por eso
//     esta función recibe los pagos existentes y devuelve sólo lo que FALTA escribir.
//
// ⛔ Un pago no puede caer en un mes cerrado: el adelanto queda pendiente y se avisa.

export type Adelanto = {
  /** El `operacion_id` del compromiso en el Monitor. Es lo que se guarda en `pagos.adelanto_id`. */
  id: string
  monto: number
  /** Qué día entró la transferencia (AAAA-MM-DD). Es la fecha del pago en el ledger. */
  fecha: string
  /** El mes de sueldo que anotó el Monitor (AAAA-MM). Informativo: el destino lo decide la deuda más vieja. */
  mes: string
  cliente_nombre: string
  cliente_id: string | null
}

export type NominaDeAdelantos = {
  id: string
  mes: string
  neto: number
  /** Todo lo pagado a esta nómina, venga o no de un adelanto. */
  pagado: number
}

export type PagoDeAdelanto = { adelanto_id: string; monto: number }

export type Enganche = { adelanto: Adelanto; nominaId: string; mes: string; monto: number }

export type PlanAdelantos = {
  enganches: Enganche[]
  /** Lo que queda de cada adelanto sin nómina donde entrar (todavía no se liquidó, o se pasó). */
  pendientes: { adelanto: Adelanto; restante: number }[]
  /** Adelantos que no se pueden escribir porque su fecha cae en un mes ya cerrado. */
  bloqueados: { adelanto: Adelanto; restante: number }[]
}

const centavos = (n: number) => Math.round(n * 100) / 100

/** El mes anterior a `mes` (AAAA-MM). */
function mesAnterior(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}

export function planAdelantos(
  adelantos: Adelanto[],
  nominas: NominaDeAdelantos[],
  pagos: PagoDeAdelanto[],
  /** El último mes cerrado (AAAA-MM), o null. */
  ultimoMesCerrado: string | null,
): PlanAdelantos {
  const aplicado = new Map<string, number>()
  for (const p of pagos) aplicado.set(p.adelanto_id, (aplicado.get(p.adelanto_id) ?? 0) + Number(p.monto))

  // El más viejo primero: es el que se prometió antes y el que se tiene que ver saldado primero.
  const cola = [...adelantos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))
    .map((a) => ({ adelanto: a, restante: centavos(a.monto - (aplicado.get(a.id) ?? 0)) }))

  const bloqueados: PlanAdelantos['bloqueados'] = []
  const libres = cola.filter((c) => {
    if (c.restante <= 0.005) return false
    if (ultimoMesCerrado && c.adelanto.fecha.slice(0, 7) <= ultimoMesCerrado) {
      bloqueados.push(c)
      return false
    }
    return true
  })

  const enganches: Enganche[] = []
  for (const n of [...nominas].sort((a, b) => a.mes.localeCompare(b.mes))) {
    let saldo = centavos(n.neto - n.pagado)
    for (const c of libres) {
      if (saldo <= 0.005) break
      if (c.restante <= 0.005 || n.mes < mesAnterior(c.adelanto.fecha.slice(0, 7))) continue
      const monto = centavos(Math.min(c.restante, saldo))
      enganches.push({ adelanto: c.adelanto, nominaId: n.id, mes: n.mes, monto })
      c.restante = centavos(c.restante - monto)
      saldo = centavos(saldo - monto)
    }
  }

  return {
    enganches,
    pendientes: libres.filter((c) => c.restante > 0.005),
    bloqueados,
  }
}
