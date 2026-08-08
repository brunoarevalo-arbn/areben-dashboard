'use client'

import { useEffect, useState, useTransition } from 'react'
import { previsualizarDevolucion, devolverYCerrarInstrumento, type DetalleDevolucion } from '@/app/actions/inversiones'
import type { Instrumento } from '@/types/database'
import { Button } from '@/components/ui/button'
import { formatMoneda } from '@/lib/inversiones-calc'
import { formatDate, formatMonth } from '@/lib/utils'
import { Loader2, HandCoins, AlertTriangle, Info } from 'lucide-react'

function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function DevolverModal({
  instrumento,
  onDone,
  onClose,
}: {
  instrumento: Instrumento
  onDone: (detalle: DetalleDevolucion) => void
  onClose: () => void
}) {
  // Por defecto, el día del vencimiento: es el día en que se le paga.
  const [fecha, setFecha] = useState(instrumento.fecha_fin ?? hoyISO())
  const [detalle, setDetalle] = useState<DetalleDevolucion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [calculando, startCalculo] = useTransition()
  const [guardando, startGuardado] = useTransition()

  // Recalcular cada vez que cambia la fecha: lo que se muestra es exactamente
  // lo que se va a aplicar (es el mismo cálculo del lado del servidor).
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return
    startCalculo(async () => {
      const r = await previsualizarDevolucion(instrumento.id, fecha)
      if (r.ok) { setDetalle(r.detalle); setError(null) }
      else { setDetalle(null); setError(r.error) }
    })
  }, [fecha, instrumento.id])

  const confirmar = () => {
    if (!detalle) return
    startGuardado(async () => {
      const r = await devolverYCerrarInstrumento(instrumento.id, fecha)
      if (!r.ok) { setError(r.error); return }
      onDone(r.detalle)
      onClose()
    })
  }

  const ocupado = calculando || guardando

  return (
    <div className="space-y-5">
      <p className="text-sm text-fg-muted">
        Le devolvés la plata al inversor y el instrumento queda cerrado. El día que le pagás no
        genera interés: es el día en que se cierra el trato.
      </p>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-fg-muted uppercase tracking-wide">
          ¿Qué día le pagás?
        </label>
        <input
          type="date"
          value={fecha}
          min={instrumento.fecha_inicio}
          onChange={(e) => setFecha(e.target.value)}
          className="bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {instrumento.fecha_fin && (
          <p className="text-[11px] text-fg-soft">
            Vencimiento acordado: {formatDate(instrumento.fecha_fin)}
          </p>
        )}
      </div>

      {/* Detalle de la liquidación */}
      <div className="bg-surface-2/50 rounded-lg p-4 space-y-2 text-sm min-h-[7rem]">
        {calculando && !detalle ? (
          <p className="text-fg-soft flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Calculando…</p>
        ) : detalle ? (
          <>
            <div className="flex justify-between">
              <span className="text-fg-muted">Capital que le queda</span>
              <span className="font-mono text-fg">{formatMoneda(detalle.capitalPendiente, detalle.moneda)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">
                Intereses {detalle.anticipada ? 'hasta ese día' : 'del plazo'}
              </span>
              <span className="font-mono text-amber-700">{formatMoneda(detalle.interesesCiclo, detalle.moneda)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-border-strong/50">
              <span className="font-semibold text-fg">Total a devolver</span>
              <span className="font-mono text-base font-bold text-fg">
                {formatMoneda(detalle.totalADevolver, detalle.moneda)}
              </span>
            </div>
            <p className="text-[11px] text-fg-soft pt-1">
              Devenga hasta el {formatDate(
                new Date(new Date(`${detalle.fechaCorte}T00:00:00Z`).getTime() - 86400000).toISOString().substring(0, 10)
              )} inclusive.
            </p>
          </>
        ) : null}
      </div>

      {detalle?.anticipada && (
        <div className="flex gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-fg-muted">
            Se va antes de tiempo: el plazo no se cumplió, así que los intereses se calculan por los
            días que estuvo, no por el mes entero.
          </p>
        </div>
      )}

      {detalle && detalle.movimientosDelCicloAnterior.length > 0 && (
        <div className="flex gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-fg-muted">
            Este ciclo arrancó a mitad de mes y en{' '}
            {detalle.movimientosDelCicloAnterior.map((m) => formatMonth(m.mes)).join(', ')} hay
            movimientos del ciclo anterior ({detalle.movimientosDelCicloAnterior
              .map((m) => formatMoneda(m.monto, detalle.moneda)).join(', ')}).
            No se vuelven a descontar porque al renovar ya quedaron dentro del capital.{' '}
            <strong>Revisá que el capital de arriba sea el que le debés.</strong>
          </p>
        </div>
      )}

      {detalle && detalle.mesesAbiertos.length > 0 && (
        <div className="flex gap-2 bg-primary/5 border border-primary/20 rounded-lg p-3">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-fg-muted">
            Después de cerrar, acordate de cerrar {detalle.mesesAbiertos.length === 1 ? 'el mes' : 'los meses'}{' '}
            <strong>{detalle.mesesAbiertos.map(formatMonth).join(', ')}</strong> en Inversiones → Cierre mensual,
            para que los intereses lleguen a Gastos.
          </p>
        </div>
      )}

      <p className="text-[11px] text-fg-soft leading-snug">
        La plata que sale no se carga como gasto: devolver capital no es un gasto, es que baja una
        deuda. Se refleja solo cuando cargás el saldo de Tesorería de fin de mes.
      </p>

      {error && <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>}

      <div className="flex justify-end gap-3 pt-3 border-t border-border">
        <Button type="button" variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button type="button" onClick={confirmar} disabled={ocupado || !detalle}>
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <HandCoins className="w-4 h-4" />}
          Devolver y cerrar
        </Button>
      </div>
    </div>
  )
}
