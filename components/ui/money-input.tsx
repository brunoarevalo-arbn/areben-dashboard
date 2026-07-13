'use client'

import { forwardRef, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const fmt = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatear(n: number): string {
  if (!isFinite(n)) return ''
  return fmt.format(n)
}

function parsear(text: string): number {
  if (!text) return 0
  // Remover puntos (separador miles) y reemplazar coma por punto (decimal)
  const cleaned = text.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

interface Props {
  value: number
  onChange: (v: number) => void
  label?: string
  prefix?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  required?: boolean
  min?: number
  hint?: string
}

export const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput(
  { value, onChange, label, prefix = '$', placeholder = '0,00', className, disabled, required, hint },
  ref,
) {
  const [text, setText] = useState<string>(value > 0 ? formatear(value) : '')
  const [focused, setFocused] = useState(false)

  // El prefijo va posicionado absoluto en left-3; el padding izquierdo del input tiene que
  // dejarle lugar según su ancho. "$" (1 char) entra en pl-8; "U$S" (3 chars) necesita más.
  const padLeftByLen: Record<number, string> = { 1: 'pl-8', 2: 'pl-10', 3: 'pl-12', 4: 'pl-14' }
  const padLeft = padLeftByLen[Math.min(prefix.length, 4)] ?? 'pl-8'

  // Sincronizar cuando el value externo cambia (ej: defaults, recálculos)
  useEffect(() => {
    if (!focused) {
      setText(value > 0 ? formatear(value) : '')
    }
  }, [value, focused])

  function onFocus() {
    setFocused(true)
    // Mostrar el número raw editable: 1234.5 → "1234,5"
    setText(value > 0 ? String(value).replace('.', ',') : '')
  }

  function onBlur() {
    setFocused(false)
    setText(value > 0 ? formatear(value) : '')
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setText(raw)
    onChange(parsear(raw))
  }

  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-fg-muted">{label}</label>}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-soft text-sm pointer-events-none select-none">
          {prefix}
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={onInput}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={cn(
            'w-full pr-3.5 py-2.5 bg-surface-2 border border-border-strong rounded-lg text-fg font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-sm',
            padLeft,
            disabled && 'opacity-60 cursor-not-allowed',
            className,
          )}
        />
      </div>
      {hint && <p className="text-xs text-fg-soft">{hint}</p>}
    </div>
  )
})
