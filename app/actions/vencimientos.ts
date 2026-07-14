'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type VencTipo = 'sueldo' | 'carga' | 'tarjeta' | 'impositivo' | 'prestamo' | 'plan_afip'

export interface VencRow {
  tipo: VencTipo
  id: string
  concepto: string
  detalle: string
  monto: number
  moneda: string
  fecha: string | null
}

export interface VencGrupo {
  key: VencTipo
  label: string
  rows: VencRow[]
}

// Lista todos los conceptos con vencimiento del mes (para editar sus fechas en masa).
export async function getVencimientosDelMes(mes: string): Promise<VencGrupo[]> {
  await requireUser()
  const supabase = await createClient()
  const [y, m] = mes.split('-').map(Number)
  const desde = `${mes}-01`
  const hasta = new Date(y, m, 0).toISOString().split('T')[0]

  const [nominas, cargas, cuotasTc, impositivos, prestCuotas, afipCuotas] = await Promise.all([
    supabase.from('nomina_mensual').select('id, neto, fecha_programada_pago, empleado:empleados(nombre, apellido)').eq('mes', mes),
    supabase.from('gastos').select('id, concepto, monto, moneda, fecha_pago').eq('categoria', 'Cargas Sociales').eq('mes', mes),
    supabase.from('cuotas_tarjeta').select('id, concepto, monto_cuota, cuota_numero, cuotas_total, fecha_vencimiento, tarjeta:tarjetas_credito(nombre, banco)').eq('mes_vencimiento', mes).eq('pagada', false),
    supabase.from('afip_facturacion').select('id, motivo, monto, fecha_vencimiento').eq('mes', mes),
    supabase.from('prestamo_cuotas').select('id, cuota_numero, total_cuotas, monto_total, fecha_vencimiento, prestamo:prestamos(nombre, acreedor, moneda)').eq('pagada', false).gte('fecha_vencimiento', desde).lte('fecha_vencimiento', hasta),
    supabase.from('plan_afip_cuotas').select('id, cuota_numero, total_cuotas, monto_total, fecha_vencimiento, plan:planes_afip(nombre)').eq('pagada', false).gte('fecha_vencimiento', desde).lte('fecha_vencimiento', hasta),
  ])

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

  const grupos: VencGrupo[] = [
    {
      key: 'sueldo', label: 'Sueldos',
      rows: (nominas.data ?? []).map((n) => {
        const e = one(n.empleado as { nombre: string; apellido: string } | { nombre: string; apellido: string }[] | null)
        return { tipo: 'sueldo' as const, id: n.id, concepto: e ? `${e.apellido}, ${e.nombre}` : 'Sueldo', detalle: 'Sueldo neto', monto: Number(n.neto ?? 0), moneda: 'ARS', fecha: n.fecha_programada_pago }
      }),
    },
    {
      key: 'carga', label: 'Aportes / cargas sociales (931)',
      rows: (cargas.data ?? []).map((g) => ({ tipo: 'carga' as const, id: g.id, concepto: g.concepto, detalle: 'Cargas sociales', monto: Number(g.monto ?? 0), moneda: g.moneda ?? 'ARS', fecha: g.fecha_pago })),
    },
    {
      key: 'tarjeta', label: 'Vencimientos de tarjeta',
      rows: (cuotasTc.data ?? []).map((c) => {
        const t = one(c.tarjeta as { nombre: string; banco: string } | { nombre: string; banco: string }[] | null)
        return { tipo: 'tarjeta' as const, id: c.id, concepto: c.concepto, detalle: `${t?.banco ?? ''} ${t?.nombre ?? ''} · cuota ${c.cuota_numero}/${c.cuotas_total}`.trim(), monto: Number(c.monto_cuota ?? 0), moneda: 'ARS', fecha: c.fecha_vencimiento }
      }),
    },
    {
      key: 'impositivo', label: 'Impositivos AFIP',
      rows: (impositivos.data ?? []).map((a) => ({ tipo: 'impositivo' as const, id: a.id, concepto: a.motivo, detalle: 'Impuesto / AFIP', monto: Number(a.monto ?? 0), moneda: 'ARS', fecha: a.fecha_vencimiento })),
    },
    {
      key: 'prestamo', label: 'Cuotas de préstamos',
      rows: (prestCuotas.data ?? []).map((c) => {
        const p = one(c.prestamo as { nombre: string; acreedor: string; moneda: string } | { nombre: string; acreedor: string; moneda: string }[] | null)
        return { tipo: 'prestamo' as const, id: c.id, concepto: p?.acreedor || p?.nombre || 'Préstamo', detalle: `${p?.nombre ?? ''} · cuota ${c.cuota_numero}/${c.total_cuotas}`.trim(), monto: Number(c.monto_total ?? 0), moneda: p?.moneda ?? 'ARS', fecha: c.fecha_vencimiento }
      }),
    },
    {
      key: 'plan_afip', label: 'Cuotas de planes AFIP',
      rows: (afipCuotas.data ?? []).map((c) => {
        const p = one(c.plan as { nombre: string } | { nombre: string }[] | null)
        return { tipo: 'plan_afip' as const, id: c.id, concepto: p?.nombre || 'Plan AFIP', detalle: `Cuota ${c.cuota_numero}/${c.total_cuotas}`, monto: Number(c.monto_total ?? 0), moneda: 'ARS', fecha: c.fecha_vencimiento }
      }),
    },
  ]

  return grupos.filter((g) => g.rows.length > 0)
}

// Guarda en masa las fechas editadas, escribiendo cada una en su tabla de origen.
export async function guardarVencimientosMasivo(cambios: { tipo: VencTipo; id: string; fecha: string | null }[]) {
  await requireUser()
  const supabase = await createClient()

  for (const c of cambios) {
    const fecha = c.fecha || null
    switch (c.tipo) {
      case 'sueldo': {
        await supabase.from('nomina_mensual').update({ fecha_programada_pago: fecha }).eq('id', c.id)
        // sincronizar el gasto de sueldo vinculado
        const { data: n } = await supabase.from('nomina_mensual').select('gasto_pendiente_id').eq('id', c.id).single()
        if (n?.gasto_pendiente_id) await supabase.from('gastos').update({ fecha_pago: fecha }).eq('id', n.gasto_pendiente_id)
        break
      }
      case 'carga':
        await supabase.from('gastos').update({ fecha_pago: fecha }).eq('id', c.id)
        break
      case 'tarjeta':
        await supabase.from('cuotas_tarjeta').update({ fecha_vencimiento: fecha }).eq('id', c.id)
        break
      case 'impositivo':
        await supabase.from('afip_facturacion').update({ fecha_vencimiento: fecha }).eq('id', c.id)
        break
      case 'prestamo':
        await supabase.from('prestamo_cuotas').update({ fecha_vencimiento: fecha }).eq('id', c.id)
        break
      case 'plan_afip':
        await supabase.from('plan_afip_cuotas').update({ fecha_vencimiento: fecha }).eq('id', c.id)
        break
    }
  }

  revalidatePath('/finanzas/vencimientos')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/pagos')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/cierre-mes')
  revalidatePath('/')
  return { ok: cambios.length }
}
