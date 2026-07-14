'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

const PANEL_W = 288 // w-72

// Botón ⓘ que abre un panel explicativo. El panel se renderiza en un PORTAL a
// document.body con posición fija: así no lo recorta el `overflow-hidden` de las
// tarjetas contenedoras (bug: se abría a la mitad). El trigger es un <span role="button">
// para poder anidarse en headers que ya son button/div sin HTML inválido.
export function InfoPopover({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const reposicionar = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8))
    const top = r.bottom + 6
    setCoords({ top, left })
  }, [])

  useEffect(() => {
    if (!open) return
    reposicionar()
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', reposicionar, true)
    window.addEventListener('resize', reposicionar)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', reposicionar, true)
      window.removeEventListener('resize', reposicionar)
    }
  }, [open, reposicionar])

  return (
    <span ref={triggerRef} className="relative inline-flex shrink-0">
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
      {open && coords != null && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: PANEL_W }}
          className="z-[100] max-w-[92vw] rounded-lg border border-border-strong bg-surface shadow-xl p-3 text-left normal-case"
        >
          <p className="text-xs font-semibold text-fg mb-1 tracking-normal">{titulo}</p>
          <div className="text-[11px] leading-relaxed text-fg-muted space-y-1 font-normal tracking-normal">{children}</div>
        </div>,
        document.body,
      )}
    </span>
  )
}
