'use client'

import { useState, useTransition } from 'react'
import type { ComisionMedioPago } from '@/types/database'
import { setComisionMedio, detectarMediosPago } from '@/app/actions/comisiones'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw } from 'lucide-react'

export function ComisionesClient({ medios }: { medios: ComisionMedioPago[] }) {
  const [pending, start] = useTransition()
  const [detecting, setDetecting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // Valor editable local por fila (string para permitir vacío mientras se tipea).
  const [vals, setVals] = useState<Record<string, string>>(
    () => Object.fromEntries(medios.map((m) => [m.id, String(m.porcentaje)])),
  )

  function guardar(id: string) {
    const n = Number(vals[id])
    if (!Number.isFinite(n)) return
    start(async () => {
      const err = await setComisionMedio(id, n)
      if (err) setMsg(err)
    })
  }
  function detectar() {
    setDetecting(true); setMsg(null)
    start(async () => {
      const err = await detectarMediosPago()
      setMsg(err ?? 'Medios actualizados.')
      setDetecting(false)
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg">Comisiones por medio de pago</h1>
          <p className="text-sm text-fg-muted mt-0.5">
            % que cobra cada medio (MP, Pago Nube, etc.) sobre el total. Se descuenta como costo
            comercial en el Panel de Ventas. Efectivo y transferencia normalmente 0%.
          </p>
        </div>
        <Button variant="secondary" onClick={detectar} disabled={detecting}>
          {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Detectar medios de GN
        </Button>
      </div>

      {msg && <p className="text-sm text-fg-soft bg-surface-2 rounded-lg p-2">{msg}</p>}

      <div className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border/60">
        {medios.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-sm text-fg">{m.medio}</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                inputMode="decimal"
                value={vals[m.id] ?? ''}
                disabled={pending}
                onChange={(e) => setVals((p) => ({ ...p, [m.id]: e.target.value }))}
                onBlur={() => guardar(m.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="w-24 text-right px-2 py-1.5 bg-surface-2 border border-border-strong rounded-lg text-fg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
              />
              <span className="text-sm text-fg-muted">%</span>
            </div>
          </div>
        ))}
        {medios.length === 0 && (
          <p className="px-4 py-6 text-sm text-fg-soft">No hay medios. Apretá &quot;Detectar medios de GN&quot;.</p>
        )}
      </div>
    </div>
  )
}
