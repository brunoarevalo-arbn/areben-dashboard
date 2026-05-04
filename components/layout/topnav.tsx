'use client'

import { signOut } from '@/app/actions/auth'
import { Bell, LogOut, User, Menu, Building2 } from 'lucide-react'

interface TopNavProps {
  userEmail?: string
  onMenuClick?: () => void
}

export function TopNav({ userEmail, onMenuClick }: TopNavProps) {
  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 sm:px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3">
        {/* Hamburger — solo mobile */}
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Brand — solo mobile, cuando el sidebar está oculto */}
        <div className="md:hidden flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
            <Building2 className="w-3.5 h-3.5 text-white" />
          </div>
          <p className="text-sm font-semibold text-slate-100">Areben</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          className="hidden sm:block p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors relative"
          aria-label="Notificaciones"
        >
          <Bell className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 sm:pl-3 sm:border-l sm:border-slate-800">
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm text-slate-300 hidden lg:block max-w-[200px] truncate">{userEmail ?? 'Usuario'}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
