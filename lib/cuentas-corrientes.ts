// ¿Un gasto se trata como CUENTA CORRIENTE? (deuda sin fecha fija de pago, que se
// junta y se paga cuando hay caja → no aparece como pendiente con vencimiento).
//
// - Recurrentes: lo define el campo `es_cuenta_corriente` del recurrente, editable
//   desde la pantalla de recurrentes (ver migración 062). Fuente única de verdad.
// - Gastos sueltos (sin recurrente): siguen matcheándose por concepto contra la
//   lista curada de abajo.
//
// La usan tanto el panel de Cuentas Corrientes (para mostrar el saldo) como el de
// Pendientes (para NO duplicarlos ahí) y el estado computado del gasto.

// Gastos sueltos (sin recurrente) marcados como CC, por concepto del gasto.
export const CC_GASTOS = new Set<string>([
  'Hangtags - Stunned',
  'Percheros/Portarrollo - Daniel Herrero',
  'Honorarios abogado Santiago Gómez - litigio laboral',
])

// A un mismo acreedor se le puede deber por varios conceptos a la vez: el abono mensual del
// abogado y, aparte, los honorarios de un juicio. Sin esto, la pantalla de Cuentas corrientes
// los muestra como dos deudas distintas y no hay forma de ver cuánto se le debe a la persona.
//
// Acá se declara qué conceptos son del mismo acreedor. Los que no figuran siguen agrupándose
// por su recurrente, como siempre.
export const ACREEDOR_POR_CONCEPTO: Record<string, string> = {
  'Abogado - Santiago Gomez': 'Santiago Gómez (abogado)',
  'Honorarios abogado Santiago Gómez - litigio laboral': 'Santiago Gómez (abogado)',
}

/** Nombre del acreedor de un concepto, o null si no está declarado. */
export function acreedorDe(concepto: string): string | null {
  return ACREEDOR_POR_CONCEPTO[concepto] ?? null
}

export function esCuentaCorriente(g: {
  concepto: string
  recurrente_id?: string | null
  /** Campo `es_cuenta_corriente` del recurrente asociado (si el gasto viene de uno). */
  recurrenteEsCC?: boolean | null
}): boolean {
  if (g.recurrente_id) {
    return g.recurrenteEsCC === true
  }
  return CC_GASTOS.has(g.concepto)
}
