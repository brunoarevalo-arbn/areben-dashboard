import { describe, it, expect } from 'vitest'
import { armarGastoErp, cuerpoGastoErp } from '@/lib/puente-gastos'

const base = {
  operacion_id: '7b0e2a52-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
  categoria: 'Mantenimiento',
  concepto: 'Limpieza: lavandina',
  monto: 3500,
  fecha: '2026-10-30',
  negocio: 'ZATTIA',
  cargado_por: 'Josefina',
  aprobado_por: 'Bruno',
}

describe('un gasto del ERP ya aprobado', () => {
  it('la caja chica entra en EFECTIVO y con su pago: ya salió de la caja del local', () => {
    const { gasto, pago } = armarGastoErp(cuerpoGastoErp.parse({ ...base, origen: 'caja' }))
    expect(gasto).toMatchObject({ categoria: 'Mantenimiento', concepto: 'Limpieza: lavandina', monto: 3500, monto_neto: 3500, mes: '2026-10', negocio: 'ZATTIA', medio_pago: 'EFECTIVO', fecha_pago: '2026-10-30', generado_desde: 'erp-caja' })
    // Se inserta PENDIENTE y lo deja PAGADO el ledger: ningún PAGADO sin su fila en `pagos`.
    expect(gasto.estado).toBe('PENDIENTE')
    expect(pago).toEqual({ monto: 3500, fecha_emision: '2026-10-30', instrumento: 'EFECTIVO', notas: 'Caja chica del local (ERP)' })
    expect(gasto.notas).toBe('Del ERP · caja chica del local (cargó Josefina, aprobó Bruno)')
  })

  it('lo de la oficina entra PENDIENTE y SIN pago: se paga acá con su cuenta', () => {
    const { gasto, pago } = armarGastoErp(cuerpoGastoErp.parse({ ...base, origen: 'oficina', negocio: 'GENERAL', categoria: 'Servicios' }))
    expect(pago).toBeNull()
    expect(gasto).toMatchObject({ estado: 'PENDIENTE', medio_pago: 'TRANSFERENCIA', fecha_pago: '2026-10-30', negocio: 'GENERAL', generado_desde: 'erp-oficina' })
  })

  it('las categorías del bot ⛔ entran por la puerta', () => {
    for (const categoria of ['Sueldos', 'Alquiler', 'Impuestos', 'Gastos Financieros', 'Cargas Sociales', 'Logística']) {
      expect(cuerpoGastoErp.safeParse({ ...base, origen: 'oficina', categoria }).success).toBe(false)
    }
  })

  it('sin id del ERP, sin origen o con monto 0 ⛔ entra', () => {
    expect(cuerpoGastoErp.safeParse({ ...base, origen: 'caja', operacion_id: 'x' }).success).toBe(false)
    expect(cuerpoGastoErp.safeParse({ ...base }).success).toBe(false)
    expect(cuerpoGastoErp.safeParse({ ...base, origen: 'caja', monto: 0 }).success).toBe(false)
  })
})
