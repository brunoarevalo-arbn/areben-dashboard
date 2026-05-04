/**
 * Cálculos puros relativos a gastos (IVA, neto, prorrateo).
 */

/**
 * Si el monto incluye IVA, devuelve el neto extrayendo el IVA.
 * Si no, el neto = monto.
 */
export function calcularMontoNeto(monto: number, ivaIncluido: boolean, porcentajeIva: number): number {
  if (!ivaIncluido) return monto
  if (porcentajeIva === 0) return monto
  return Math.round((monto / (1 + porcentajeIva / 100)) * 100) / 100
}

/**
 * Valida que un objeto de prorrateo sume 100% (con tolerancia 0.5).
 */
export function validarProrrateo(prorrateo: Record<string, number>): boolean {
  const total = Object.values(prorrateo).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0)
  return Math.abs(total - 100) <= 0.5
}

/**
 * Distribuye un monto entre marcas según los porcentajes del prorrateo.
 */
export function distribuirEntreMarcas(monto: number, prorrateo: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [marca, pct] of Object.entries(prorrateo)) {
    result[marca] = Math.round((monto * pct / 100) * 100) / 100
  }
  return result
}
