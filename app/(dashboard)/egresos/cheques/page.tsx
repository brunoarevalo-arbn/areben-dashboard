import { createClient } from '@/lib/supabase/server'
import { ChequesClient } from '@/components/egresos/cheques-client'

export default async function ChequesPage() {
  const supabase = await createClient()

  const { data: cheques } = await supabase
    .from('pagos')
    .select('*, compra:compras(descripcion, proveedor:proveedores(nombre))')
    .in('instrumento', ['CHEQUE_FISICO', 'ECHEQ'])
    .order('fecha_vencimiento', { ascending: true })
    .limit(500)

  return <ChequesClient cheques={cheques ?? []} />
}
