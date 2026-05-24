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
          'bg-slate-100 text-slate-700': variant === 'default',
          'bg-green-50 text-green-700 border border-green-100': variant === 'success',
          'bg-amber-50 text-amber-700 border border-amber-100': variant === 'warning',
          'bg-red-50 text-red-700 border border-red-100': variant === 'danger',
          'bg-blue-50 text-blue-700 border border-blue-100': variant === 'info',
          'bg-purple-50 text-purple-700 border border-purple-100': variant === 'purple',
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
