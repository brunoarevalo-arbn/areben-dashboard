import { createClient } from '@/lib/supabase/server'
import { ChequesClient } from '@/components/egresos/cheques-client'

export const dynamic = 'force-dynamic'

export default async function ChequesPage() {
  const supabase = await createClient()

  const [{ data: cheques }, { data: cuentas }] = await Promise.all([
    supabase
      .from('pagos')
      .select('*, compra:compras(descripcion, proveedor:proveedores(nombre)), cuenta:cuentas_bancarias(id, nombre, banco)')
      .in('instrumento', ['CHEQUE_FISICO', 'ECHEQ'])
      .order('fecha_vencimiento', { ascending: true })
      .limit(1000),
    supabase
      .from('cuentas_bancarias')
      .select('id, nombre, banco, titular:cuentas_titulares(nombre)')
      .eq('activo', true)
      .order('banco'),
  ])

  return <ChequesClient cheques={cheques ?? []} cuentas={cuentas ?? []} />
}
