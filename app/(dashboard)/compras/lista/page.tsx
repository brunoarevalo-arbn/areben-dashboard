import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { ComprasClient } from '@/components/compras/compras-client'

export const dynamic = 'force-dynamic'

export default async function ComprasListaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? getCurrentMonth()

  const supabase = await createClient()

  // Rango del mes activo: primer y último día
  const [yearStr, monthStr] = mes.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const desde = `${mes}-01`
  // Último día del mes — JS: new Date(year, month, 0) da el último del mes anterior+1 = último del mes
  const ultimo = new Date(year, month, 0).getDate()
  const hasta = `${mes}-${String(ultimo).padStart(2, '0')}`

  const { data: comprasRaw } = await supabase
    .from('compras')
    .select('*, proveedor:proveedores(nombre)')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
    .limit(500)

  const compraIds = (comprasRaw ?? []).map((c) => c.id)

  const pagosQuery = compraIds.length > 0
    ? supabase
        .from('pagos')
        .select('id, compra_id, monto, fecha_emision, instrumento, condicion_pago, numero_cuota, total_cuotas, fecha_vencimiento')
        .in('compra_id', compraIds)
    : null

  const [pagosResult, { data: proveedores }, { data: cuentas }] = await Promise.all([
    pagosQuery,
    supabase
      .from('proveedores')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre'),
    supabase
      .from('cuentas_bancarias')
      .select('id, nombre, banco, titular:cuentas_titulares(nombre)')
      .eq('activo', true)
      .order('banco'),
  ])
  const pagos = pagosResult?.data ?? []

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
      cuentas={cuentas ?? []}
      mes={mes}
    />
  )
}
