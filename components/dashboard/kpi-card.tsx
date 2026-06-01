import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  trend?: { value: number; label: string }
  icon: React.ElementType
  iconColor?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

export function KpiCard({ title, value, subtitle, trend, icon: Icon, iconColor, variant = 'default' }: KpiCardProps) {
  const trendPositive = trend && trend.value > 0
  const trendNeutral = trend && trend.value === 0

  return (
    <div className={cn(
      'bg-surface border rounded-xl p-5',
      variant === 'default' && 'border-border',
      variant === 'success' && 'border-success-bd',
      variant === 'warning' && 'border-warning-bd',
      variant === 'danger' && 'border-danger-bd',
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center',
          iconColor ?? 'bg-primary/15'
        )}>
          <Icon className={cn(
            'w-5 h-5',
            !iconColor && 'text-primary'
          )} />
        </div>
        {trend && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
            trendNeutral ? 'bg-neutral-bg text-neutral-fg' :
            trendPositive ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          )}>
            {trendNeutral ? <Minus className="w-3 h-3" /> :
             trendPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <p className="text-sm text-fg-muted mb-1">{title}</p>
      <p className="text-2xl font-bold text-fg">{value}</p>
      {subtitle && <p className="text-xs text-fg-soft mt-1">{subtitle}</p>}
      {trend && <p className="text-xs text-fg-soft mt-1">{trend.label}</p>}
    </div>
  )
}
