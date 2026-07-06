import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { NominaClient } from '@/components/rrhh/nomina-client'
import type { PagoParcialNomina } from '@/types/database'

export default async function NominaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? await getMesActivo()

  const supabase = await createClient()

  // Rango del mes para horas extras
  const desde = `${mes}-01`
  const f = new Date(desde + 'T00:00:00')
  const hasta = new Date(f.getFullYear(), f.getMonth() + 1, 0).toISOString().split('T')[0]

  const [{ data: nominas }, { data: empleados }, { data: aportes }, { data: horasExtrasMes }, { data: nominasHist }, { data: cuentas }, { data: registrosExtras }] = await Promise.all([
    supabase
      .from('nomina_mensual')
      .select('*, empleado:empleados(nombre, apellido, dni, tipo_empleado, horas_acuerdo_negro, plus_negro_tipo, plus_negro_valor)')
      .eq('mes', mes)
      .order('created_at', { ascending: false }),
    supabase
      .from('empleados')
      .select('id, nombre, apellido, dni, tipo_empleado, sueldo_basico, valor_hora, horas_mensuales, corresponde_aguinaldo, porcentaje_aguinaldo, monto_comidas, presentismo_pct, horas_acuerdo_negro, plus_negro_tipo, plus_negro_valor')
      .eq('activo', true)
      .order('apellido'),
    supabase
      .from('configuracion_aportes')
      .select('*')
      .eq('activo', true)
      .order('orden'),
    supabase
      .from('horas_extras_registros')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .is('incluido_en_nomina_id', null),
    // Para calcular caja aguinaldos: provisiones acumuladas - pagos
    supabase
      .from('nomina_mensual')
      .select('empleado_id, aguinaldo_provisionado, aguinaldo_pagado_de_caja'),
    supabase
      .from('cuentas_bancarias')
      .select('id, nombre, banco, titular:cuentas_titulares(nombre)')
      .eq('activo', true)
      .order('banco'),
    // Todos los registros de horas extras del mes (incluidos y no) — para separar por % en los recibos
    supabase
      .from('horas_extras_registros')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta),
  ])

  // Pagos parciales de las nóminas del mes desde el ledger unificado
  const nominaIds = (nominas ?? []).map((n) => n.id)
  type PagoLedger = {
    id: string
    origen_id: string
    fecha_emision: string
    monto: number
    moneda: 'ARS' | 'USD'
    instrumento: string
    cuenta_id: string | null
    notas: string | null
  }
  let pagosLedger: PagoLedger[] = []
  if (nominaIds.length > 0) {
    const { data } = await supabase
      .from('pagos')
      .select('id, origen_id, fecha_emision, monto, moneda, instrumento, cuenta_id, notas')
      .eq('tipo_origen', 'NOMINA')
      .in('origen_id', nominaIds)
      .order('fecha_emision', { ascending: true })
    pagosLedger = (data ?? []) as unknown as PagoLedger[]
  }

  const pagosByNomina = new Map<string, PagoParcialNomina[]>()
  for (const p of pagosLedger) {
    if (!p.origen_id) continue
    const arr = pagosByNomina.get(p.origen_id) ?? []
    // Adaptar al shape PagoParcialNomina que usa el client
    arr.push({
      id: p.id,
      nomina_id: p.origen_id,
      fecha: p.fecha_emision,
      monto: Number(p.monto),
      moneda: p.moneda,
      medio_pago: p.instrumento,
      cuenta_id: p.cuenta_id,
      notas: p.notas,
    } as PagoParcialNomina)
    pagosByNomina.set(p.origen_id, arr)
  }

  const nominasConPagos = (nominas ?? []).map((n) => {
    const pagos = pagosByNomina.get(n.id) ?? []
    const total_pagado = pagos.reduce((s, p) => s + Number(p.monto), 0)
    return {
      ...n,
      pagos_parciales: pagos,
      total_pagado,
      saldo_pendiente: Math.max(0, Number(n.neto) - total_pagado),
    }
  })

  // Caja aguinaldos por empleado
  const cajaAguinaldos = new Map<string, number>()
  for (const n of nominasHist ?? []) {
    const prev = cajaAguinaldos.get(n.empleado_id) ?? 0
    cajaAguinaldos.set(n.empleado_id, prev + (n.aguinaldo_provisionado ?? 0) - (n.aguinaldo_pagado_de_caja ?? 0))
  }
  const cajaAguinaldosObj: Record<string, number> = {}
  for (const [k, v] of cajaAguinaldos) cajaAguinaldosObj[k] = v

  return (
    <NominaClient
      nominas={nominasConPagos}
      empleados={empleados ?? []}
      aportes={aportes ?? []}
      mes={mes}
      horasExtrasMes={horasExtrasMes ?? []}
      registrosExtras={registrosExtras ?? []}
      cajaAguinaldos={cajaAguinaldosObj}
      cuentas={(cuentas ?? []) as unknown as Parameters<typeof NominaClient>[0]['cuentas']}
    />
  )
}
