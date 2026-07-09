'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { CuentaGN } from '@/types/database'
import { probarCuentaGN, sincronizarVentasGN, sincronizarStockGN } from '@/app/actions/gestion-nube'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { getMonthOptions, formatMonth, cn } from '@/lib/utils'
import { Plug, Loader2 } from 'lucide-react'

export function GestionNubeClient({ cuentas, mes }: { cuentas: CuentaGN[]; mes: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [running, setRunning] = useState<string | null>(null)
  const [, start] = useTransition()

  function setMes(m: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('mes', m)
    router.push(`?${p.toString()}`)
  }

  function run(id: string, accion: string, fn: () => Promise<string | null>) {
    const key = `${id}-${accion}`
    setRunning(key)
    start(async () => {
      const err = await fn()
      setMsg((prev) => ({
        ...prev,
        [id]: err ? { ok: false, text: err } : { ok: true, text: `${accion}: ¡listo!` },
      }))
      setRunning(null)
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Plug className="w-6 h-6 text-primary" /> Gestión Nube
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">Sincronización de ventas/CMV y stock por cuenta</p>
        </div>
        <Select options={getMonthOptions(24)} value={mes} onChange={(e) => setMes(e.target.value)} className="w-44" />
      </div>

      {cuentas.length === 0 && (
        <div className="bg-surface border border-border rounded-xl p-6 text-fg-soft text-sm">
          No hay cuentas GN configuradas.
        </div>
      )}

      {cuentas.map((c) => {
        const m = msg[c.id]
        return (
          <div key={c.id} className="bg-surface border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-fg">{c.nombre || c.alias}</p>
                <p className="text-xs text-fg-soft">Marcas: {c.marcas.join(', ')}</p>
              </div>
              <Badge variant={c.estado === 'OK' ? 'success' : c.estado === 'ERROR' ? 'danger' : 'warning'}>
                {c.estado}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={running === `${c.id}-Probar`}
                onClick={() => run(c.id, 'Probar', () => probarCuentaGN(c.alias))}
              >
                {running === `${c.id}-Probar` && <Loader2 className="w-4 h-4 animate-spin" />} Probar conexión
              </Button>
              <Button
                disabled={running === `${c.id}-Ventas`}
                onClick={() => run(c.id, 'Ventas', () => sincronizarVentasGN(c.alias, mes))}
              >
                {running === `${c.id}-Ventas` && <Loader2 className="w-4 h-4 animate-spin" />} Sincronizar ventas ({formatMonth(mes)})
              </Button>
              <Button
                variant="secondary"
                disabled={running === `${c.id}-Stock`}
                onClick={() => run(c.id, 'Stock', () => sincronizarStockGN(c.alias, mes))}
              >
                {running === `${c.id}-Stock` && <Loader2 className="w-4 h-4 animate-spin" />} Sincronizar stock
              </Button>
            </div>

            {m && (
              <p className={cn('text-sm rounded-lg p-2', m.ok ? 'bg-green-500/10 text-green-700' : 'bg-red-500/10 text-red-700')}>
                {m.text}
              </p>
            )}
          </div>
        )
      })}

      <p className="text-xs text-fg-soft">
        Los tokens viven en variables de entorno (<code>GN_TOKEN_ZATTIA</code> / <code>GN_TOKEN_BDI</code>).
        En producción deben estar cargados en Vercel para que la sincronización funcione.
      </p>
    </div>
  )
}
