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
