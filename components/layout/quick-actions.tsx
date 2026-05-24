'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Plus, X, Receipt, ShoppingCart, Users, UserPlus, ArrowDownUp, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const SOCIOS_RETIRO = ['Darío Arévalo', 'Bruno Arévalo']

interface QuickAction {
  label: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}

const ACCIONES: QuickAction[] = [
  {
    label: 'Gasto',
    description: 'Registrar un gasto del día',
    href: '/finanzas/gastos?nuevo=1',
    icon: Receipt,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  {
    label: 'Compra',
    description: 'Cargar nueva compra a proveedor',
    href: '/compras/lista?nuevo=1',
    icon: ShoppingCart,
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  },
  {
    label: 'Nómina',
    description: 'Liquidar sueldo de un empleado',
    href: '/rrhh/nomina?nuevo=1',
    icon: Users,
    color: 'text-green-400 bg-green-500/10 border-green-500/30',
  },
  {
    label: 'Proveedor',
    description: 'Agregar nuevo proveedor',
    href: '/compras/proveedores?nuevo=1',
    icon: UserPlus,
    color: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
  },
]

export function QuickActions() {
  const [open, setOpen] = useState(false)
  const [retirosOpen, setRetirosOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setRetirosOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        setRetirosOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {/* Submenú retiros */}
      {open && retirosOpen && (
        <div className="bg-white border border-[#d6d0c4] rounded-xl shadow-2xl overflow-hidden min-w-[220px] mb-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-4 py-2 border-b border-[#e8e4dc] bg-[#f5f0e6]/40">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Retiro de socio</p>
          </div>
          {SOCIOS_RETIRO.map((socio) => (
            <Link
              key={socio}
              href={`/finanzas/retiros?nuevo=1&socio=${encodeURIComponent(socio)}`}
              onClick={() => { setOpen(false); setRetirosOpen(false) }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[#f5f0e6]/60 transition-colors border-b border-[#e8e4dc]/40 last:border-0"
              title={`Cargar retiro para ${socio}`}
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 font-semibold text-xs">
                {socio.split(' ').map((p) => p[0]).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{socio}</p>
                <p className="text-xs text-slate-500">Pre-llenar formulario</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Menú principal */}
      {open && !retirosOpen && (
        <div className="bg-white border border-[#d6d0c4] rounded-xl shadow-2xl overflow-hidden min-w-[260px] animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-4 py-2 border-b border-[#e8e4dc] bg-[#f5f0e6]/40">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Acceso rápido</p>
          </div>

          {ACCIONES.map((a) => {
            const Icon = a.icon
            return (
              <Link
                key={a.label}
                href={a.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#f5f0e6]/60 transition-colors border-b border-[#e8e4dc]/40"
                title={a.description}
              >
                <div className={cn('w-9 h-9 rounded-lg border flex items-center justify-center', a.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{a.label}</p>
                  <p className="text-xs text-slate-500 truncate">{a.description}</p>
                </div>
              </Link>
            )
          })}

          {/* Retiros con submenú */}
          <button
            type="button"
            onClick={() => setRetirosOpen(true)}
            title="Cargar un retiro de socio (Darío, Bruno)"
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#f5f0e6]/60 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 flex items-center justify-center">
              <ArrowDownUp className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900">Retiro de socio</p>
              <p className="text-xs text-slate-500">Elegir titular →</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      )}

      {/* Botón FAB */}
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          setRetirosOpen(false)
        }}
        title={open ? 'Cerrar menú rápido' : 'Acceso rápido — crear gasto, compra, nómina, retiro o proveedor'}
        className={cn(
          'w-14 h-14 rounded-full shadow-2xl border flex items-center justify-center transition-all',
          open
            ? 'bg-[#f5f0e6] border-[#c8c0b0] rotate-45'
            : 'bg-orange-500 border-orange-500 hover:bg-orange-500 hover:scale-105',
        )}
      >
        {open ? <X className="w-6 h-6 text-slate-900" /> : <Plus className="w-6 h-6 text-white" />}
      </button>
    </div>
  )
}
