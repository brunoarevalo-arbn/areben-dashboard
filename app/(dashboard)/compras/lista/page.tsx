import { createClient } from '@/lib/supabase/server'
import { ComprasClient } from '@/components/compras/compras-client'

export default async function ComprasListaPage() {
  const supabase = await createClient()

  // Sólo compras de los últimos 12 meses para no escalar mal
  const haceUnAno = new Date()
  haceUnAno.setMonth(haceUnAno.getMonth() - 12)
  const desde = haceUnAno.toISOString().split('T')[0]

  // 1) Compras de los últimos 12 meses (sin pagos en el join — lazy load)
  const { data: comprasRaw } = await supabase
    .from('compras')
    .select('*, proveedor:proveedores(nombre)')
    .gte('fecha', desde)
    .order('fecha', { ascending: false })
    .limit(200)

  const compraIds = (comprasRaw ?? []).map((c) => c.id)

  // 2) Pagos de esas compras en una query aparte (evita 200×N rows en el join)
  const pagosQuery = compraIds.length > 0
    ? supabase
        .from('pagos')
        .select('id, compra_id, monto, fecha_emision, instrumento, condicion_pago, numero_cuota, total_cuotas, fecha_vencimiento')
        .in('compra_id', compraIds)
    : null

  const [pagosResult, { data: proveedores }] = await Promise.all([
    pagosQuery,
    supabase
      .from('proveedores')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre'),
  ])
  const pagos = pagosResult?.data ?? []

  // 3) Re-armar el shape esperado por el client
  type PagoRow = (typeof pagos)[number]
  const pagosByCompra = new Map<string, PagoRow[]>()
  for (const p of pagos) {
    if (!p.compra_id) continue
    const arr = pagosByCompra.get(p.compra_id) ?? []
    arr.push(p)
    pagosByCompra.set(p.compra_id, arr)
  }
  const compras = (comprasRaw ?? []).map((c) => ({
    ...c,
    pagos: pagosByCompra.get(c.id) ?? [],
  }))

  return (
    <ComprasClient
      compras={compras}
      proveedores={proveedores ?? []}
    />
  )
}
