'use client'

import { useState, useTransition } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  /** Texto descriptivo opcional (ej. concepto, monto, vencimiento) */
  descripcion?: string
  /** Monto a mostrar como referencia */
  monto?: number
  /** Default de la fecha — útil cuando se conoce el día del débito (ej. fecha_vencimiento) */
  defaultFecha?: string
  /** Acción async que recibe la fecha confirmada y ejecuta el pago */
  onConfirm: (fecha: string) => Promise<void>
}

export function ConfirmarPagoModal({
  open,
  onOpenChange,
  title,
  descripcion,
  monto,
  defaultFecha,
  onConfirm,
}: Props) {
  const hoy = new Date().toISOString().split('T')[0]
  const [fecha, setFecha] = useState(defaultFecha ?? hoy)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Reset fecha al cambiar default cuando se abre
  function handleOpenChange(o: boolean) {
    if (o) {
      setFecha(defaultFecha ?? hoy)
      setError(null)
    }
    onOpenChange(o)
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        await onConfirm(fecha)
        onOpenChange(false)
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <Modal open={open} onOpenChange={handleOpenChange} title={title} className="max-w-md">
      <div className="space-y-4">
        {descripcion && (
          <div className="bg-surface-2 rounded-lg p-3 space-y-1">
            <p className="text-sm text-fg">{descripcion}</p>
            {monto !== undefined && monto > 0 && (
              <p className="text-xl font-mono font-bold text-amber-700">{formatCurrency(monto)}</p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Fecha real del pago</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
          <p className="text-xs text-fg-soft">
            Importante: usá la fecha REAL del débito (no la de hoy si pagaste antes). Esto afecta el cash flow histórico y los reportes de cierre.
          </p>
        </div>

        {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" variant="success" onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirmar pago
          </Button>
        </div>
      </div>
    </Modal>
  )
}
