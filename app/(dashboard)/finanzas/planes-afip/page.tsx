import { createClient } from '@/lib/supabase/server'
import { PlanesAfipClient } from '@/components/finanzas/planes-afip-client'

export const dynamic = 'force-dynamic'

export default async function PlanesAfipPage() {
  const supabase = await createClient()

  const desde = new Date()
  desde.setMonth(desde.getMonth() - 24)
  const desdeMes = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}`

  const [
    { data: planes },
    { data: cuotas },
    { data: cuentas },
    { data: gastosCargasSocialesPendientes },
  ] = await Promise.all([
    supabase
      .from('planes_afip')
      .select('*, cuenta:cuentas_bancarias(id, nombre, banco)')
      .order('fecha_inicio', { ascending: false }),
    supabase
      .from('plan_afip_cuotas')
      .select('*')
      .order('fecha_vencimiento', { ascending: true }),
    supabase
      .from('cuentas_bancarias')
      .select('id, nombre, banco')
      .eq('activo', true)
      .order('banco'),
    // Gastos PENDIENTES de Cargas Sociales (para seleccionar al crear plan)
    supabase
      .from('gastos')
      .select('id, concepto, monto, mes, fecha_pago, plan_afip_id')
      .eq('categoria', 'Cargas Sociales')
      .neq('estado', 'PAGADO')
      .is('plan_afip_id', null)
      .gte('mes', desdeMes)
      .order('mes', { ascending: true }),
  ])

  return (
    <PlanesAfipClient
      planes={planes ?? []}
      cuotas={cuotas ?? []}
      cuentas={cuentas ?? []}
      gastosDisponibles={gastosCargasSocialesPendientes ?? []}
    />
  )
}
