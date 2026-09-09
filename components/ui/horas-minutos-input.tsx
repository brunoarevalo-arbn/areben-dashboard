'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { partirHoras, unirHoras } from '@/lib/horas'

/**
 * Campo para cargar un tiempo: dos casillas, horas y minutos.
 *
 * Existe porque la gente hace "una hora y veinte", no "1,3333". Hacia afuera sigue entregando
 * **horas decimales** —lo único que entiende la nómina— y el par lo arma `lib/horas.ts`.
 *
 * ⚠️ **El acarreo se hace al SALIR del campo, no mientras se escribe.** Si normalizara en cada
 * tecla, tipear "90" en minutos pondría 1 en horas con el 90 todavía en pantalla: la casilla de
 * al lado se movería sola y el campo diría "1 h 90 min", que no es ningún tiempo. Mientras hay
 * foco manda lo tipeado; al salir, el par vuelve derivado del valor real (90 → 1 h 30 min).
 *
 * ⛔ No hay `useEffect` que sincronice el par con el valor: se DERIVA. Un par guardado en estado
 * propio se congela con el primer valor y nadie lo ve, porque la pantalla igual se dibuja bien.
 */
export function HorasMinutosInput({
  value,
  onChange,
  name,
  label,
  id,
  disabled,
  className,
  compacto,
  autoFocus,
}: {
  /** Horas decimales. `null` (o 0) = vacío. */
  value: number | null | undefined
  onChange: (horas: number | null) => void
  /** Si viene, se agrega un input oculto con las horas decimales para un `<form action>`. */
  name?: string
  label?: string
  id?: string
  disabled?: boolean
  /** Clases de cada casilla. Por defecto, las del kit de formulario. */
  className?: string
  /** Para filas de tabla y grillas: achica los rótulos "h" / "min" y el espacio entre casillas. */
  compacto?: boolean
  autoFocus?: boolean
}) {
  // Sólo mientras se está tipeando. `null` = lo que se muestra sale del valor de afuera.
  const [editando, setEditando] = useState<{ h: string; m: string } | null>(null)

  const par = partirHoras(value ?? 0)
  const vacio = !value
  const mostrado = editando ?? {
    h: vacio || par.horas === 0 ? '' : String(par.horas),
    m: vacio || par.minutos === 0 ? '' : String(par.minutos),
  }

  const escribir = (patch: Partial<{ h: string; m: string }>) => {
    const proximo = { ...mostrado, ...patch }
    setEditando(proximo)
    const horas = unirHoras(Number(proximo.h), Number(proximo.m))
    onChange(horas > 0 ? horas : null)
  }

  const inputId = id ?? name ?? label?.toLowerCase().replace(/\s/g, '-')
  const casilla = className ?? 'w-full px-3.5 py-2.5 bg-surface-2 border border-border-strong rounded-lg text-fg placeholder-fg-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-sm'

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-fg">
          {label}
        </label>
      )}
      <div className={cn('flex items-center', compacto ? 'gap-1' : 'gap-1.5')}>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          disabled={disabled}
          autoFocus={autoFocus}
          value={mostrado.h}
          aria-label="Horas"
          placeholder="0"
          onFocus={(e) => e.target.select()}
          onChange={(e) => escribir({ h: e.target.value })}
          onBlur={() => setEditando(null)}
          className={cn(casilla, 'text-right')}
        />
        <span className={cn('text-fg-soft shrink-0', compacto ? 'text-[10px]' : 'text-sm')}>h</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          // `step` en 1 y no en 5: el punto de todo esto es poder cargar 20 minutos.
          step={1}
          disabled={disabled}
          value={mostrado.m}
          aria-label="Minutos"
          placeholder="00"
          onFocus={(e) => e.target.select()}
          onChange={(e) => escribir({ m: e.target.value })}
          onBlur={() => setEditando(null)}
          className={cn(casilla, 'text-right')}
        />
        <span className={cn('text-fg-soft shrink-0', compacto ? 'text-[10px]' : 'text-sm')}>min</span>
      </div>
      {name && <input type="hidden" name={name} value={value ?? ''} />}
    </div>
  )
}
