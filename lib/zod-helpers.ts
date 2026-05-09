import { z } from 'zod'

/**
 * UUID opcional que tolera string vacío en FormData (lo convierte a null).
 * Necesario porque los <select> HTML mandan `""` cuando no hay opción seleccionada
 * y `z.string().uuid()` rechaza `""` con "Invalid UUID".
 */
export const optUuid = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.string().uuid().nullable(),
).optional()

/**
 * Entero opcional que tolera string vacío en FormData. Sin esto,
 * `z.coerce.number()` convierte `""` a `0` y rompe validaciones tipo `min(1)`.
 */
export function optInt(opts?: { min?: number; max?: number }) {
  return z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    (() => {
      let s = z.coerce.number().int()
      if (opts?.min !== undefined) s = s.min(opts.min)
      if (opts?.max !== undefined) s = s.max(opts.max)
      return s.nullable()
    })(),
  ).optional()
}
