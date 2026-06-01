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
          <h1 className="text-2xl font-bold text-fg">AFIP / Facturación</h1>
          <p className="text-sm text-fg-muted mt-0.5">{items?.length ?? 0} registros</p>
        </div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
        <p className="text-sm text-amber-800 font-medium">Pendiente total: {formatCurrency(totalPendiente)}</p>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Mes</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Motivo</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Responsable</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Monto</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Vencimiento</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Estado</th>
            </tr>
          </thead>
          <tbody>
            {!items?.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-fg-soft">Sin registros AFIP</td>
              </tr>
            ) : (
              items.map((i) => (
                <tr key={i.id} className="border-b border-border/60 hover:bg-surface-2/30">
                  <td className="px-4 py-3 text-fg-muted">{formatMonth(i.mes)}</td>
                  <td className="px-4 py-3 text-fg">{i.motivo}</td>
                  <td className="px-4 py-3 text-fg-muted">{i.responsable}</td>
                  <td className="px-4 py-3 text-right font-mono text-fg">{formatCurrency(i.monto)}</td>
                  <td className="px-4 py-3 text-fg-muted text-xs">{i.fecha_vencimiento ? formatDate(i.fecha_vencimiento) : '—'}</td>
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
