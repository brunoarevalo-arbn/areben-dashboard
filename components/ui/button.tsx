import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-primary hover:bg-primary-hover text-on-primary': variant === 'primary',
            'bg-surface hover:bg-surface-2 text-fg border border-border-strong': variant === 'secondary',
            'hover:bg-surface-2 text-fg-muted hover:text-fg': variant === 'ghost',
            'bg-danger-bg hover:opacity-90 text-danger border border-danger-bd': variant === 'danger',
            'bg-success-bg hover:opacity-90 text-success border border-success-bd': variant === 'success',
            'bg-warning-bg hover:opacity-90 text-warning border border-warning-bd': variant === 'warning',
          },
          {
            'px-2.5 py-1.5 text-xs': size === 'sm',
            'px-4 py-2 text-sm': size === 'md',
            'px-5 py-2.5 text-base': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
