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
            'bg-indigo-600 hover:bg-indigo-500 text-white': variant === 'primary',
            'bg-slate-700 hover:bg-slate-600 text-slate-100': variant === 'secondary',
            'hover:bg-slate-800 text-slate-300 hover:text-slate-100': variant === 'ghost',
            'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30': variant === 'danger',
            'bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30': variant === 'success',
            'bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30': variant === 'warning',
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
