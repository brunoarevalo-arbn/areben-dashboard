'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'
import { TopNav } from './topnav'
import { QuickActions } from './quick-actions'
import { MesActivoProvider } from '@/components/mes-activo/mes-activo-provider'
import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  userEmail?: string
}

export function DashboardShell({ children, userEmail }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()

  // Cerrar el drawer al navegar
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Bloquear scroll del body cuando el drawer está abierto
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  return (
    <MesActivoProvider>
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* Sidebar — visible siempre en desktop, drawer en mobile */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          'md:hidden fixed inset-0 z-40 transition-opacity',
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        aria-hidden={!drawerOpen}
      >
        {/* Overlay */}
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setDrawerOpen(false)}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        {/* Panel */}
        <div
          className={cn(
            'absolute left-0 top-0 h-full transition-transform duration-200 ease-out',
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <Sidebar />
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav userEmail={userEmail} onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          {children}
        </main>
      </div>

      <QuickActions />
    </div>
    </MesActivoProvider>
  )
}
