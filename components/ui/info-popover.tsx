'use client'

import { useState, useRef, useEffect } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

// Botón ⓘ que abre un panel explicativo. El trigger es un <span role="button">
// (no un <button>) para poder anidarse dentro de headers que ya son <button>/<div>
// clickeables sin HTML inválido. stopPropagation evita togglear el acordeón padre.
export function InfoPopover({
  titulo,
  children,
  align = 'right',
}: {
  titulo: string
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex shrink-0">
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o) }
        }}
        title="Ver cómo funciona esta sección"
        className={cn(
          'inline-flex items-center justify-center w-5 h-5 rounded-full cursor-pointer transition-colors',
          open ? 'bg-primary/20 text-primary' : 'text-fg-soft hover:text-primary hover:bg-surface-2',
        )}
      >
        <Info className="w-3.5 h-3.5" />
      </span>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'absolute z-30 top-6 w-72 max-w-[80vw] rounded-lg border border-border-strong bg-surface shadow-xl p-3 text-left normal-case',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <p className="text-xs font-semibold text-fg mb-1 tracking-normal">{titulo}</p>
          <div className="text-[11px] leading-relaxed text-fg-muted space-y-1 font-normal tracking-normal">{children}</div>
        </div>
      )}
    </span>
  )
}
