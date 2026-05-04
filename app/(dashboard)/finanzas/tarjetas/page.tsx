import { createClient } from '@/lib/supabase/server'
import { TarjetasClient } from '@/components/finanzas/tarjetas-client'

export default async function TarjetasPage() {
  const supabase = await createClient()
  const [{ data: tarjetas }, { data: titulares }, { data: cuotas }, { data: cuentas }] = await Promise.all([
    supabase
      .from('tarjetas_credito')
      .select('*, titular:cuentas_titulares(*)')
      .order('banco'),
    supabase.from('cuentas_titulares').select('*').eq('activo', true).order('nombre'),
    supabase
      .from('cuotas_tarjeta')
      .select('*, tarjeta:tarjetas_credito(nombre, banco)')
      .order('mes_vencimiento', { ascending: true }),
    supabase.from('cuentas_bancarias').select('id, nombre, banco').eq('activo', true).order('banco'),
  ])

  return (
    <TarjetasClient
      tarjetas={tarjetas ?? []}
      titulares={titulares ?? []}
      cuotas={cuotas ?? []}
      cuentas={cuentas ?? []}
    />
  )
}
