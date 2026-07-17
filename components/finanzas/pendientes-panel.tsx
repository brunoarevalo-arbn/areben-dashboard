import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { PendientesClient } from '@/components/finanzas/pendientes-client'
import { esCuentaCorriente } from '@/lib/cuentas-corrientes'

export async function PendientesPanel() {
  const supabase = await createClient()
  const mesActual = getCurrentMonth()
  const hoy = new Date().toISOString().split('T')[0]

  const [
    { data: gastosPendientes },
    { data: cheques },
    { data: pagosCtaCte },
    { data: comprasCtaCte },
    { data: cuotas },
    { data: instrumentos },
    { data: saldosCuentasMes },
    { data: cuentasBancarias },
    { data: tarjetas },
    { data: proveedores },
    { data: cuotasPlanAfip },
    { data: cuotasPrestamo },
    { data: retirosProgramados },
  ] = await Promise.all([
    // Gastos NO pagados de los últimos 12 meses (escala con el tiempo de uso).
    // Excluye los pagados con TARJETA: su salida de cash vive en el "Pago TC..."
    // consolidado, no acá. Esta vista es de tesorería, no contable.
    supabase
      .from('gastos')
      .select('id, concepto, categoria, monto, monto_neto, moneda, fecha_pago, mes, estado, cuenta_id, medio_pago, recurrente_id, recurrente:gastos_recurrentes(notas, concepto, dia_vencimiento, tipo_mes)')
      .neq('estado', 'PAGADO')
      .neq('estado', 'DEVENGADO')
      .or('medio_pago.is.null,medio_pago.neq.TARJETA')
      .gte('mes', (() => {
        const d = new Date()
        d.setMonth(d.getMonth() - 12)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      })())
      .order('fecha_pago', { ascending: true, nullsFirst: false })
      .limit(500),
    // Cheques no debitados: ventana ±6 meses para no traer históricos infinitos
    (() => {
      const desde = new Date(); desde.setMonth(desde.getMonth() - 6)
      const desdeStr = desde.toISOString().split('T')[0]
      return supabase
        .from('pagos')
        .select('*, compra:compras(descripcion, proveedor:proveedores(nombre))')
        .in('instrumento', ['CHEQUE_FISICO', 'ECHEQ'])
        .eq('debitado', false)
        .gte('fecha_emision', desdeStr)
        .order('fecha_vencimiento', { ascending: true })
        .limit(300)
    })(),
    // Pagos a cta cte / a plazo no debitados (excepto cheques) — últimos 6 meses
    (() => {
      const desde = new Date(); desde.setMonth(desde.getMonth() - 6)
      const desdeStr = desde.toISOString().split('T')[0]
      return supabase
        .from('pagos')
        .select('*, compra:compras(descripcion, proveedor:proveedores(nombre))')
        .in('instrumento', ['CUENTA_CORRIENTE', 'TRANSFERENCIA'])
        .eq('debitado', false)
        .gte('fecha_emision', desdeStr)
        .not('fecha_vencimiento', 'is', null)
        .order('fecha_vencimiento', { ascending: true })
        .limit(300)
    })(),
    // Compras con saldo pendiente — últimos 12 meses
    (() => {
      const desde = new Date(); desde.setMonth(desde.getMonth() - 12)
      const desdeStr = desde.toISOString().split('T')[0]
      return supabase
        .from('compras')
        .select('*, proveedor:proveedores(nombre)')
        .gt('saldo_pendiente', 0)
        .neq('estado', 'PAGADO')
        .gte('fecha', desdeStr)
        .order('fecha', { ascending: true })
        .limit(200)
    })(),
    // Cuotas de tarjeta no pagadas — próximos 24 meses + atrasadas últimos 6
    (() => {
      const desde = new Date(); desde.setMonth(desde.getMonth() - 6)
      const desdeMes = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}`
      const hasta = new Date(); hasta.setMonth(hasta.getMonth() + 24)
      const hastaMes = `${hasta.getFullYear()}-${String(hasta.getMonth() + 1).padStart(2, '0')}`
      return supabase
        .from('cuotas_tarjeta')
        .select('*, tarjeta:tarjetas_credito(nombre, banco)')
        .eq('pagada', false)
        .gte('mes_vencimiento', desdeMes)
        .lte('mes_vencimiento', hastaMes)
        .order('mes_vencimiento', { ascending: true })
        .limit(500)
    })(),
    supabase
      .from('instrumentos_inversion')
      .select('*, inversor:inversores(nombre)')
      .eq('estado', 'activo')
      .not('fecha_fin', 'is', null),
    supabase
      .from('saldos_cuentas')
      .select('mes, saldo_ars, saldo_usd, cuenta:cuentas_bancarias(activo)')
      .eq('mes', mesActual),
    supabase.from('cuentas_bancarias').select('id, nombre, banco, titular:cuentas_titulares(nombre)').eq('activo', true).order('banco'),
    supabase.from('tarjetas_credito').select('id, nombre, banco').eq('activo', true).order('banco'),
    supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    // Cuotas de planes AFIP no pagadas — ventana ±6 meses pasado + 24 meses futuro
    (() => {
      const dDesde = new Date(); dDesde.setMonth(dDesde.getMonth() - 6)
      const desdeFecha = dDesde.toISOString().split('T')[0]
      const dHasta = new Date(); dHasta.setMonth(dHasta.getMonth() + 24)
      const hastaFecha = dHasta.toISOString().split('T')[0]
      return supabase
        .from('plan_afip_cuotas')
        .select('*, plan:planes_afip!inner(id, nombre, numero_plan, cuenta_debito_id, estado)')
        .eq('pagada', false)
        .eq('plan.estado', 'ACTIVO')
        .gte('fecha_vencimiento', desdeFecha)
        .lte('fecha_vencimiento', hastaFecha)
        .order('fecha_vencimiento', { ascending: true })
        .limit(500)
    })(),
    // Cuotas de préstamos no pagadas (solo de préstamos ACTIVOS)
    (() => {
      const dDesde = new Date(); dDesde.setMonth(dDesde.getMonth() - 6)
      const desdeFecha = dDesde.toISOString().split('T')[0]
      const dHasta = new Date(); dHasta.setMonth(dHasta.getMonth() + 36)
      const hastaFecha = dHasta.toISOString().split('T')[0]
      return supabase
        .from('prestamo_cuotas')
        .select('*, prestamo:prestamos!inner(id, nombre, acreedor, moneda, cuenta_pago_id, estado)')
        .eq('pagada', false)
        .eq('prestamo.estado', 'ACTIVO')
        .gte('fecha_vencimiento', desdeFecha)
        .lte('fecha_vencimiento', hastaFecha)
        .order('fecha_vencimiento', { ascending: true })
        .limit(500)
    })(),
    // Retiros de socios PROGRAMADOS (a futuro, todavía no efectivizados)
    supabase
      .from('retiros_socios')
      .select('id, socio, socio_id, monto_pesos, monto_usd, fecha_programada, fecha, categoria:categorias_retiro(nombre, emoji)')
      .eq('estado', 'PROGRAMADO')
      .order('fecha_programada', { ascending: true }),
  ])

  // Saldo total actual de Tesorería
  const saldosActivos = (saldosCuentasMes ?? []).filter((s) => {
    const cuenta = (s.cuenta ?? null) as unknown as { activo: boolean } | null
    return cuenta?.activo !== false
  })
  const saldoActualARS = saldosActivos.reduce((s, x) => s + Number(x.saldo_ars ?? 0), 0)
  const saldoActualUSD = saldosActivos.reduce((s, x) => s + Number(x.saldo_usd ?? 0), 0)

  // Filtrar instrumentos que vencen en ≤ 30 días
  const limite = new Date()
  limite.setDate(limite.getDate() + 30)
  const limiteStr = limite.toISOString().split('T')[0]
  const instrumentosProximos = (instrumentos ?? []).filter((i) =>
    i.fecha_fin && i.fecha_fin <= limiteStr && i.fecha_fin >= hoy
  )

  // Compras con saldo pendiente que ya tienen pagos en cta_cte programados (no las duplico)
  const compraIdsConPagosCtaCte = new Set((pagosCtaCte ?? []).map((p) => p.compra_id).filter(Boolean))
  const comprasCtaCteSinPlanPago = (comprasCtaCte ?? []).filter((c) => !compraIdsConPagosCtaCte.has(c.id))

  // Para pagos paid-on-commit (tipo_origen=GASTO), traer info del gasto para mostrar contexto
  const gastoIdsEnPagos = new Set<string>([
    ...(cheques ?? []).filter((p) => p.tipo_origen === 'GASTO' && p.origen_id).map((p) => p.origen_id as string),
    ...(pagosCtaCte ?? []).filter((p) => p.tipo_origen === 'GASTO' && p.origen_id).map((p) => p.origen_id as string),
  ])
  const gastosByPagoOrigen = new Map<string, { concepto: string; categoria: string }>()
  if (gastoIdsEnPagos.size > 0) {
    const { data: gastosLookup } = await supabase
      .from('gastos')
      .select('id, concepto, categoria')
      .in('id', Array.from(gastoIdsEnPagos))
    for (const g of gastosLookup ?? []) {
      gastosByPagoOrigen.set(g.id, { concepto: g.concepto, categoria: g.categoria })
    }
  }
  // Enriquecer cheques y pagosCtaCte con info del gasto
  const enriquecerConGasto = <T extends { tipo_origen: string; origen_id: string | null }>(p: T) => {
    if (p.tipo_origen === 'GASTO' && p.origen_id) {
      const g = gastosByPagoOrigen.get(p.origen_id)
      if (g) return { ...p, gasto: g }
    }
    return p
  }
  const chequesConGasto = (cheques ?? []).map(enriquecerConGasto)
  const pagosCtaCteConGasto = (pagosCtaCte ?? []).map(enriquecerConGasto)

  // Pagos parciales del ledger unificado para gastos y cuotas (para mostrar saldo real)
  const gastoIds = (gastosPendientes ?? []).map((g) => g.id)
  const cuotaIds = (cuotas ?? []).map((c) => c.id)

  const pagosByGasto = new Map<string, number>()
  const pagosByCuota = new Map<string, number>()

  if (gastoIds.length > 0) {
    const { data } = await supabase
      .from('pagos')
      .select('origen_id, monto')
      .eq('tipo_origen', 'GASTO')
      .in('origen_id', gastoIds)
    for (const p of data ?? []) {
      if (!p.origen_id) continue
      pagosByGasto.set(p.origen_id, (pagosByGasto.get(p.origen_id) ?? 0) + Number(p.monto))
    }
  }
  if (cuotaIds.length > 0) {
    const { data } = await supabase
      .from('pagos')
      .select('origen_id, monto')
      .eq('tipo_origen', 'CUOTA')
      .in('origen_id', cuotaIds)
    for (const p of data ?? []) {
      if (!p.origen_id) continue
      pagosByCuota.set(p.origen_id, (pagosByCuota.get(p.origen_id) ?? 0) + Number(p.monto))
    }
  }

  // Enriquecer con saldos pendientes y filtrar los que quedaron en 0.
  // Las Cuentas Corrientes (conceptos curados sin fecha fija) NO se excluyen: se separan en
  // `gastosCC` para mostrarlas en su propio desplegable dentro de Pendientes (ver lib/cuentas-corrientes).
  const gastosConSaldoTodos = (gastosPendientes ?? [])
    .map((g) => {
      const pagado = pagosByGasto.get(g.id) ?? 0
      const saldo = Math.max(0, Number(g.monto) - pagado)
      // Supabase devuelve la relación como array; nos quedamos con el primer elemento
      const recurrenteArr = (g as unknown as { recurrente?: { notas: string | null; concepto: string | null }[] }).recurrente
      const recurrente = Array.isArray(recurrenteArr) && recurrenteArr.length > 0 ? recurrenteArr[0] : null
      const esCC = esCuentaCorriente({
        concepto: g.concepto,
        recurrente_id: (g as unknown as { recurrente_id?: string | null }).recurrente_id,
        recurrenteConcepto: recurrente?.concepto ?? null,
      })
      return { ...g, total_pagado: pagado, saldo_pendiente: saldo, recurrente, _esCC: esCC }
    })
    .filter((g) => g.saldo_pendiente > 0.01)
  const gastosConSaldo = gastosConSaldoTodos.filter((g) => !g._esCC)
  const gastosCC = gastosConSaldoTodos.filter((g) => g._esCC)

  const cuotasConSaldo = (cuotas ?? []).map((c) => {
    const pagado = pagosByCuota.get(c.id) ?? 0
    const saldo = Math.max(0, Number(c.monto_cuota) - pagado)
    return { ...c, total_pagado: pagado, saldo_pendiente: saldo }
  }).filter((c) => c.saldo_pendiente > 0.01)

  // Pagos parciales (ledger) contra cuotas de préstamo → saldo real por cuota
  const cuotaPrestamoIds = (cuotasPrestamo ?? []).map((c) => c.id)
  const pagosByCuotaPrestamo = new Map<string, number>()
  if (cuotaPrestamoIds.length > 0) {
    const { data } = await supabase
      .from('pagos')
      .select('origen_id, monto')
      .eq('tipo_origen', 'PRESTAMO')
      .in('origen_id', cuotaPrestamoIds)
    for (const p of data ?? []) {
      if (!p.origen_id) continue
      pagosByCuotaPrestamo.set(p.origen_id, (pagosByCuotaPrestamo.get(p.origen_id) ?? 0) + Number(p.monto))
    }
  }
  const cuotasPrestamoConSaldo = (cuotasPrestamo ?? []).map((c) => {
    const pagado = pagosByCuotaPrestamo.get(c.id) ?? 0
    const saldo = Math.max(0, Number(c.monto_total) - pagado)
    return { ...c, total_pagado: pagado, saldo_pendiente: saldo }
  }).filter((c) => c.saldo_pendiente > 0.01)

  return (
    <PendientesClient
      mesActual={mesActual}
      hoy={hoy}
      saldoActualARS={saldoActualARS}
      saldoActualUSD={saldoActualUSD}
      cheques={chequesConGasto}
      pagosCtaCte={pagosCtaCteConGasto}
      comprasSinPlanPago={comprasCtaCteSinPlanPago}
      cuotas={cuotasConSaldo}
      instrumentosProximos={instrumentosProximos}
      gastosPendientes={gastosConSaldo}
      gastosCC={gastosCC}
      cuentas={(cuentasBancarias ?? []) as unknown as Parameters<typeof PendientesClient>[0]['cuentas']}
      tarjetas={tarjetas ?? []}
      proveedores={proveedores ?? []}
      cuotasPlanAfip={cuotasPlanAfip ?? []}
      cuotasPrestamo={cuotasPrestamoConSaldo}
      retirosProgramados={(retirosProgramados ?? []) as unknown as Parameters<typeof PendientesClient>[0]['retirosProgramados']}
    />
  )
}
