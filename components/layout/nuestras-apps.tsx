'use client'

import { useEffect, useRef, useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { APPS, APP_ACTUAL, linkDe } from '@/lib/apps-areben'

/**
 * "Nuestras apps": el salto a los otros sistemas internos, desde la barra superior.
 *
 * Se listan las cinco a todo el mundo, incluso las que la persona no usa: el
 * criterio es que todos sepan qué herramientas existen — si alguien necesita una,
 * la pide, en vez de no enterarse de que está. Quien no tenga acceso ve el mensaje
 * de "tu cuenta no tiene acceso a este sistema", que las tres apps ya dan.
 */
export function NuestrasApps() {
  const [abierto, setAbierto] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)

  // Cerrar al clickear afuera o con Escape.
  useEffect(() => {
    if (!abierto) return
    const afuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', afuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', afuera)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto])

  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        className="p-2 rounded-lg hover:bg-surface-2 text-fg-muted hover:text-fg transition-colors"
        title="Nuestras apps"
        aria-label="Nuestras apps"
      >
        <LayoutGrid className="w-4 h-4" />
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-72 bg-surface border border-border rounded-xl shadow-xl p-1.5 z-50"
        >
          <p className="px-2.5 py-1.5 text-xs font-medium text-fg-soft">Nuestras apps</p>
          {APPS.map((app) =>
            app.id === APP_ACTUAL ? (
              <div
                key={app.id}
                className="px-2.5 py-2 rounded-lg bg-surface-2"
                aria-current="page"
              >
                <p className="text-sm font-medium text-fg">
                  {app.nombre} <span className="text-xs text-fg-soft font-normal">· estás acá</span>
                </p>
                <p className="text-xs text-fg-muted leading-snug">{app.descripcion}</p>
              </div>
            ) : (
              <a
                key={app.id}
                href={linkDe(app)}
                role="menuitem"
                onClick={() => setAbierto(false)}
                className="block px-2.5 py-2 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <p className="text-sm font-medium text-fg">{app.nombre}</p>
                <p className="text-xs text-fg-muted leading-snug">{app.descripcion}</p>
              </a>
            )
          )}
        </div>
      )}
    </div>
  )
}
