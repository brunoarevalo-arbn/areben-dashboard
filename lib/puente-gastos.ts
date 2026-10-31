import { z } from 'zod'

// Los gastos que llegan del ERP del Monitor, ya REVISADOS (Bruno, 30-oct-2026).
//
// La oficina y la caja chica del local cargan sus gastos en el ERP; quedan «para revisar» y recién cuando un Admin
// (Bruno o Darío) los aprueba, el SERVIDOR del Monitor los manda acá. Es el paso intermedio que pidió Bruno «para evitar
// que ella cargue y nadie cargue en dashboard, pq sino la info no es filtrada».
//
// 🔑 **Qué decide el dashboard y qué el Monitor.** El Monitor afirma qué fue (categoría, concepto, monto, día) y de
// dónde salió (`origen`). Cómo entra lo decide ESTE archivo, en un solo lugar:
//   - `caja`    = la caja chica: ya salió del efectivo de la caja del local ⇒ PAGADO en EFECTIVO, el día del gasto.
//   - `oficina` = PENDIENTE, y se marca pagado acá con su cuenta, como cualquier gasto.
//
// ⛔ Las categorías son SÓLO las que el ERP puede mandar: las que la oficina y el local cargan de verdad (medido en la
// base el 30-oct). Sueldos, Alquiler, Impuestos, Gastos Financieros y Cargas siguen entrando por el bot: una categoría
// de esas que llegue por la puerta es un error del otro lado, y se frena.

export const CATEGORIAS_DESDE_ERP = [
  'Mantenimiento',
  'Logistica',
  'Comidas',
  'Otros',
  'Servicios',
  'Suscripciones',
  'Equipos',
] as const

export const cuerpoGastoErp = z.object({
  /** El id del gasto en el ERP. Es el candado: el mismo gasto aprobado dos veces entra una sola. */
  operacion_id: z.uuid({ error: 'Falta el número del gasto del ERP, que es lo que evita cargarlo dos veces.' }),
  origen: z.enum(['caja', 'oficina'], { error: 'Falta de dónde salió el gasto (caja chica u oficina).' }),
  categoria: z.enum(CATEGORIAS_DESDE_ERP, { error: 'Esa categoría no entra desde el ERP.' }),
  concepto: z.string({ error: 'Falta de qué es el gasto.' }).trim().min(1, 'Falta de qué es el gasto.').max(200),
  monto: z.coerce.number({ error: 'Falta el monto.' }).positive('El monto tiene que ser mayor que cero.'),
  fecha: z.string({ error: 'Falta el día del gasto.' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va como AAAA-MM-DD.'),
  negocio: z.enum(['BDI', 'ZATTIA', 'STUNNED', 'GENERAL'], { error: 'Falta de qué marca es.' }),
  /** Quién lo cargó y quién lo aprobó en el ERP. ⚠️ El dashboard no lo verifica: lo afirma el Monitor. */
  cargado_por: z.string().optional().nullable(),
  aprobado_por: z.string().optional().nullable(),
})

export type GastoErp = z.infer<typeof cuerpoGastoErp>

/** La fila de `gastos` y, si corresponde, el pago que la salda. Puro: lo prueba `__tests__/puente-gastos.test.ts`. */
export function armarGastoErp(d: GastoErp) {
  const deCaja = d.origen === 'caja'
  const quien = [d.cargado_por && `cargó ${d.cargado_por}`, d.aprobado_por && `aprobó ${d.aprobado_por}`].filter(Boolean).join(', ')
  const gasto = {
    categoria: d.categoria,
    concepto: d.concepto,
    monto: d.monto,
    monto_neto: d.monto,
    moneda: 'ARS',
    iva_incluido: false,
    porcentaje_iva: 21,
    negocio: d.negocio,
    fecha: d.fecha,
    mes: d.fecha.substring(0, 7),
    // La caja chica se inserta PENDIENTE y la paga el ledger (como `createGasto` con un PAGADO a mano): así ningún
    // PAGADO queda sin su fila en `pagos`. La fecha de pago es la del gasto en los dos casos (la oficina la cambia al pagar).
    estado: 'PENDIENTE',
    fecha_pago: d.fecha,
    medio_pago: deCaja ? 'EFECTIVO' : 'TRANSFERENCIA',
    notas: `Del ERP · ${deCaja ? 'caja chica del local' : 'oficina'}${quien ? ` (${quien})` : ''}`,
    cuotas_total: 1,
    confirmado: true,
    auto_generado: true,
    generado_desde: deCaja ? 'erp-caja' : 'erp-oficina',
  }
  const pago = deCaja
    ? { monto: d.monto, fecha_emision: d.fecha, instrumento: 'EFECTIVO' as const, notas: 'Caja chica del local (ERP)' }
    : null
  return { gasto, pago }
}
