import { describe, it, expect } from 'vitest'
import { calcularMesesTarjeta, calcularMontosCuota, calcularMesesCuotas } from '@/lib/calc/tarjeta'

describe('calcularMesesTarjeta', () => {
  it('compra ANTES del día de cierre → cierre = mes actual', () => {
    // 5 de marzo, cierre día 25 → cierre marzo, vto abril
    const r = calcularMesesTarjeta('2025-03-05', 25)
    expect(r.mesCierre).toBe('2025-03')
    expect(r.mesVenc).toBe('2025-04')
  })

  it('compra EN el día de cierre → cierre = mes siguiente', () => {
    const r = calcularMesesTarjeta('2025-03-25', 25)
    expect(r.mesCierre).toBe('2025-04')
    expect(r.mesVenc).toBe('2025-05')
  })

  it('compra DESPUÉS del día de cierre → cierre = mes siguiente', () => {
    const r = calcularMesesTarjeta('2025-03-26', 25)
    expect(r.mesCierre).toBe('2025-04')
    expect(r.mesVenc).toBe('2025-05')
  })

  it('compra a fin de año → cruza año correctamente', () => {
    const r = calcularMesesTarjeta('2025-12-30', 25)
    expect(r.mesCierre).toBe('2026-01')
    expect(r.mesVenc).toBe('2026-02')
  })

  it('compra el primer día del mes con cierre día 1 → cierre = mes siguiente', () => {
    const r = calcularMesesTarjeta('2025-03-01', 1)
    expect(r.mesCierre).toBe('2025-04')
  })
})

describe('calcularMontosCuota', () => {
  it('distribuye total exacto en cuotas iguales', () => {
    const m = calcularMontosCuota(1000, 4)
    expect(m).toEqual([250, 250, 250, 250])
    expect(m.reduce((s, v) => s + v, 0)).toBe(1000)
  })

  it('ajusta la última cuota por redondeo', () => {
    // 100 / 3 = 33.33...
    const m = calcularMontosCuota(100, 3)
    expect(m[0]).toBe(33.33)
    expect(m[1]).toBe(33.33)
    expect(m[2]).toBe(33.34) // ajuste final para sumar 100 exacto
    expect(m.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 2)
  })

  it('una sola cuota = monto total', () => {
    expect(calcularMontosCuota(500, 1)).toEqual([500])
  })

  it('cuotasTotal=0 devuelve array vacío', () => {
    expect(calcularMontosCuota(500, 0)).toEqual([])
  })

  it('monto con decimales raros suma exacto', () => {
    const m = calcularMontosCuota(123.45, 7)
    expect(m.reduce((s, v) => s + v, 0)).toBeCloseTo(123.45, 2)
  })
})

describe('calcularMesesCuotas', () => {
  it('genera N meses consecutivos desde el mes de cierre', () => {
    // Compra 5 marzo, cierre día 25 → cierre marzo. 3 cuotas.
    const meses = calcularMesesCuotas('2025-03-05', 25, 3)
    expect(meses).toHaveLength(3)
    expect(meses[0]).toEqual({ mesCierre: '2025-03', mesVencimiento: '2025-04' })
    expect(meses[1]).toEqual({ mesCierre: '2025-04', mesVencimiento: '2025-05' })
    expect(meses[2]).toEqual({ mesCierre: '2025-05', mesVencimiento: '2025-06' })
  })

  it('cruza año correctamente en cuotas largas', () => {
    const meses = calcularMesesCuotas('2025-11-05', 25, 4)
    expect(meses[0].mesCierre).toBe('2025-11')
    expect(meses[3].mesCierre).toBe('2026-02')
  })
})

describe('calcularMesesTarjeta — tarjeta que vence el mismo mes (Mercado Pago: cierra 12, vence 17)', () => {
  it('compra del 1/7 cierra 07 y vence 07 (mismo mes)', () => {
    const r = calcularMesesTarjeta('2026-07-01', 12, 17)
    expect(r.mesCierre).toBe('2026-07')
    expect(r.mesVenc).toBe('2026-07')
  })

  it('compra del 15/7 (post cierre) cierra 08 y vence 08', () => {
    const r = calcularMesesTarjeta('2026-07-15', 12, 17)
    expect(r.mesCierre).toBe('2026-08')
    expect(r.mesVenc).toBe('2026-08')
  })

  it('si vence ANTES del cierre, sigue cayendo el mes siguiente (Galicia: cierra 30, vence 10)', () => {
    const r = calcularMesesTarjeta('2026-07-01', 30, 10)
    expect(r.mesCierre).toBe('2026-07')
    expect(r.mesVenc).toBe('2026-08')
  })

  it('sin dato de vencimiento mantiene el comportamiento histórico (mes siguiente)', () => {
    const r = calcularMesesTarjeta('2026-07-01', 12)
    expect(r.mesVenc).toBe('2026-07' === r.mesCierre ? '2026-08' : r.mesVenc)
  })

  it('cuotas consecutivas de Mercado Pago avanzan de a un mes', () => {
    const meses = calcularMesesCuotas('2026-07-01', 12, 3, 17)
    expect(meses.map((m) => m.mesVencimiento)).toEqual(['2026-07', '2026-08', '2026-09'])
  })
})
