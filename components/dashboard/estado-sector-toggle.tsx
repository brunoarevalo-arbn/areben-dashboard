'use client'

import { useTransition } from 'react'
import { marcarSectorListo } from '@/app/actions/estado-sectores'
import { cn } from '@/lib/utils'
import { Check, Loader2, Circle } from 'lucide-react'

export function EstadoSectorToggle({
  sector,
  mes,
  listo,
}: {
  sector: string
  mes: string
  listo: boolean
}) {
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      await marcarSectorListo(sector, mes, !listo)
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
        listo
          ? 'bg-green-500/10 border-green-500/40 text-green-700 hover:bg-green-500/20'
          : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg',
      )}
      title={listo ? 'Marcar como pendiente' : 'Marcar como listo'}
    >
      {pending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : listo ? (
        <Check className="w-3.5 h-3.5" />
      ) : (
        <Circle className="w-3.5 h-3.5" />
      )}
      {listo ? 'Listo' : 'Marcar listo'}
    </button>
  )
}
