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
          'bg-neutral-bg text-neutral-fg': variant === 'default',
          'bg-success-bg text-success border border-success-bd': variant === 'success',
          'bg-warning-bg text-warning border border-warning-bd': variant === 'warning',
          'bg-danger-bg text-danger border border-danger-bd': variant === 'danger',
          'bg-info-bg text-info border border-info-bd': variant === 'info',
          'bg-purple-bg text-purple border border-purple-bd': variant === 'purple',
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
