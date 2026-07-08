'use client'

import { useState, useTransition } from 'react'
import { renovarInstrumento } from '@/app/actions/inversiones'
import type { Instrumento } from '@/types/database'
import { Button } from '@/components/ui/button'
import { formatMoneda } from '@/lib/inversiones-calc'
import { formatDate, cn } from '@/lib/utils'
import { Loader2, RefreshCw, ArrowRight } from 'lucide-react'

// Suma meses de calendario a una fecha YYYY-MM-DD, manteniendo el día
// (ej: 18-jun + 3 meses = 18-sep). Si el día no existe en el mes destino
// (ej: 31), lo ajusta al último día de ese mes.
function addMonths(fecha: string, meses: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + meses, 1))
  const ultimoDia = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, ultimoDia))
  return target.toISOString().substring(0, 10)
}

const PRESETS = [
  { meses: 1, label: '1 mes' },
  { meses: 2, label: '2 meses' },
  { meses: 3, label: '3 meses' },
  { meses: 6, label: '6 meses' },
  { meses: 12, label: '1 año' },
]

type DoneResult =
  | { kind: 'success'; message: string; detail?: string }
  | { kind: 'error'; message: string }

export function RenovarModal({
  instrumento,
  saldoActual,
  onDone,
  onClose,
}: {
  instrumento: Instrumento
  saldoActual: number
  onDone: (r: DoneResult) => void
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [modo, setModo] = useState<'meses' | 'fecha'>('meses')
  const [meses, setMeses] = useState(3)
  const [fechaCustom, setFechaCustom] = useState('')
  const [error, setError] = useState<string | null>(null)

  const nuevoInicio = instrumento.fecha_fin ?? ''
  const nuevoFin = modo === 'meses' && nuevoInicio ? addMonths(nuevoInicio, meses) : fechaCustom

  const handleConfirm = () => {
    setError(null)
    if (!nuevoInicio) { setError('El instrumento no tiene fecha de vencimiento para arrancar el nuevo ciclo. Configurala primero.'); return }
    if (!nuevoFin) { setError('Elegí una fecha de vencimiento.'); return }
    if (nuevoFin <= nuevoInicio) { setError('El vencimiento tiene que ser posterior al inicio del nuevo ciclo.'); return }
    startTransition(async () => {
      const r = await renovarInstrumento(instrumento.id, nuevoFin)
      if (!r.ok) { setError(r.error); return }
      onDone({
        kind: 'success',
        message: `Instrumento renovado`,
        detail: `Capital ${formatMoneda(r.capitalAnterior, instrumento.moneda)} → ${formatMoneda(r.capitalNuevo, instrumento.moneda)} · ${formatDate(r.fechaInicio)} → ${formatDate(r.fechaFin)}`,
      })
      onClose()
    })
  }

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="bg-surface-2/50 rounded-lg p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-fg-muted">Capital actual</span>
          <span className="font-mono font-semibold text-fg">{formatMoneda(saldoActual, instrumento.moneda)}</span>
        </div>
        <p className="text-[11px] text-fg-soft leading-snug">
          El capital nuevo = este capital + los intereses de los períodos cerrados. El monto exacto te lo confirma el sistema al renovar.
        </p>
        <div className="flex justify-between">
          <span className="text-fg-muted">Nuevo ciclo arranca</span>
          <span className="text-fg">{nuevoInicio ? formatDate(nuevoInicio) : '—'}</span>
        </div>
      </div>

      {/* Selector de plazo */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide">¿Por cuánto tiempo lo renovás?</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.meses}
              type="button"
              onClick={() => { setModo('meses'); setMeses(p.meses) }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                modo === 'meses' && meses === p.meses
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface-2 border-border-strong text-fg hover:border-primary',
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setModo('fecha')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm border transition-colors',
              modo === 'fecha'
                ? 'bg-primary text-white border-primary'
                : 'bg-surface-2 border-border-strong text-fg hover:border-primary',
            )}
          >
            Fecha exacta
          </button>
        </div>
        {modo === 'fecha' && (
          <input
            type="date"
            value={fechaCustom}
            min={nuevoInicio}
            onChange={(e) => setFechaCustom(e.target.value)}
            className="mt-2 bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}
      </div>

      {/* Preview del vencimiento */}
      <div className="flex items-center justify-center gap-4 bg-primary/5 border border-primary/20 rounded-lg p-4">
        <div className="text-center">
          <p className="text-[10px] text-fg-soft uppercase tracking-wide">Inicio</p>
          <p className="text-sm font-medium text-fg">{nuevoInicio ? formatDate(nuevoInicio) : '—'}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-primary" />
        <div className="text-center">
          <p className="text-[10px] text-fg-soft uppercase tracking-wide">Nuevo vencimiento</p>
          <p className="text-sm font-bold text-primary">{nuevoFin ? formatDate(nuevoFin) : '—'}</p>
        </div>
      </div>

      <p className="text-xs text-fg-soft">
        Al renovar, los intereses de los períodos cerrados se suman al capital y se abre el nuevo ciclo con ese saldo.
        Requiere que <strong>todos los períodos estén cerrados</strong>.
      </p>

      {error && <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>}

      <div className="flex justify-end gap-3 pt-3 border-t border-border">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>Cancelar</Button>
        <Button type="button" onClick={handleConfirm} disabled={isPending || !nuevoFin}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Renovar
        </Button>
      </div>
    </div>
  )
}
