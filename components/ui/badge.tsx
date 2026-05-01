import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        {
          'bg-slate-700 text-slate-300': variant === 'default',
          'bg-green-500/15 text-green-400': variant === 'success',
          'bg-amber-500/15 text-amber-400': variant === 'warning',
          'bg-red-500/15 text-red-400': variant === 'danger',
          'bg-blue-500/15 text-blue-400': variant === 'info',
          'bg-purple-500/15 text-purple-400': variant === 'purple',
        },
        className
      )}
    >
      {children}
    </span>
  )
}

export function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    PAGADO: { label: 'Pagado', variant: 'success' },
    PENDIENTE: { label: 'Pendiente', variant: 'warning' },
    VENCIDO: { label: 'Vencido', variant: 'danger' },
  }
  const config = map[estado] ?? { label: estado, variant: 'default' }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function MarcaBadge({ marca }: { marca: string }) {
  const map: Record<string, { variant: BadgeProps['variant'] }> = {
    BDI: { variant: 'purple' },
    ZATTIA: { variant: 'danger' },
    STUNNED: { variant: 'warning' },
    GENERAL: { variant: 'default' },
  }
  const config = map[marca] ?? { variant: 'default' }
  return <Badge variant={config.variant}>{marca}</Badge>
}
