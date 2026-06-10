'use client'

/**
 * MesActivoProvider — fuente global del "mes en el que estoy trabajando".
 *
 * Funciona así:
 * 1. Al montarse en el cliente, lee el mes desde la URL (`?mes=X`) o desde
 *    localStorage si no hay query.
 * 2. Si la URL no tenía `?mes`, hace router.replace agregándolo (sincroniza).
 * 3. Si la URL tenía un valor distinto al de localStorage, gana la URL y se
 *    actualiza el localStorage (usuarios pueden compartir links).
 * 4. El método setMes(nuevo) actualiza ambos: localStorage + URL (router.push).
 *
 * Las pages server-side siguen leyendo `searchParams.mes` como antes — este
 * provider sólo se encarga de que ese param esté siempre presente y refleje
 * la elección del usuario.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

const STORAGE_KEY = 'areben-mes-activo'

function mesCalendarioActual(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function isValidMes(s: string | null | undefined): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}$/.test(s)
}

interface MesActivoContextType {
  mes: string
  setMes: (nuevo: string) => void
  ready: boolean
}

const MesActivoContext = createContext<MesActivoContextType | undefined>(undefined)

export function useMesActivo(): MesActivoContextType {
  const ctx = useContext(MesActivoContext)
  if (!ctx) throw new Error('useMesActivo debe usarse dentro de MesActivoProvider')
  return ctx
}

export function MesActivoProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const mesURL = searchParams.get('mes')

  // Estado inicial: lo que viene en la URL (si es válido), o un calendario
  // razonable como fallback hasta que el useEffect lea el localStorage.
  const [mes, setMesState] = useState<string>(() => {
    if (isValidMes(mesURL)) return mesURL
    return mesCalendarioActual()
  })
  const [ready, setReady] = useState(false)

  // Hidratación inicial: leer localStorage y sincronizar con URL.
  useEffect(() => {
    if (ready) return

    let storedMes: string | null = null
    try { storedMes = localStorage.getItem(STORAGE_KEY) } catch {}

    let mesFinal: string
    if (isValidMes(mesURL)) {
      // URL tiene mes → gana. Persiste en localStorage para próximos ingresos.
      mesFinal = mesURL
      if (storedMes !== mesURL) {
        try { localStorage.setItem(STORAGE_KEY, mesURL) } catch {}
      }
    } else if (isValidMes(storedMes)) {
      // URL sin mes pero localStorage tiene → usar localStorage y agregar a URL.
      mesFinal = storedMes
      const params = new URLSearchParams(searchParams.toString())
      params.set('mes', storedMes)
      router.replace(`${pathname}?${params.toString()}`)
    } else {
      // Ni URL ni localStorage → mes calendario actual.
      mesFinal = mesCalendarioActual()
      try { localStorage.setItem(STORAGE_KEY, mesFinal) } catch {}
      const params = new URLSearchParams(searchParams.toString())
      params.set('mes', mesFinal)
      router.replace(`${pathname}?${params.toString()}`)
    }

    setMesState(mesFinal)
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cuando la URL cambia (ej. usuario navega o usa otro link), sincronizar.
  useEffect(() => {
    if (!ready) return
    if (isValidMes(mesURL) && mesURL !== mes) {
      setMesState(mesURL)
      try { localStorage.setItem(STORAGE_KEY, mesURL) } catch {}
    } else if (!isValidMes(mesURL) && ready) {
      // Si por algún motivo perdimos el mes de la URL (ej. navegación interna
      // a una página sin el query), lo agregamos de nuevo con el mes activo.
      const params = new URLSearchParams(searchParams.toString())
      params.set('mes', mes)
      router.replace(`${pathname}?${params.toString()}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesURL, pathname])

  const setMes = useCallback((nuevo: string) => {
    if (!isValidMes(nuevo)) return
    setMesState(nuevo)
    try { localStorage.setItem(STORAGE_KEY, nuevo) } catch {}
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', nuevo)
    router.push(`${pathname}?${params.toString()}`)
  }, [pathname, router, searchParams])

  return (
    <MesActivoContext.Provider value={{ mes, setMes, ready }}>
      {children}
    </MesActivoContext.Provider>
  )
}
