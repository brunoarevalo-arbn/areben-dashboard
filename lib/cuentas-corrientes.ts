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
