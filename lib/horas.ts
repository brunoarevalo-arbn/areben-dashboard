/**
 * Horas extras: la unidad y cómo se escribe.
 *
 * 🔑 **Adentro todo es HORAS DECIMALES.** `horas_extras_registros.cantidad`,
 * `nomina_mensual.horas_extras`, `empleados.valor_hora` y el motor de `lib/calc/nomina.ts`
 * hablan horas: cambiar la unidad del dato sería tocar la nómina entera. Lo que se agregó es
 * **cómo se carga y cómo se muestra**: la persona piensa en "1 h 20", no en "1,3333".
 *
 * Por eso la conversión y el formato viven acá y en ningún otro lado. Media regla escrita en el
 * JSX de una pantalla no la copia la de al lado: si el link del empleado redondea distinto que la
 * bandeja de aprobación, los dos números son creíbles y uno miente.
 *
 * ⚠️ 1/60 no es exacto en decimal (20 min = 0,3333…). Las columnas se guardan con **4 decimales**
 * (migración 081) justamente para que el minuto entre y vuelva a salir entero: con 2 decimales
 * sumar tres cargas de 20 min daba 0,99 h y la pantalla decía "59 min".
 */

/** Decimales con los que se guarda una cantidad de horas. Es el `numeric(8,4)` de la mig 081. */
export const DECIMALES_HORA = 4

/** Lo mínimo que se puede cargar. La regla real es "que redondee a por lo menos un minuto". */
export const MINUTOS_MINIMOS = 1

/** Tope por día, el mismo que valida `horas_cargar_por_token` en la base. */
export const HORAS_MAXIMAS_POR_DIA = 12

/**
 * Horas decimales → minutos enteros. Es el redondeo que decide si algo llega al mínimo,
 * así que la validación de la base (`round(p_cantidad * 60) < 1`) es esta misma cuenta.
 */
export function horasAMinutos(horas: number): number {
  if (!Number.isFinite(horas)) return 0
  return Math.round(horas * 60)
}

/** Minutos enteros → horas decimales, con la precisión con la que se guardan. */
export function minutosAHoras(minutos: number): number {
  if (!Number.isFinite(minutos)) return 0
  const f = 10 ** DECIMALES_HORA
  return Math.round((minutos / 60) * f) / f
}

/**
 * Una cantidad de horas partida en el par que se muestra y se edita.
 * `minutos` siempre queda entre 0 y 59: el acarreo lo hace acá, no cada pantalla.
 */
export function partirHoras(horas: number): { horas: number; minutos: number } {
  const total = Math.abs(horasAMinutos(horas))
  return { horas: Math.floor(total / 60), minutos: total % 60 }
}

/** El par (horas, minutos) → las horas decimales que se guardan. */
export function unirHoras(horas: number, minutos: number): number {
  return minutosAHoras(Math.round((Number(horas) || 0) * 60 + (Number(minutos) || 0)))
}

/**
 * Cómo se escribe una cantidad de horas en pantalla: `2 h 30 min` · `45 min` · `2 h`.
 *
 * ⛔ No usar `${cantidad} hs` en ningún lado: es lo que mostraba "0.3333 hs" en cuanto alguien
 * cargó 20 minutos. Si hace falta el número pelado (un input, un CSV), va el dato, no el texto.
 */
export function formatHoras(horas: number): string {
  const total = horasAMinutos(horas)
  if (total === 0) return '0 h'
  const signo = total < 0 ? '−' : ''
  const { horas: h, minutos: m } = partirHoras(horas)
  if (h && m) return `${signo}${h} h ${m} min`
  if (h) return `${signo}${h} h`
  return `${signo}${m} min`
}
