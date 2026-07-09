'use client'

import { useState, useTransition } from 'react'
import type { CuentaCobroGN, TipoCuentaCobro } from '@/types/database'
import { setTipoCuentaCobro, detectarCuentasCobroGN } from '@/app/actions/cuentas-cobro'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Loader2, RefreshCw } from 'lucide-react'

const TIPOS = [
  { value: 'areben', label: 'Areben (factura + IVA)' },
  { value: 'propia', label: 'Propia (Bruno/Darío)' },
  { value: 'efectivo', label: 'Efectivo' },
]

export function CuentasCobroClient({ cuentas, origenPorCuenta }: { cuentas: CuentaCobroGN[]; origenPorCuenta: Record<string, string[]> }) {
  const [pending, start] = useTransition()
  const [detecting, setDetecting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function cambiar(id: string, tipo: TipoCuentaCobro) {
    start(async () => {
      const err = await setTipoCuentaCobro(id, tipo)
      if (err) setMsg(err)
    })
  }
  function detectar() {
    setDetecting(true)
    setMsg(null)
    start(async () => {
      const err = await detectarCuentasCobroGN()
      setMsg(err ?? 'Cuentas actualizadas.')
      setDetecting(false)
    })
  }

  const color = (t: string) => (t === 'areben' ? 'text-green-700' : t === 'propia' ? 'text-amber-700' : 'text-fg-muted')

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg">Cuentas de cobro (GN)</h1>
          <p className="text-sm text-fg-muted mt-0.5">
            Solo las de <b>Areben</b> se facturan y llevan IVA. Editá el tipo de cada cuenta.
          </p>
        </div>
        <Button variant="secondary" onClick={detectar} disabled={detecting}>
          {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Detectar cuentas de GN
        </Button>
      </div>

      {msg && <p className="text-sm text-fg-soft bg-surface-2 rounded-lg p-2">{msg}</p>}

      <div className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border/60">
        {cuentas.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="text-sm text-fg">{c.nombre}</span>
              {(origenPorCuenta[c.nombre] ?? []).map((o) => (
                <span key={o} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface-2 text-fg-muted">GN {o}</span>
              ))}
            </div>
            <Select
              value={c.tipo}
              onChange={(e) => cambiar(c.id, e.target.value as TipoCuentaCobro)}
              options={TIPOS}
              disabled={pending}
              className={cn('w-56 font-medium', color(c.tipo))}
            />
          </div>
        ))}
        {cuentas.length === 0 && (
          <p className="px-4 py-6 text-sm text-fg-soft">No hay cuentas. Apretá &quot;Detectar cuentas de GN&quot;.</p>
        )}
      </div>
    </div>
  )
}
