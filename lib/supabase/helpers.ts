/**
 * Helpers para trabajar con joins de Supabase JS sin recurrir a `as unknown as`.
 *
 * Supabase devuelve relaciones anidadas tipadas como `T | T[] | null` aunque
 * en runtime sean siempre `T | null` para FK 1:1. Estos helpers normalizan eso.
 */

/**
 * Devuelve el primer elemento si es array, o el valor mismo si ya es un objeto.
 * Útil para `compra:compras(...)` u otros joins 1:1 que vienen como `T | T[] | null`.
 */
export function unwrapJoin<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/**
 * Aplica unwrapJoin a un campo específico de un row, devolviendo el row con el campo normalizado.
 * Ej: const compra = unwrapField(row, 'proveedor')
 */
export function unwrapField<R, K extends keyof R>(
  row: R,
  key: K,
): Omit<R, K> & { [P in K]: R[K] extends Array<infer U> | null | undefined ? U | null : R[K] } {
  return {
    ...row,
    [key]: unwrapJoin(row[key] as unknown),
  } as Omit<R, K> & { [P in K]: R[K] extends Array<infer U> | null | undefined ? U | null : R[K] }
}
