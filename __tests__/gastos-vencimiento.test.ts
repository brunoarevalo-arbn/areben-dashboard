import { describe, it, expect } from 'vitest'
import { fechaVencimientoRecurrente, vencimientoGasto, estaVencido } from '@/lib/gastos-vencimiento'

const HOY = '2026-08-08'

describe('fechaVencimientoRecurrente', () => {
  it('CORRIENTE vence en el mismo mes', () => {
    expect(fechaVencimientoRecurrente('2026-07', 10, 'CORRIENTE')).toBe('2026-07-10')
  })

  it('VENCIDO vence el mes siguiente', () => {
    expect(fechaVencimientoRecurrente('2026-07', 5, 'VENCIDO')).toBe('2026-08-05')
  })

  it('diciembre VENCIDO pasa al año siguiente', () => {
    expect(fechaVencimientoRecurrente('2026-12', 5, 'VENCIDO')).toBe('2027-01-05')
  })

  it('recorta el día al último del mes', () => {
    expect(fechaVencimientoRecurrente('2026-02', 31, 'CORRIENTE')).toBe('2026-02-28')
  })
})

describe('vencimientoGasto', () => {
  it('con recurrente usa el día del recurrente, no la fecha del gasto', () => {
    const g = { concepto: 'Alquiler', mes: '2026-07', fecha_pago: '2026-07-25', recurrente_id: 'r1' }
    expect(vencimientoGasto(g, { dia_vencimiento: 10, tipo_mes: 'CORRIENTE' })).toBe('2026-07-10')
  })

  it('sin recurrente cae en fecha_pago, y si no hay, en fecha', () => {
    expect(vencimientoGasto({ concepto: 'Suelto', fecha_pago: '2026-07-20', fecha: '2026-07-01' })).toBe('2026-07-20')
    expect(vencimientoGasto({ concepto: 'Suelto', fecha: '2026-07-01' })).toBe('2026-07-01')
    expect(vencimientoGasto({ concepto: 'Suelto' })).toBeNull()
  })

  // Cuenta corriente: la deuda se acumula y se paga cuando hay caja → no tiene fecha tope.
  it('recurrente marcado como cuenta corriente NO tiene vencimiento', () => {
    const g = { concepto: 'Abogado - Santiago Gomez', mes: '2026-07', fecha_pago: '2026-07-29', recurrente_id: 'r1' }
    const rec = { dia_vencimiento: 29, tipo_mes: 'CORRIENTE', es_cuenta_corriente: true }
    expect(vencimientoGasto(g, rec)).toBeNull()
  })

  it('gasto suelto de la lista curada de cuenta corriente tampoco vence', () => {
    const g = { concepto: 'Hangtags - Stunned', fecha_pago: '2026-05-10' }
    expect(vencimientoGasto(g)).toBeNull()
  })

  it('si el recurrente no está marcado, el vencimiento sigue igual que siempre', () => {
    const g = { concepto: 'EPE - Rioja 1440', mes: '2026-07', recurrente_id: 'r1' }
    const rec = { dia_vencimiento: 5, tipo_mes: 'VENCIDO', es_cuenta_corriente: false }
    expect(vencimientoGasto(g, rec)).toBe('2026-08-05')
  })
})

describe('estaVencido', () => {
  it('impago con vencimiento pasado → vencido', () => {
    const g = { concepto: 'EPE - Rioja 1440', estado: 'PENDIENTE', mes: '2026-06', recurrente_id: 'r1' }
    expect(estaVencido(g, { dia_vencimiento: 5, tipo_mes: 'VENCIDO' }, HOY)).toBe(true)
  })

  it('PAGADO y DEVENGADO nunca están vencidos', () => {
    const base = { concepto: 'EPE - Rioja 1440', mes: '2026-06', recurrente_id: 'r1' }
    const rec = { dia_vencimiento: 5, tipo_mes: 'VENCIDO' }
    expect(estaVencido({ ...base, estado: 'PAGADO' }, rec, HOY)).toBe(false)
    expect(estaVencido({ ...base, estado: 'DEVENGADO' }, rec, HOY)).toBe(false)
  })

  it('cuenta corriente impaga y vieja NO figura como vencida', () => {
    const g = { concepto: 'Contador - Joaquin Bolivar', estado: 'PENDIENTE', mes: '2026-04', recurrente_id: 'r1' }
    const rec = { dia_vencimiento: 10, tipo_mes: 'CORRIENTE', es_cuenta_corriente: true }
    expect(estaVencido(g, rec, HOY)).toBe(false)
  })

  it('sin el dato del recurrente se comporta como antes (no adivina que es cuenta corriente)', () => {
    const g = { concepto: 'Contador - Joaquin Bolivar', estado: 'PENDIENTE', mes: '2026-04', recurrente_id: 'r1' }
    expect(estaVencido(g, null, HOY)).toBe(false) // sin fecha_pago ni fecha no hay vencimiento
    expect(estaVencido({ ...g, fecha_pago: '2026-04-10' }, null, HOY)).toBe(true)
  })
})
