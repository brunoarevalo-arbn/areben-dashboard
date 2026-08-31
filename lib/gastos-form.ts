// Qué NO se puede pisar al guardar el formulario de un gasto.
//
// El formulario manda solo los campos que muestra. El schema lee los que faltan como vacío, así
// que guardar un gasto —aunque no se toque nada— borraba en silencio los datos que el formulario
// no tiene. El más caro era `recurrente_id`: al perder el vínculo con su plantilla, el gasto
// dejaba de contar como fijo, perdía el vencimiento que hereda de ella y ese mes volvía a figurar
// SIN CONFIRMAR en la pantalla de Fijos — confirmarlo de buena fe creaba el gasto por segunda vez.

export const CAMPOS_FUERA_DEL_FORM = [
  'recurrente_id',
  'cuenta_origen_pago_id',
  'monto_secundario',
  'moneda_secundaria',
] as const

export type CampoFueraDelForm = (typeof CAMPOS_FUERA_DEL_FORM)[number]

/**
 * Devuelve los campos que hay que reponer con su valor anterior.
 *
 * El criterio es la AUSENCIA de la clave, no que venga vacía: el día que alguno de estos tenga
 * campo propio en el formulario va a viajar en el FormData y se va a poder vaciar a propósito,
 * como cualquier otro campo, sin tocar esta lista.
 */
export function camposAConservar(
  previo: Partial<Record<CampoFueraDelForm, unknown>> | null | undefined,
  vieneEnElForm: (campo: string) => boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const campo of CAMPOS_FUERA_DEL_FORM) {
    if (!vieneEnElForm(campo)) out[campo] = previo?.[campo] ?? null
  }
  return out
}
