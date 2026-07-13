import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { calcularReposicion } from '@/app/actions/finanzas'
import { CierreMesClient } from '@/components/finanzas/cierre-mes-client'

// Corte "ledger limpio": desde este mes en adelante todo pago queda con fecha en el ledger,
// así que el pasivo de compras se netea puro por fecha_emision. Los meses ANTERIORES (histórico
// ya reportado) conservan el guardarraíl de "evidencia" para no alterar cierres pasados.
// ⚠️ Ajustar si cambia el mes desde el que la carga de pagos con fecha es confiable.
const CORTE_LEDGER_LIMPIO = '2026-07-01'

export default async function CierreMesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? await getMesActivo()

  // Mes anterior (para PN comparativo)
  const [y, m] = mes.split('-').map(Number)
  const prevDate = new Date(y, m - 2, 1)
  const mesAnterior = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
  // Último día del mes del cierre — fecha de corte por fecha (producción, cheques, pagos a plazo)
  const mesFin = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` // ej '2026-05-31'
  // Piso para traer compras/gastos a evaluar al corte (18 meses atrás — acota volumen; lo más viejo se asume saldado)
  const floorDate = new Date(y, m - 1 - 18, 1)
  const comprasDesde = `${floorDate.getFullYear()}-${String(floorDate.getMonth() + 1).padStart(2, '0')}-01`
  const gastosDesde = `${floorDate.getFullYear()}-${String(floorDate.getMonth() + 1).padStart(2, '0')}`

  const supabase = await createClient()

  const [
    { data: cierreActual },
    { data: cierreAnterior },
    { data: titulares },
    { data: cuentas },
    { data: saldosMes },
    { data: tcMes },
    { data: comprasPendientes },
    { data: gastosPendientes },
    { data: gastosRecurrentes },
    { data: cuotasPendientes },
    { data: retirosMes },
    { data: categorias },
    { data: activosManuales },
    { data: cuentasPatrim },
    { data: saldosPatrim },
    { data: chequesPendientes },
    { data: pagosCtaCtePendientes },
    { data: instrumentosActivos },
    { data: saldosInversiones },
    { data: produccionEnProceso },
    { data: ccCuentas },
    { data: ccMovimientos },
    { data: prestamos },
    { data: planesAfip },
  ] = await Promise.all([
    supabase.from('cierres_mensuales').select('*').eq('mes', mes).maybeSingle(),
    supabase.from('cierres_mensuales').select('*').eq('mes', mesAnterior).maybeSingle(),
    supabase.from('cuentas_titulares').select('*').eq('activo', true).order('nombre'),
    supabase
      .from('cuentas_bancarias')
      .select('*, titular:cuentas_titulares(nombre)')
      .eq('activo', true)
      .order('banco'),
    supabase.from('saldos_cuentas').select('cuenta_id, saldo_ars, saldo_usd').eq('mes', mes),
    supabase.from('tipos_cambio_mes').select('tipo_cambio').eq('mes', mes).maybeSingle(),
    // Compras hasta el corte (con su saldo de hoy para saber si siguen impagas). El saldo AL CORTE
    // se calcula después con los pagos ≤ mesFin; solo cuentan las con evidencia de estar impagas al corte.
    supabase
      .from('compras')
      .select('id, descripcion, fecha, monto_total, saldo_pendiente, moneda, proveedor:proveedores(nombre)')
      .lte('fecha', mesFin)
      .gte('fecha', comprasDesde)
      .order('fecha', { ascending: false })
      .limit(2000),
    // Gastos hasta el corte que NO estaban saldados al corte. DEVENGADO (provisión) se excluye.
    // Un PAGADO recién sale si su fecha_pago ≤ mesFin (pagado hasta el corte); si se pagó DESPUÉS,
    // sigue siendo pasivo del mes. Los parcialmente pagados por el ledger se netean después (≤ mesFin).
    supabase
      .from('gastos')
      .select('id, concepto, categoria, monto, monto_neto, moneda, fecha_pago, fecha, mes, medio_pago, tarjeta_id, recurrente_id, estado')
      .neq('estado', 'DEVENGADO')
      .gte('mes', gastosDesde)
      .lte('mes', mes)
      .or(`estado.neq.PAGADO,fecha_pago.gt.${mesFin}`)
      .order('mes', { ascending: false })
      .limit(1500),
    // Recurrentes (para calcular el vencimiento real de los gastos y unificar los repetidos)
    supabase.from('gastos_recurrentes').select('id, dia_vencimiento, tipo_mes'),
    // Cuotas de tarjeta: pasivo del mes en que se CONSUMIÓ (mes_cierre), si no estaba pagada al corte.
    // (No por mes_vencimiento ni por el tilde de hoy: el consumo de mayo que se paga en junio es pasivo de mayo.)
    supabase
      .from('cuotas_tarjeta')
      .select('id, concepto, monto_cuota, mes_cierre, mes_vencimiento, origen_tipo, origen_id, tarjeta:tarjetas_credito(nombre, banco)')
      .lte('mes_cierre', mes)
      .or(`pagada.eq.false,fecha_pago.gt.${mesFin}`)
      .order('mes_vencimiento'),
    supabase
      .from('retiros_socios')
      .select('*, categoria:categorias_retiro(*)')
      .eq('mes', mes),
    supabase.from('categorias_retiro').select('*').eq('activo', true).order('orden'),
    supabase.from('activos_manuales').select('*, titular:cuentas_titulares(*)').eq('mes', mes),
    supabase.from('cuentas_patrimoniales').select('*').eq('activo', true).order('orden').order('nombre'),
    supabase.from('saldos_cuentas_patrim').select('*').eq('mes', mes),
    // Cheques emitidos pendientes de acreditación
    supabase
      .from('pagos')
      .select('id, monto, moneda, fecha_emision, fecha_vencimiento, instrumento, numero_cheque, banco_emisor, compra:compras(descripcion, proveedor:proveedores(nombre))')
      .in('instrumento', ['CHEQUE_FISICO', 'ECHEQ'])
      // Pasivo del mes = emitido ≤ fin de mes y no cobrado a esa fecha (por fecha, no por el tilde de HOY)
      .lte('fecha_emision', mesFin)
      .or(`acreditado.eq.false,fecha_acreditacion.gt.${mesFin}`)
      .order('fecha_vencimiento', { ascending: true }),
    // Pagos a plazo (cta cte / transferencia) no efectivizados
    supabase
      .from('pagos')
      .select('id, monto, moneda, fecha_emision, fecha_vencimiento, instrumento, compra:compras(descripcion, proveedor:proveedores(nombre))')
      .in('instrumento', ['CUENTA_CORRIENTE', 'TRANSFERENCIA'])
      // Mismo criterio por fecha que los cheques (no por el tilde de HOY)
      .lte('fecha_emision', mesFin)
      .or(`acreditado.eq.false,fecha_acreditacion.gt.${mesFin}`)
      .not('fecha_vencimiento', 'is', null)
      .order('fecha_vencimiento', { ascending: true }),
    // Inversiones de terceros activas (deuda con inversores)
    supabase
      .from('instrumentos_inversion')
      .select('*, inversor:inversores(nombre)')
      .eq('estado', 'activo'),
    // Saldo de cierre del mes para esos instrumentos (ya incluye el interés acumulado)
    supabase.from('periodos_instrumento').select('instrumento_id, saldo_cierre').eq('mes', mes),
    // Producción en proceso (activo): compras de producción todavía no pasadas a stock
    supabase
      .from('compras')
      .select('id, descripcion, monto_total, iva, moneda, categoria_produccion, proveedor:proveedores(nombre)')
      .eq('negocio', 'PRODUCCION')
      .lte('fecha', mesFin)                                    // comprada hasta fin de mes
      .or(`fecha_pasaje.is.null,fecha_pasaje.gt.${mesFin}`),   // sin pasar, o pasada después del cierre
    // Cuentas corrientes manuales (activas) + sus movimientos hasta el corte (foto al 31)
    supabase.from('cc_cuentas').select('id, nombre, naturaleza, moneda').eq('activo', true).order('nombre'),
    supabase.from('cc_movimientos').select('cuenta_id, fecha, tipo, monto').lte('fecha', mesFin),
    // Préstamos bancarios y planes AFIP existentes al corte (el capital pendiente = pasivo del cierre)
    supabase.from('prestamos').select('id, nombre, acreedor, moneda').lte('fecha_inicio', mesFin),
    supabase.from('planes_afip').select('id, nombre').lte('fecha_inicio', mesFin),
  ])

  // ──────────────────────────────────────────────────────────────
  // Resumen "Gastos financieros del mes" (mig 033 + 034)
  // ──────────────────────────────────────────────────────────────
  // 1) Gastos auto-generados del mes agrupados por subcategoría
  const { data: gastosFinDelMes } = await supabase
    .from('gastos')
    .select('monto, subcategoria:gastos_subcategorias(slug, nombre)')
    .eq('mes', mes)
    .eq('auto_generado', true)
    .eq('generado_desde', 'INVERSION_CIERRE')

  const gastosFinPorSubcategoria = new Map<string, { nombre: string; total: number; count: number }>()
  for (const g of gastosFinDelMes ?? []) {
    const sub = Array.isArray(g.subcategoria) ? g.subcategoria[0] : g.subcategoria
    if (!sub) continue
    const slug = sub.slug as string
    const prev = gastosFinPorSubcategoria.get(slug) ?? { nombre: sub.nombre as string, total: 0, count: 0 }
    prev.total += Number(g.monto)
    prev.count += 1
    gastosFinPorSubcategoria.set(slug, prev)
  }

  const totalGastosFin = Array.from(gastosFinPorSubcategoria.values()).reduce((s, v) => s + v.total, 0)

  // 2) Capital pendiente de créditos bancarios (saldo_cierre de instrumentos tipo=CREDITO_BANCARIO en el mes)
  const creditosIds = (instrumentosActivos ?? [])
    .filter((i) => (i as { tipo?: string }).tipo === 'CREDITO_BANCARIO')
    .map((i) => i.id)

  let capitalPendienteCreditos = 0
  if (creditosIds.length > 0) {
    const saldosCreditos = (saldosInversiones ?? []).filter((s) => creditosIds.includes(s.instrumento_id))
    capitalPendienteCreditos = saldosCreditos.reduce((acc, s) => acc + Number(s.saldo_cierre ?? 0), 0)
  }

  const resumenGastosFinancieros = {
    porSubcategoria: Array.from(gastosFinPorSubcategoria.entries()).map(([slug, v]) => ({
      slug,
      nombre: v.nombre,
      total: v.total,
      count: v.count,
    })),
    total: totalGastosFin,
    capitalPendienteCreditos,
  }

  // Saldo de cada compra AL CORTE. Muchas compras se saldan sin dejar un pago en el ledger (no hay
  // fecha de pago), así que NO se puede reconstruir "cuándo se pagó" sólo con pagos. Criterio:
  //   pasivo al corte = monto_total − Σ pagos(fecha_emision ≤ mesFin), PERO sólo si hay evidencia de que
  //   seguía impaga al corte: (a) todavía debe hoy (saldo_pendiente > 0), o (b) hubo un pago DESPUÉS del corte.
  // Así no contamos como deuda las que ya estaban pagadas al corte pero sin rastro de pago.
  const compraIds = (comprasPendientes ?? []).map((c) => c.id)
  const pagadoCorte = new Map<string, number>()
  const tuvoPagoDespues = new Set<string>()
  if (compraIds.length > 0) {
    for (let i = 0; i < compraIds.length; i += 300) {
      const { data: pagosCompra } = await supabase
        .from('pagos')
        .select('compra_id, monto, fecha_emision')
        .in('compra_id', compraIds.slice(i, i + 300))
      for (const p of pagosCompra ?? []) {
        if (!p.compra_id) continue
        if ((p.fecha_emision ?? '') <= mesFin) pagadoCorte.set(p.compra_id, (pagadoCorte.get(p.compra_id) ?? 0) + Number(p.monto))
        else tuvoPagoDespues.add(p.compra_id)
      }
    }
  }
  // Desde el corte "ledger limpio": todo pago tiene fecha, así que el saldo al corte se netea
  // puro por fecha_emision (sin el guardarraíl de evidencia, que solo hacía falta cuando había
  // compras pagadas sin rastro). Antes del corte se mantiene el guardarraíl (histórico congelado).
  const ledgerLimpio = mesFin >= CORTE_LEDGER_LIMPIO
  const comprasNorm = (comprasPendientes ?? [])
    .map((c) => {
      const saldoCorte = Math.round((Number(c.monto_total) - (pagadoCorte.get(c.id) ?? 0)) * 100) / 100
      const impagaAlCorte = Number(c.saldo_pendiente) > 0.01 || tuvoPagoDespues.has(c.id)
      return {
        ...c,
        saldo_pendiente: ledgerLimpio ? saldoCorte : (impagaAlCorte ? saldoCorte : 0),
        proveedor: Array.isArray(c.proveedor) ? c.proveedor[0] ?? null : c.proveedor,
      }
    })
    .filter((c) => c.saldo_pendiente > 0.01)

  const produccionNorm = (produccionEnProceso ?? []).map((c) => ({
    ...c,
    proveedor: Array.isArray(c.proveedor) ? c.proveedor[0] ?? null : c.proveedor,
  }))

  // Restar pagos parciales (ledger unificado) al monto de los gastos pendientes.
  // Cubre tanto gastos pagados a cuenta directamente (tipo_origen=GASTO)
  // como gastos vinculados a nóminas con adelantos (vía nomina_mensual.gasto_pendiente_id → tipo_origen=NOMINA).
  const gastoIds = (gastosPendientes ?? [])
    .map((g) => g.id)
    .filter(Boolean)

  const pagosParcialesByGasto = new Map<string, number>()

  if (gastoIds.length > 0) {
    // (a) Pagos directos al gasto
    const { data: pagosGasto } = await supabase
      .from('pagos')
      .select('origen_id, monto')
      .eq('tipo_origen', 'GASTO')
      .in('origen_id', gastoIds)
      .lte('fecha_emision', mesFin)
    for (const p of pagosGasto ?? []) {
      if (!p.origen_id) continue
      pagosParcialesByGasto.set(p.origen_id, (pagosParcialesByGasto.get(p.origen_id) ?? 0) + Number(p.monto))
    }

    // (b) Pagos a la nómina vinculada → afectan al gasto-sueldo asociado
    const { data: nominasVinculadas } = await supabase
      .from('nomina_mensual')
      .select('id, gasto_pendiente_id')
      .in('gasto_pendiente_id', gastoIds)
    const nominaIds = (nominasVinculadas ?? []).map((n) => n.id)
    const gastoByNomina = new Map<string, string>()
    for (const n of nominasVinculadas ?? []) {
      if (n.gasto_pendiente_id) gastoByNomina.set(n.id, n.gasto_pendiente_id)
    }
    if (nominaIds.length > 0) {
      const { data: pagosNomina } = await supabase
        .from('pagos')
        .select('origen_id, monto')
        .eq('tipo_origen', 'NOMINA')
        .in('origen_id', nominaIds)
        .lte('fecha_emision', mesFin)
      for (const p of pagosNomina ?? []) {
        if (!p.origen_id) continue
        const gid = gastoByNomina.get(p.origen_id)
        if (!gid) continue
        pagosParcialesByGasto.set(gid, (pagosParcialesByGasto.get(gid) ?? 0) + Number(p.monto))
      }
    }
  }

  // Aplicar la resta y filtrar gastos completamente cubiertos por adelantos
  const gastosNetos = (gastosPendientes ?? [])
    .map((g) => {
      const adelanto = pagosParcialesByGasto.get(g.id) ?? 0
      if (adelanto <= 0) return g
      const restante = Math.max(0, Number(g.monto) - adelanto)
      const restanteNeto = Math.max(0, Number(g.monto_neto || g.monto) - adelanto)
      return { ...g, monto: restante, monto_neto: restanteNeto }
    })
    .filter((g) => Number(g.monto) > 0.01)

  // ── Valor de inventario (arranque + compras − CMV) inyectado en las cuentas INVENTARIO ──
  // BDI → INV-BDI; ZATTIA+STUNNED unificados en la cuenta de ZATTIA; STUNNED consolidado → 0.
  const invCuentas = (cuentasPatrim ?? []).filter((c) => c.tipo === 'INVENTARIO')
  let saldosPatrimFinal = saldosPatrim ?? []
  const movimientoInv: Record<string, { saldoInicial: number; compras: number; cmv: number }> = {}
  if (invCuentas.length) {
    const [repoBDI, repoZS] = await Promise.all([
      calcularReposicion('BDI', mes),
      calcularReposicion('ZATTIA_STUNNED', mes),
    ])
    const cero = { arranque: 0, comprasNetas: 0, cmv: 0, saldo: 0, detalle: [] as { mes: string; cmv: number; comprasNetas: number }[] }
    const repoPorMarca = (marca: string | null) =>
      marca === 'BDI' ? repoBDI : marca === 'ZATTIA' ? repoZS : cero
    const byId = new Map(saldosPatrimFinal.map((s) => [s.cuenta_id, { ...s }]))
    for (const c of invCuentas) {
      const r = repoPorMarca(c.marca ?? null)
      // Movimiento DEL MES (saldo inicial = cierre del mes anterior)
      const mm = r.detalle.find((d) => d.mes === mes)
      const comprasMes = mm?.comprasNetas ?? 0
      const cmvMes = mm?.cmv ?? 0
      const saldoInicial = Math.round((r.saldo - (comprasMes - cmvMes)) * 100) / 100
      movimientoInv[c.id] = { saldoInicial, compras: comprasMes, cmv: cmvMes }
      const row = byId.get(c.id)
      if (row) { row.saldo_cierre = r.saldo; row.saldo_inicio = saldoInicial; row.movimiento = comprasMes - cmvMes }
      else byId.set(c.id, { cuenta_id: c.id, mes, saldo_inicio: saldoInicial, movimiento: comprasMes - cmvMes, saldo_cierre: r.saldo } as (typeof saldosPatrimFinal)[number])
    }
    saldosPatrimFinal = [...byId.values()]
  }

  // ── Cuentas corrientes manuales: saldo a la fecha de corte (Σ DEUDA − Σ PAGO con fecha ≤ mesFin) ──
  // Clasificar en activo/pasivo × ARS/USD. naturaleza COBRAR=nos deben, PAGAR=les debemos; el signo del
  // saldo puede invertir la clasificación (si pagaron/cobraron de más).
  const ccSaldoPorCuenta = new Map<string, number>()
  for (const mv of ccMovimientos ?? []) {
    const delta = mv.tipo === 'DEUDA' ? Number(mv.monto) : -Number(mv.monto)
    ccSaldoPorCuenta.set(mv.cuenta_id, (ccSaldoPorCuenta.get(mv.cuenta_id) ?? 0) + delta)
  }
  let ccActivosArs = 0, ccActivosUsd = 0, ccPasivosArs = 0, ccPasivosUsd = 0
  const ccDetalle: { nombre: string; naturaleza: string; moneda: string; monto: number; esActivo: boolean }[] = []
  for (const c of ccCuentas ?? []) {
    const saldo = Math.round((ccSaldoPorCuenta.get(c.id) ?? 0) * 100) / 100
    if (Math.abs(saldo) < 0.01) continue
    const esActivo = (c.naturaleza === 'COBRAR') === (saldo >= 0)
    const monto = Math.abs(saldo)
    const usd = c.moneda === 'USD'
    if (esActivo) { if (usd) ccActivosUsd += monto; else ccActivosArs += monto }
    else { if (usd) ccPasivosUsd += monto; else ccPasivosArs += monto }
    ccDetalle.push({ nombre: c.nombre, naturaleza: c.naturaleza, moneda: c.moneda, monto, esActivo })
  }

  // ── Préstamos bancarios: capital pendiente al corte (cuotas no pagadas al 31), por moneda ──
  const prestamoIds = (prestamos ?? []).map((p) => p.id)
  const capPorPrestamo = new Map<string, number>()
  if (prestamoIds.length) {
    const { data: cuotasPr } = await supabase
      .from('prestamo_cuotas')
      .select('prestamo_id, capital, pagada, fecha_pago')
      .in('prestamo_id', prestamoIds)
    for (const c of cuotasPr ?? []) {
      const impaga = !c.pagada || (!!c.fecha_pago && c.fecha_pago > mesFin)
      if (impaga) capPorPrestamo.set(c.prestamo_id, (capPorPrestamo.get(c.prestamo_id) ?? 0) + Number(c.capital))
    }
  }
  const prestamosBancarios = (prestamos ?? [])
    .map((p) => ({ nombre: p.nombre, acreedor: p.acreedor, moneda: p.moneda, capital: Math.round((capPorPrestamo.get(p.id) ?? 0) * 100) / 100 }))
    .filter((p) => p.capital > 0.01)

  // ── Planes de pago AFIP: capital financiado pendiente al corte (ARS) ──
  const planIds = (planesAfip ?? []).map((p) => p.id)
  const capPorPlan = new Map<string, number>()
  if (planIds.length) {
    const { data: cuotasAfip } = await supabase
      .from('plan_afip_cuotas')
      .select('plan_afip_id, capital, pagada, fecha_pago')
      .in('plan_afip_id', planIds)
    for (const c of cuotasAfip ?? []) {
      const impaga = !c.pagada || (!!c.fecha_pago && c.fecha_pago > mesFin)
      if (impaga) capPorPlan.set(c.plan_afip_id, (capPorPlan.get(c.plan_afip_id) ?? 0) + Number(c.capital))
    }
  }
  const planesAfipPend = (planesAfip ?? [])
    .map((p) => ({ nombre: p.nombre, capital: Math.round((capPorPlan.get(p.id) ?? 0) * 100) / 100 }))
    .filter((p) => p.capital > 0.01)

  // Resultados acumulados: Σ resultado de los meses YA CERRADOS anteriores a este.
  // Es la composición del PN (memo informativo, no entra al arqueo).
  const { data: cierresCerrados } = await supabase
    .from('cierres_mensuales')
    .select('mes, resultado_ars')
    .eq('cerrado', true)
    .lt('mes', mes)
    .order('mes')
  const resultadosAcumuladosPrevios = (cierresCerrados ?? []).reduce((s, c) => s + Number(c.resultado_ars ?? 0), 0)

  // ── Validaciones del cierre (panel semáforo, solo lectura, no toca cálculo) ──
  const validaciones: { nivel: 'error' | 'warning' | 'info'; mensaje: string }[] = []
  // 1) Cuentas bancarias sin saldo cargado en el mes → suman $0 al activo
  const cuentasConSaldo = new Set((saldosMes ?? []).map((s) => s.cuenta_id))
  const cuentasSinSaldo = (cuentas ?? []).filter((c) => !cuentasConSaldo.has(c.id))
  if (cuentasSinSaldo.length > 0) {
    validaciones.push({
      nivel: 'warning',
      mensaje: `${cuentasSinSaldo.length} cuenta(s) sin saldo cargado en ${mes} (suman $0 al activo): ${cuentasSinSaldo.slice(0, 4).map((c) => c.nombre).join(', ')}${cuentasSinSaldo.length > 4 ? '…' : ''}.`,
    })
  }
  // 2) Mes anterior sin confirmar → el "resultado" se compara contra PN anterior = 0
  if (!cierreAnterior?.cerrado) {
    validaciones.push({
      nivel: 'warning',
      mensaje: `El mes anterior (${mesAnterior}) no está confirmado → el "resultado del mes" se mide contra PN anterior = 0, no es un delta real.`,
    })
  }
  // 3) Pagos programados (cheque/cta cte) vencidos hace +45 días y sin acreditar → probablemente ya se cobraron sin marcar
  const limVenc = new Date(y, m, 0); limVenc.setDate(limVenc.getDate() - 45)
  const limVencStr = limVenc.toISOString().split('T')[0]
  const progVencidos = [...(chequesPendientes ?? []), ...(pagosCtaCtePendientes ?? [])]
    .filter((p: { fecha_vencimiento?: string | null }) => p.fecha_vencimiento && p.fecha_vencimiento < limVencStr)
  if (progVencidos.length > 0) {
    validaciones.push({
      nivel: 'warning',
      mensaje: `${progVencidos.length} pago(s) programado(s) vencidos hace +45 días siguen sin acreditar. Si ya se cobraron, marcalos acreditados con la fecha real (sino inflan el pasivo).`,
    })
  }
  // 4) Posible doble conteo de sueldos: pasivo manual de sueldos + sueldos en gastos pendientes
  const pmActual = (Array.isArray(cierreActual?.pasivos_manuales) ? cierreActual.pasivos_manuales : []) as { descripcion?: string; monto?: number }[]
  const manualSueldo = pmActual.some((p) => /sueldo/i.test(p.descripcion ?? '') && Number(p.monto) > 0)
  const gastoSueldo = (gastosNetos ?? []).some((g: { categoria?: string }) => /sueldo/i.test(g.categoria ?? ''))
  if (manualSueldo && gastoSueldo) {
    validaciones.push({
      nivel: 'error',
      mensaje: 'Hay un pasivo manual de sueldos Y sueldos en Gastos pendientes → posible doble conteo. Revisá.',
    })
  }

  return (
    <CierreMesClient
      mes={mes}
      validaciones={validaciones}
      mesAnterior={mesAnterior}
      cierreActual={cierreActual}
      cierreAnterior={cierreAnterior}
      titulares={titulares ?? []}
      cuentas={(cuentas ?? []) as Parameters<typeof CierreMesClient>[0]['cuentas']}
      saldosMes={saldosMes ?? []}
      tcMesGlobal={tcMes?.tipo_cambio ?? null}
      comprasPendientes={comprasNorm as Parameters<typeof CierreMesClient>[0]['comprasPendientes']}
      produccionEnProceso={produccionNorm as Parameters<typeof CierreMesClient>[0]['produccionEnProceso']}
      gastosPendientes={gastosNetos}
      gastosRecurrentes={gastosRecurrentes ?? []}
      hoy={new Date().toISOString().slice(0, 10)}
      cuotasPendientes={(cuotasPendientes ?? []) as unknown as Parameters<typeof CierreMesClient>[0]['cuotasPendientes']}
      retirosMes={(retirosMes ?? []) as Parameters<typeof CierreMesClient>[0]['retirosMes']}
      categorias={categorias ?? []}
      activosManuales={(activosManuales ?? []) as Parameters<typeof CierreMesClient>[0]['activosManuales']}
      cuentasPatrim={cuentasPatrim ?? []}
      saldosPatrim={saldosPatrimFinal}
      movimientoInv={movimientoInv}
      chequesPendientes={(chequesPendientes ?? []) as unknown as Parameters<typeof CierreMesClient>[0]['chequesPendientes']}
      pagosCtaCtePendientes={(pagosCtaCtePendientes ?? []) as unknown as Parameters<typeof CierreMesClient>[0]['pagosCtaCtePendientes']}
      instrumentosActivos={(instrumentosActivos ?? []) as unknown as Parameters<typeof CierreMesClient>[0]['instrumentosActivos']}
      saldosInversiones={saldosInversiones ?? []}
      resumenGastosFinancieros={resumenGastosFinancieros}
      ccActivosArs={ccActivosArs}
      ccActivosUsd={ccActivosUsd}
      ccPasivosArs={ccPasivosArs}
      ccPasivosUsd={ccPasivosUsd}
      ccDetalle={ccDetalle}
      prestamosBancarios={prestamosBancarios}
      planesAfip={planesAfipPend}
      resultadosAcumuladosPrevios={resultadosAcumuladosPrevios}
      cierresCerrados={cierresCerrados ?? []}
    />
  )
}
