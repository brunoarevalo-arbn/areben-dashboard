import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { CierreMesClient } from '@/components/finanzas/cierre-mes-client'

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
    supabase
      .from('compras')
      .select('id, descripcion, fecha, monto_total, saldo_pendiente, moneda, proveedor:proveedores(nombre)')
      .gt('saldo_pendiente', 0)
      .neq('estado', 'PAGADO'),
    // Gastos no pagados — últimos 12 meses para no traer históricos infinitos
    (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 12)
      const desdeMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return supabase
        .from('gastos')
        .select('id, concepto, categoria, monto, monto_neto, moneda, fecha_pago, mes, medio_pago, tarjeta_id')
        .neq('estado', 'PAGADO')
        .neq('estado', 'DEVENGADO')
        .gte('mes', desdeMes)
        .order('fecha_pago', { ascending: true, nullsFirst: false })
        .limit(500)
    })(),
    // Todas las cuotas tarjeta no pagadas con vencimiento ≤ mes del cierre
    supabase
      .from('cuotas_tarjeta')
      .select('id, concepto, monto_cuota, mes_vencimiento, origen_tipo, origen_id, tarjeta:tarjetas_credito(nombre, banco)')
      .eq('pagada', false)
      .lte('mes_vencimiento', mes)
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
      .eq('acreditado', false)
      .order('fecha_vencimiento', { ascending: true }),
    // Pagos a plazo (cta cte / transferencia) no efectivizados
    supabase
      .from('pagos')
      .select('id, monto, moneda, fecha_emision, fecha_vencimiento, instrumento, compra:compras(descripcion, proveedor:proveedores(nombre))')
      .in('instrumento', ['CUENTA_CORRIENTE', 'TRANSFERENCIA'])
      .eq('acreditado', false)
      .not('fecha_vencimiento', 'is', null)
      .order('fecha_vencimiento', { ascending: true }),
    // Inversiones de terceros activas (deuda con inversores)
    supabase
      .from('instrumentos_inversion')
      .select('*, inversor:inversores(nombre)')
      .eq('estado', 'activo'),
    // Saldo de cierre del mes para esos instrumentos
    supabase.from('periodos_instrumento').select('instrumento_id, saldo_cierre').eq('mes', mes),
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

  // Normalizar el campo proveedor (Supabase a veces devuelve array para joins)
  const comprasNorm = (comprasPendientes ?? []).map((c) => ({
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

  return (
    <CierreMesClient
      mes={mes}
      mesAnterior={mesAnterior}
      cierreActual={cierreActual}
      cierreAnterior={cierreAnterior}
      titulares={titulares ?? []}
      cuentas={(cuentas ?? []) as Parameters<typeof CierreMesClient>[0]['cuentas']}
      saldosMes={saldosMes ?? []}
      tcMesGlobal={tcMes?.tipo_cambio ?? null}
      comprasPendientes={comprasNorm as Parameters<typeof CierreMesClient>[0]['comprasPendientes']}
      gastosPendientes={gastosNetos}
      cuotasPendientes={(cuotasPendientes ?? []) as unknown as Parameters<typeof CierreMesClient>[0]['cuotasPendientes']}
      retirosMes={(retirosMes ?? []) as Parameters<typeof CierreMesClient>[0]['retirosMes']}
      categorias={categorias ?? []}
      activosManuales={(activosManuales ?? []) as Parameters<typeof CierreMesClient>[0]['activosManuales']}
      cuentasPatrim={cuentasPatrim ?? []}
      saldosPatrim={saldosPatrim ?? []}
      chequesPendientes={(chequesPendientes ?? []) as unknown as Parameters<typeof CierreMesClient>[0]['chequesPendientes']}
      pagosCtaCtePendientes={(pagosCtaCtePendientes ?? []) as unknown as Parameters<typeof CierreMesClient>[0]['pagosCtaCtePendientes']}
      instrumentosActivos={(instrumentosActivos ?? []) as unknown as Parameters<typeof CierreMesClient>[0]['instrumentosActivos']}
      saldosInversiones={saldosInversiones ?? []}
      resumenGastosFinancieros={resumenGastosFinancieros}
    />
  )
}
