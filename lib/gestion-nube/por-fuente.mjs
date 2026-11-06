// De qué sistema sale lo vendido de cada marca en el mes: Gestión Nube ('gn') o el ERP ('erp').
// Desde nov-2026 el lector del ERP trae las dos, cada venta con su `fuente`. Lo usan la sync de
// ventas del dashboard (app/actions/gestion-nube.ts) y su réplica por CLI (scripts/sync-ventas-gn.mjs):
// la regla vive acá para que las dos guarden lo mismo en datos_ventas_gn.por_fuente.
//
// Forma guardada, por marca: { gn?: Tramo, erp?: Tramo, sin_dato?: Tramo }
//   Tramo = { ventas: n° de ventas, brutas: Σ ventas con IVA de esa marca, desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD' }
// Una venta sin `fuente` NO se supone de GN: queda en 'sin_dato' y la pantalla lo muestra.

/** @typedef {{ ventas: number, brutas: number, desde: string, hasta: string }} Tramo */
/** @typedef {Record<string, Tramo>} PorFuente */

/** Normaliza el campo `fuente` de una venta del lector. */
export function fuenteDe(venta) {
  const f = venta?.fuente
  return f === 'gn' || f === 'erp' ? f : 'sin_dato'
}

/**
 * Suma una venta (la parte de UNA marca) al acumulado de esa marca. Muta y devuelve `por`.
 * @param {PorFuente} por
 * @param {string} fuente  'gn' | 'erp' | 'sin_dato'
 * @param {string} fecha   date_sale de la venta (se toma el día)
 * @param {number} brutas  ventas con IVA de esa marca en esa venta
 */
export function sumarFuente(por, fuente, fecha, brutas) {
  const dia = String(fecha || '').slice(0, 10)
  const t = por[fuente] ?? { ventas: 0, brutas: 0, desde: dia, hasta: dia }
  t.ventas += 1
  t.brutas += Number(brutas) || 0
  if (dia && (!t.desde || dia < t.desde)) t.desde = dia
  if (dia && (!t.hasta || dia > t.hasta)) t.hasta = dia
  por[fuente] = t
  return por
}

/** Redondea a centavos para guardar. */
export function cerrarFuente(por) {
  return Object.fromEntries(
    Object.entries(por).map(([k, t]) => [k, { ...t, brutas: Math.round(t.brutas * 100) / 100 }]),
  )
}
