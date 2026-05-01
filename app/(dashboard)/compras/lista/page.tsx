import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/utils'
import { EstadoBadge, MarcaBadge, Badge } from '@/components/ui/badge'

export default async function ComprasListaPage() {
  const supabase = await createClient()
  const { data: compras } = await supabase
    .from('compras')
    .select('*, proveedor:proveedores(nombre)')
    .order('fecha', { ascending: false })
    .limit(100)

  const total = compras?.reduce((s, c) => s + c.precio_unitario * c.cantidad, 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Compras</h1>
          <p className="text-sm text-slate-400 mt-0.5">{compras?.length ?? 0} registros · Total: {formatCurrency(total)}</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Descripción</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Proveedor</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Negocio</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Monto</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Fecha</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Estado</th>
            </tr>
          </thead>
          <tbody>
            {!compras?.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">No hay compras registradas</td>
              </tr>
            ) : (
              compras.map((c) => (
                <tr key={c.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <p className="text-slate-100">{c.descripcion}</p>
                    <p className="text-xs text-slate-500">Cant: {c.cantidad}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{(c.proveedor as { nombre: string } | null)?.nombre ?? '—'}</td>
                  <td className="px-4 py-3"><MarcaBadge marca={c.negocio} /></td>
                  <td className="px-4 py-3 text-right font-mono text-slate-100">
                    {formatCurrency(c.precio_unitario * c.cantidad)} {c.moneda !== 'ARS' && <span className="text-xs text-slate-400">({c.moneda})</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(c.fecha)}</td>
                  <td className="px-4 py-3"><EstadoBadge estado={c.estado} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
