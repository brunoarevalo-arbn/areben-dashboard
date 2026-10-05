'use client'

import { forwardRef, useLayoutEffect, useRef, useState } from 'react'
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
 *
 * Montos (`moneda="ARS"` o `"USD"`): el campo se ve como plata mientras se escribe
 * — "$ 8.800.000", "US$ 4.800,50". Los puntos de miles aparecen solos (no hace
 * falta tipearlos: el punto se ignora) y los centavos van con coma.
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
  /** Mostrarlo como monto: signo y puntos de miles. */
  moneda?: Moneda
}

type Moneda = 'ARS' | 'USD'
const PREFIJO: Record<Moneda, string> = { ARS: '$ ', USD: 'US$ ' }

/** "8800000" → "8.800.000" (se arma a mano: Intl no pone el punto en 4 cifras). */
function conPuntos(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function armarMonto(negativo: boolean, entero: string, coma: boolean, decimales: string, moneda: Moneda): string {
  return `${negativo ? '-' : ''}${PREFIJO[moneda]}${conPuntos(entero)}${coma ? `,${decimales}` : ''}`
}

/**
 * Lo que se tipeó → cómo se ve: "8800000" → "$ 8.800.000".
 * La coma separa centavos (hasta 2); el punto se descarta porque en pesos es el de
 * miles y ya lo pone el campo. Un "-" en cualquier lugar lo hace negativo.
 */
export function formatearMontoTipeado(crudo: string, moneda: Moneda): string {
  const negativo = crudo.includes('-')
  const iComa = crudo.indexOf(',')
  const coma = iComa >= 0
  const digitos = (t: string) => t.replace(/\D/g, '')
  let entero = digitos(coma ? crudo.slice(0, iComa) : crudo).replace(/^0+(?=\d)/, '')
  const decimales = coma ? digitos(crudo.slice(iComa + 1)).slice(0, 2) : ''
  if (!entero && !coma) return negativo ? '-' : ''
  if (!entero) entero = '0'
  return armarMonto(negativo, entero, coma, decimales, moneda)
}

/** "-$ 8.800.000,5" → -8800000.5 (lo que no se puede leer vale 0). */
export function montoDeTexto(texto: string): number {
  const iComa = texto.indexOf(',')
  const entero = (iComa >= 0 ? texto.slice(0, iComa) : texto).replace(/\D/g, '')
  const decimales = iComa >= 0 ? texto.slice(iComa + 1).replace(/\D/g, '') : ''
  const n = Number(`${entero || '0'}.${decimales || '0'}`)
  if (!Number.isFinite(n)) return 0
  return texto.includes('-') ? -n : n
}

/** Texto de un monto guardado: 8800000 → "$ 8.800.000"; 4800.5 → "US$ 4.800,50". */
export function textoDeMonto(value: number | null | undefined, moneda: Moneda, mostrarCero?: boolean): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  if (value === 0 && !mostrarCero) return ''
  const [entero, dec = ''] = Math.abs(value).toFixed(2).split('.')
  const decimales = dec === '00' ? '' : dec
  return armarMonto(value < 0, entero, !!decimales, decimales, moneda)
}

/** Cuántas cifras (y coma) hay antes de la posición: sirve para no perder el cursor al reformatear. */
function cifrasAntes(texto: string, pos: number): number {
  return texto.slice(0, pos).replace(/[^\d,]/g, '').length
}

function posicionTrasCifras(texto: string, cifras: number): number {
  if (cifras === 0) {
    // Antes de la primera cifra, pero después del signo
    const i = texto.search(/[\d,]/)
    return i < 0 ? texto.length : i
  }
  let vistas = 0
  for (let i = 0; i < texto.length; i++) {
    if (/[\d,]/.test(texto[i])) vistas++
    if (vistas === cifras) return i + 1
  }
  return texto.length
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
    { value, onChange, mostrarCero, label, error, className, id, onFocus, onBlur, seleccionarAlEntrar = true, moneda, ...props },
    ref,
  ) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s/g, '-')
    // null = no se está editando; el texto sale del value de afuera.
    // Mientras se edita manda esto, para poder dejarlo vacío o a medio escribir.
    const [textoEditando, setTextoEditando] = useState<string | null>(null)
    const mostrado = textoEditando ?? (moneda ? textoDeMonto(value, moneda, mostrarCero) : textoDeNumero(value, mostrarCero))
    // Al meter los puntos el texto cambia de largo: el cursor se repone después de la
    // misma cantidad de cifras, si no salta al final en medio de una corrección.
    const inputRef = useRef<HTMLInputElement | null>(null)
    const cursorPendiente = useRef<number | null>(null)
    useLayoutEffect(() => {
      const el = inputRef.current
      if (el && cursorPendiente.current !== null && document.activeElement === el) {
        const pos = posicionTrasCifras(el.value, cursorPendiente.current)
        el.setSelectionRange(pos, pos)
      }
      cursorPendiente.current = null
    })
    // Con label se comporta como un campo de formulario (mismo estilo que <Input>).
    // Sin label es un input pelado que usa el className de quien lo llama.
    const esCampoDeFormulario = !!label || !!error

    const input = (
      <input
        id={inputId}
        ref={(el) => {
          inputRef.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        // Con moneda tiene que ser texto: un input numérico no acepta "$" ni puntos
        type={moneda ? 'text' : 'number'}
        inputMode="decimal"
        value={mostrado}
        onFocus={(e) => {
          if (seleccionarAlEntrar) e.target.select()
          onFocus?.(e)
        }}
        onChange={(e) => {
          if (moneda) {
            const crudo = e.target.value
            cursorPendiente.current = cifrasAntes(crudo, e.target.selectionStart ?? crudo.length)
            const texto = formatearMontoTipeado(crudo, moneda)
            setTextoEditando(texto)
            onChange(montoDeTexto(texto))
            return
          }
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
