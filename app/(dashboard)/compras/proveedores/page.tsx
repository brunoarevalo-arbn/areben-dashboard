import { createClient } from '@/lib/supabase/server'
import { ProveedoresClient } from '@/components/compras/proveedores-client'

export default async function ProveedoresPage() {
  const supabase = await createClient()
  const { data: proveedores } = await supabase
    .from('proveedores')
    .select('*')
    .order('nombre')

  return <ProveedoresClient proveedores={proveedores ?? []} />
}
