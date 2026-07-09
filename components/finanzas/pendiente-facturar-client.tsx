'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { FacturacionMes } from '@/types/database'
import { sincronizarFacturacionGN } from '@/app/actions/gestion-nube'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { formatCurrency, getMonthOptions, formatMonth } from '@/lib/utils'
import { Loader2, RefreshCw, FileText } from 'lucide-react'

export function PendienteFacturarClient({ facturacion, mes }: { facturacion: FacturacionMes[]; mes: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function setMes(m: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('mes', m)
    router.push(`?${p.toString()}`)
  }
  function sync() {
    setMsg(null)
    start(async () => {
      const err = await sincronizarFacturacionGN(mes)
      setMsg(err ?? 'Sincronizado.')
    })
  }

  const totalCobrado = facturacion.reduce((s, f) => s + Number(f.cobrado), 0)
  const totalFacturado = facturacion.reduce((s, f) => s + Number(f.facturado), 0)
  const totalPendiente = facturacion.reduce((s, f) => s + Number(f.pendiente), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" /> Pendiente de facturar
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">
            Ventas cobradas en cuentas Areben que falta facturar — {formatMonth(mes)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select options={getMonthOptions(24)} value={mes} onChange={(e) => setMes(e.target.value)} className="w-40" />
          <Button onClick={sync} disabled={pending}>
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sincronizar
          </Button>
        </div>
      </div>

      {msg && <p className="text-sm text-fg-soft bg-surface-2 rounded-lg p-2">{msg}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Cobrado (Areben)</p>
          <p className="text-xl font-bold text-fg">{formatCurrency(totalCobrado)}</p>
        </div>
        <div className="bg-surface border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Facturado</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totalFacturado)}</p>
        </div>
        <div className="bg-surface border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Pendiente de facturar</p>
          <p className="text-xl font-bold text-amber-700">{formatCurrency(totalPendiente)}</p>
        </div>
      </div>

      {facturacion.length > 0 ? (
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Cuenta de cobro</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Cobrado</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Facturado</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Pendiente</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Sin facturar</th>
              </tr>
            </thead>
            <tbody>
              {facturacion.map((f) => (
                <tr key={f.id} className="border-b border-border/60 hover:bg-surface-2/30">
                  <td className="px-4 py-3 text-fg">{f.cuenta}</td>
                  <td className="px-4 py-3 text-right font-mono text-fg">{formatCurrency(f.cobrado)}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-700">{formatCurrency(f.facturado)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-amber-700">{formatCurrency(f.pendiente)}</td>
                  <td className="px-4 py-3 text-right text-fg-muted">{f.cantidad_sin_facturar}/{f.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-fg-soft text-sm">
          Sin datos para este mes. Apretá <b>Sincronizar</b>. (Si no aparece nada, revisá que haya cuentas
          marcadas como <b>Areben</b> en Configuración → Cuentas de cobro.)
        </div>
      )}
    </div>
  )
}
