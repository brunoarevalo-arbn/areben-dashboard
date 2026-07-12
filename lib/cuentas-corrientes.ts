// Conceptos que se tratan como CUENTA CORRIENTE (deuda sin fecha fija de pago).
// Fuente única de verdad: la usan tanto el panel de Cuentas Corrientes (para
// mostrar el saldo) como el de Pendientes (para NO duplicarlos ahí).

// Servicios recurrentes marcados como CC (por concepto del recurrente).
export const CC_SERVICIOS = new Set<string>([
  'Abogado - Santiago Gomez',
  'Contador - Joaquin Bolivar',
  'TGI - Rioja 1440',
  'API - Rioja 1440',
  'Aguas Santafesinas - Rioja 1440',
  'Litoral Gas - Rioja 1440',
  // Aportes personales de los socios (monotributo/autónomo/IIBB) — deuda estilo cuenta corriente
  'Monotributo - Dario Arevalo',
  'Autonomo - Dario Arevalo',
  'IIBB - Dario Arevalo',
  'Monotributo - Bruno Arevalo',
  'IIBB - Bruno Arevalo',
])

// Gastos sueltos (sin recurrente) marcados como CC, por concepto del gasto.
export const CC_GASTOS = new Set<string>([
  'Hangtags - Stunned',
  'Percheros/Portarrollo - Daniel Herrero',
  'Honorarios abogado Santiago Gómez - litigio laboral',
])

// ¿Un gasto es cuenta corriente? Los recurrentes se matchean por el concepto del
// recurrente (fallback al del gasto); los sueltos, por el concepto del gasto.
export function esCuentaCorriente(g: {
  concepto: string
  recurrente_id?: string | null
  recurrenteConcepto?: string | null
}): boolean {
  if (g.recurrente_id) {
    return CC_SERVICIOS.has(g.recurrenteConcepto ?? g.concepto)
  }
  return CC_GASTOS.has(g.concepto)
}
