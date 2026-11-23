import { describe, it, expect } from 'vitest'
import { mesDeudaCuota } from '@/lib/calc/tarjeta'

describe('mesDeudaCuota', () => {
  it('consumo después del cierre del resumen: deuda en el mes del consumo', () => {
    // MP cierra el 12: consumo del 20/10 cierra en noviembre, pero es deuda de octubre
    expect(mesDeudaCuota({ mes_cierre: '2026-11', cuota_numero: 1 }, '2026-10-20')).toBe('2026-10')
  })
  it('cuotas siguientes: un mes después cada una', () => {
    expect(mesDeudaCuota({ mes_cierre: '2026-12', cuota_numero: 2 }, '2026-10-20')).toBe('2026-11')
    expect(mesDeudaCuota({ mes_cierre: '2027-01', cuota_numero: 3 }, '2026-10-20')).toBe('2026-12')
  })
  it('consumo antes del cierre: no cambia', () => {
    expect(mesDeudaCuota({ mes_cierre: '2026-10', cuota_numero: 1 }, '2026-10-05')).toBe('2026-10')
  })
  it('sin fecha del consumo: queda con el mes de cierre', () => {
    expect(mesDeudaCuota({ mes_cierre: '2026-10', cuota_numero: 1 }, null)).toBe('2026-10')
  })
  it('nunca después del mes de cierre (dato raro)', () => {
    expect(mesDeudaCuota({ mes_cierre: '2026-09', cuota_numero: 1 }, '2026-10-02')).toBe('2026-09')
  })
  it('cruza de año', () => {
    expect(mesDeudaCuota({ mes_cierre: '2027-01', cuota_numero: 1 }, '2026-12-28')).toBe('2026-12')
  })
})
