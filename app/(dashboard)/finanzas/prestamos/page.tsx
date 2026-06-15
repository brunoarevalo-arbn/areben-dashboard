import { createClient } from '@/lib/supabase/server'
import { PrestamosClient } from '@/components/finanzas/prestamos-client'

export const dynamic = 'force-dynamic'

export default async function PrestamosPage() {
  const supabase = await createClient()

  const [{ data: prestamos }, { data: cuotas }, { data: cuentas }] = await Promise.all([
    supabase
      .from('prestamos')
      .select('*, cuenta:cuentas_bancarias(id, nombre, banco)')
      .order('fecha_inicio', { ascending: false }),
    supabase
      .from('prestamo_cuotas')
      .select('*')
      .order('fecha_vencimiento', { ascending: true }),
    supabase
      .from('cuentas_bancarias')
      .select('id, nombre, banco')
      .eq('activo', true)
      .order('banco'),
  ])

  return (
    <PrestamosClient
      prestamos={prestamos ?? []}
      cuotas={cuotas ?? []}
      cuentas={cuentas ?? []}
    />
  )
}
