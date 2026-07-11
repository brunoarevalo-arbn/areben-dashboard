import { createClient } from '@/lib/supabase/server'
import { ProduccionClient } from '@/components/compras/produccion-client'

export const dynamic = 'force-dynamic'

// Producción: insumos + mano de obra por mercadería que todavía se está fabricando.
// "En proceso" (fecha_pasaje null) = activo; "pasadas" ya fueron al stock de la marca.
export default async function ProduccionPage() {
  const supabase = await createClient()

  const [{ data: comprasRaw }, { data: proveedores }, { data: cuentas }] = await Promise.all([
    supabase
      .from('compras')
      .select('*, proveedor:proveedores(nombre)')
      .eq('negocio', 'PRODUCCION')
      .order('fecha', { ascending: false })
      .limit(500),
    supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    supabase
      .from('cuentas_bancarias')
      .select('id, nombre, banco, titular:cuentas_titulares(nombre)')
      .eq('activo', true)
      .order('banco'),
  ])

  const compras = (comprasRaw ?? []).map((c) => ({
    ...c,
    proveedor: Array.isArray(c.proveedor) ? c.proveedor[0] ?? null : c.proveedor,
  }))

  const cuentasNorm = (cuentas ?? []).map((c) => ({
    ...c,
    titular: Array.isArray(c.titular) ? c.titular[0] ?? null : c.titular,
  }))

  return (
    <ProduccionClient
      compras={compras as Parameters<typeof ProduccionClient>[0]['compras']}
      proveedores={proveedores ?? []}
      cuentas={cuentasNorm as Parameters<typeof ProduccionClient>[0]['cuentas']}
    />
  )
}
