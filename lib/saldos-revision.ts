/**
 * Estado de revisión de un saldo mensual (Tesorería e Impositivos).
 *
 * El problema que resuelve: un saldo cargado en $0 se ve exactamente igual que
 * una cuenta que nunca se miró. Con esto hay tres estados distinguibles:
 *
 *   sin-cargar  → no existe la fila del mes. Nadie tocó esa cuenta.
 *   cargado     → hay un monto guardado (aunque sea $0), pero nadie lo confirmó.
 *   revisado    → alguien lo dio por bueno, con fecha y nombre.
 *
 * Regla: editar el monto vuelve el saldo a "cargado" (lo hacen las server actions),
 * así el tilde verde nunca queda pegado a un número viejo.
 */

export type EstadoRevision = 'sin-cargar' | 'cargado' | 'revisado'

export interface SaldoRevisable {
  cerrado?: boolean | null
  fecha_cierre?: string | null
  revisado_por?: string | null
  updated_at?: string | null
}

/**
 * @param saldo         fila del saldo del mes (undefined = no cargado)
 * @param mesConfirmado true si el cierre de ese mes ya está confirmado. En ese caso
 *                      todo lo cargado se considera revisado: si el mes se cerró,
 *                      es porque esos saldos se miraron (evita que los meses
 *                      históricos aparezcan como pendientes para siempre).
 */
export function estadoRevision(saldo: SaldoRevisable | undefined | null, mesConfirmado = false): EstadoRevision {
  if (!saldo) return 'sin-cargar'
  if (saldo.cerrado) return 'revisado'
  return mesConfirmado ? 'revisado' : 'cargado'
}

const NOMBRES: Record<string, string> = {
  'brunoarevalo@arebensrl.com': 'Bruno',
  'darioarevalo@arebensrl.com': 'Darío',
}

/** Email → nombre corto para mostrar ("Bruno"), con el email como respaldo. */
export function nombreRevisor(email?: string | null): string | null {
  if (!email) return null
  return NOMBRES[email.toLowerCase()] ?? email.split('@')[0]
}

/** '2026-07-25T19:29:26Z' → '25/7' */
export function fechaCorta(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/** Texto del chip: "Revisado 25/7 por Bruno" / "Cargado el 25/7" / "Sin cargar". */
export function textoRevision(saldo: SaldoRevisable | undefined | null, mesConfirmado = false): string {
  const estado = estadoRevision(saldo, mesConfirmado)
  if (estado === 'sin-cargar') return 'Sin cargar'
  if (estado === 'cargado') {
    const f = fechaCorta(saldo?.updated_at)
    return f ? `Cargado el ${f}` : 'Cargado'
  }
  // revisado: si viene del cierre confirmado no hay fecha propia de revisión
  const f = fechaCorta(saldo?.fecha_cierre)
  const quien = nombreRevisor(saldo?.revisado_por)
  if (!f) return 'Revisado (mes cerrado)'
  return quien ? `Revisado ${f} por ${quien}` : `Revisado ${f}`
}

/**
 * El activo en dólares se suma por tres caminos que no se controlan entre sí:
 * la columna USD de las cuentas, los activos manuales en USD y la caja en dólares
 * del cierre. Si el mismo efectivo está en más de uno, el activo queda inflado.
 * Devuelve los lugares donde hay dólares cargados; con 2 o más, conviene avisar.
 */
export function lugaresConDolares(opts: {
  enCuentas?: boolean
  enManuales?: boolean
  enCajaCierre?: boolean
}): string[] {
  return [
    opts.enCuentas && 'la columna USD de las cuentas',
    opts.enManuales && 'otros activos manuales',
    opts.enCajaCierre && 'la caja en dólares del cierre',
  ].filter(Boolean) as string[]
}

/** Variación contra el mes anterior, para detectar saldos que se olvidaron de cargar. */
export function variacion(actual: number, anterior: number | null | undefined): {
  hay: boolean
  delta: number
  /** true si la cuenta tenía plata y ahora figura en cero — el caso que más conviene mirar dos veces. */
  cayoACero: boolean
} {
  if (anterior === null || anterior === undefined) return { hay: false, delta: 0, cayoACero: false }
  const delta = Math.round((actual - anterior) * 100) / 100
  return {
    hay: Math.abs(delta) > 0.01,
    delta,
    cayoACero: Math.abs(actual) < 0.01 && Math.abs(anterior) > 0.01,
  }
}
