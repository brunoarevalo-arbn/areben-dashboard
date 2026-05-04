import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { EstadoBadge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils'

export default async function AfipPage() {
  const supabase = await createClient()
  const { data: items } = await supabase
    .from('afip_facturacion')
    .select('*')
    .order('mes', { ascending: false })

  const totalPendiente = items?.filter((i) => i.estado !== 'PAGADO').reduce((s, i) => s + i.monto, 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">AFIP / Facturación</h1>
          <p className="text-sm text-slate-400 mt-0.5">{items?.length ?? 0} registros</p>
        </div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
        <p className="text-sm text-amber-300 font-medium">Pendiente total: {formatCurrency(totalPendiente)}</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Mes</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Motivo</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Responsable</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Monto</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Vencimiento</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Estado</th>
            </tr>
          </thead>
          <tbody>
            {!items?.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">Sin registros AFIP</td>
              </tr>
            ) : (
              items.map((i) => (
                <tr key={i.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-slate-300">{formatMonth(i.mes)}</td>
                  <td className="px-4 py-3 text-slate-100">{i.motivo}</td>
                  <td className="px-4 py-3 text-slate-400">{i.responsable}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-100">{formatCurrency(i.monto)}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{i.fecha_vencimiento ? formatDate(i.fecha_vencimiento) : '—'}</td>
                  <td className="px-4 py-3"><EstadoBadge estado={i.estado} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
