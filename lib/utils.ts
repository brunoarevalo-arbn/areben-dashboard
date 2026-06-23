import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: 'ARS' | 'USD' = 'ARS') {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date) {
  // Strings tipo "YYYY-MM-DD" (DATE de Postgres) se deben parsear como hora
  // local, no UTC: si no, `new Date("2026-06-01")` da UTC midnight, que en
  // Argentina (UTC-3) se ve como 21:00 del día anterior.
  let d: Date
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, day] = date.split('-').map(Number)
    d = new Date(y, m - 1, day)
  } else {
    d = new Date(date)
  }
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function formatMonth(yyyyMM: string) {
  const [year, month] = yyyyMM.split('-')
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(
    new Date(Number(year), Number(month) - 1, 1)
  )
}

export function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function getMonthOptions(count = 12) {
  const options = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    options.push({ value, label: formatMonth(value) })
  }
  return options
}

// ============ Cuentas bancarias (selectores) ============
// Forma mínima que necesitan los selectores de cuenta de origen.
// El `titular` viene del join `titular:cuentas_titulares(nombre)` en las queries.
export type CuentaSelector = {
  id: string
  nombre: string
  banco: string
  titular?: { nombre: string } | null
}

// Etiqueta para el desplegable: "Titular — Banco · Nombre".
// Si la cuenta no tiene titular cargado, cae a "Banco · Nombre".
export function labelCuenta(c: CuentaSelector): string {
  const base = `${c.banco} · ${c.nombre}`
  return c.titular?.nombre ? `${c.titular.nombre} — ${base}` : base
}

// Ordena por titular, luego banco, luego nombre — así las cuentas de cada
// persona quedan agrupadas y son más fáciles de encontrar.
export function ordenarCuentas<T extends CuentaSelector>(cuentas: T[]): T[] {
  return [...cuentas].sort(
    (a, b) =>
      (a.titular?.nombre ?? '').localeCompare(b.titular?.nombre ?? '', 'es') ||
      a.banco.localeCompare(b.banco, 'es') ||
      a.nombre.localeCompare(b.nombre, 'es')
  )
}
