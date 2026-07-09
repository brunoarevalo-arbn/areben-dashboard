// Catálogo de "sectores" que pueden marcarse como listos por mes (ver estado_sector_mes).
// Se mantiene en código (como la navegación del sidebar), no en la DB. Para sumar un
// sector nuevo, agregar una entrada acá y el botón "Marcar listo" en su pantalla.

export interface Sector {
  key: string    // identificador estable, usado como estado_sector_mes.sector
  label: string  // nombre visible
  ruta: string   // a dónde linkea desde el panel del Home
}

export const SECTORES: Sector[] = [
  { key: 'saldos-impositivos', label: 'Saldos impositivos', ruta: '/finanzas/saldos-impositivos' },
  // Sumar acá: tesoreria, gastos, nomina, compras, etc.
]

export const SECTOR_KEYS = SECTORES.map((s) => s.key)

export function esSectorValido(key: string): boolean {
  return SECTOR_KEYS.includes(key)
}
