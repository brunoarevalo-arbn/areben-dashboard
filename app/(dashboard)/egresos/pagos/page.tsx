import { createClient } from '@/lib/supabase/server'
import { PagosClient } from '@/components/egresos/pagos-client'

export default async function PagosPage() {
  const supabase = await createClient()

  const { data: pagos } = await supabase
    .from('pagos')
    .select('*, compra:compras(descripcion, monto_total, proveedor:proveedores(nombre))')
    .order('fecha_emision', { ascending: false })
    .limit(500)

  return <PagosClient pagos={pagos ?? []} />
}
