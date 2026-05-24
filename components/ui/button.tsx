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
            'bg-orange-500 hover:bg-orange-600 text-white': variant === 'primary',
            'bg-white hover:bg-[#f5f0e6] text-slate-700 border border-[#e8e4dc]': variant === 'secondary',
            'hover:bg-[#f0ebe0] text-slate-600 hover:text-slate-900': variant === 'ghost',
            'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200': variant === 'danger',
            'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200': variant === 'success',
            'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200': variant === 'warning',
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
