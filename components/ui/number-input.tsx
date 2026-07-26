'use client'

import { forwardRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Campo numérico que se deja escribir.
 *
 * El problema que resuelve: un `<input type="number">` atado a un número no se
 * puede dejar vacío. Al borrar el contenido el valor pasa a 0 y el campo vuelve
 * a mostrar "0" solo, así que para cargar un monto hay que borrar el cero
 * primero; y si se escribe sin borrarlo queda pegado adelante ("0500").
 *
 * Acá el texto que se está tipeando vive aparte del número: mientras el campo
 * tiene foco manda lo que se escribió (incluido vacío, "-" o "12." a medio
 * escribir) y al salir se sincroniza con el valor de afuera. Hacia el formulario
 * sigue entregando un número, así que reemplaza al input viejo sin cambiar
 * ninguna cuenta.
 *
 * El cero:
 *   value={null}            → vacío (dato sin completar)
 *   value={0}               → vacío (el 0 se asume "sin completar", que es el
 *                             caso normal en un alta)
 *   value={0} mostrarCero   → "0" (el cero es un dato real, cargado a propósito
 *                             — ej: una cuenta que cerró el mes en cero)
 */

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | null | undefined
  onChange: (value: number) => void
  /** Mostrar "0" en vez de vacío cuando el valor es cero (cero cargado a propósito). */
  mostrarCero?: boolean
  label?: string
  error?: string
  /** Seleccionar el contenido al entrar, así escribir lo reemplaza (por defecto sí). */
  seleccionarAlEntrar?: boolean
}

/** Texto que le corresponde a un valor guardado. */
export function textoDeNumero(value: number | null | undefined, mostrarCero?: boolean): string {
  if (value === null || value === undefined) return ''
  // Un cálculo que se fue a NaN/Infinito se muestra vacío, no con la palabra "NaN"
  if (!Number.isFinite(value)) return ''
  if (value === 0 && !mostrarCero) return ''
  return String(value)
}

/**
 * Número que se le entrega al formulario para un texto tipeado.
 * Lo que no es un número todavía ('', '-', '.') vale 0, para que las cuentas que
 * dependen del campo no se rompan mientras se escribe.
 */
export function numeroDeTexto(texto: string): number {
  const n = Number(texto)
  return Number.isNaN(n) ? 0 : n
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    { value, onChange, mostrarCero, label, error, className, id, onFocus, onBlur, seleccionarAlEntrar = true, ...props },
    ref,
  ) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s/g, '-')
    // null = no se está editando; el texto sale del value de afuera.
    // Mientras se edita manda esto, para poder dejarlo vacío o a medio escribir.
    const [textoEditando, setTextoEditando] = useState<string | null>(null)
    const mostrado = textoEditando ?? textoDeNumero(value, mostrarCero)
    // Con label se comporta como un campo de formulario (mismo estilo que <Input>).
    // Sin label es un input pelado que usa el className de quien lo llama.
    const esCampoDeFormulario = !!label || !!error

    const input = (
      <input
        id={inputId}
        ref={ref}
        type="number"
        inputMode="decimal"
        value={mostrado}
        onFocus={(e) => {
          if (seleccionarAlEntrar) e.target.select()
          onFocus?.(e)
        }}
        onChange={(e) => {
          setTextoEditando(e.target.value)
          onChange(numeroDeTexto(e.target.value))
        }}
        onBlur={(e) => {
          // Se suelta el texto a medias y el campo vuelve a reflejar el valor real
          setTextoEditando(null)
          onBlur?.(e)
        }}
        className={cn(
          esCampoDeFormulario &&
            'w-full px-3.5 py-2.5 bg-surface-2 border rounded-lg text-fg placeholder-fg-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-sm',
          esCampoDeFormulario && (error ? 'border-danger' : 'border-border-strong'),
          className,
        )}
        {...props}
      />
    )

    // Sin label ni error va SIN envoltorio: agregar un <div> acá rompe el diseño
    // de las filas y grillas donde el input estaba puesto directo.
    if (!esCampoDeFormulario) return input

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-fg">
            {label}
          </label>
        )}
        {input}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    )
  },
)
NumberInput.displayName = 'NumberInput'
