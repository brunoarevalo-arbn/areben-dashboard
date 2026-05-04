import { describe, it, expect } from 'vitest'
import { calcularMontoNeto, validarProrrateo, distribuirEntreMarcas } from '@/lib/calc/gasto'

describe('calcularMontoNeto', () => {
  it('si IVA NO incluido, neto = monto', () => {
    expect(calcularMontoNeto(100, false, 21)).toBe(100)
  })

  it('IVA 21% incluido en 121 → neto 100', () => {
    expect(calcularMontoNeto(121, true, 21)).toBe(100)
  })

  it('IVA 10.5% incluido en 110.50 → neto 100', () => {
    expect(calcularMontoNeto(110.5, true, 10.5)).toBe(100)
  })

  it('porcentaje IVA 0 → neto = monto aunque diga incluido', () => {
    expect(calcularMontoNeto(100, true, 0)).toBe(100)
  })

  it('redondea a 2 decimales', () => {
    // 333 / 1.21 = 275.206... → 275.21
    expect(calcularMontoNeto(333, true, 21)).toBe(275.21)
  })
})

describe('validarProrrateo', () => {
  it('suma 100% exacto → válido', () => {
    expect(validarProrrateo({ BDI: 33.33, ZATTIA: 33.33, STUNNED: 33.34 })).toBe(true)
  })

  it('suma 100% con decimales raros pero dentro de tolerancia → válido', () => {
    expect(validarProrrateo({ BDI: 50, ZATTIA: 50.4 })).toBe(true)
  })

  it('suma 99 → inválido', () => {
    expect(validarProrrateo({ BDI: 50, ZATTIA: 49 })).toBe(false)
  })

  it('suma 101 → inválido', () => {
    expect(validarProrrateo({ BDI: 50, ZATTIA: 51 })).toBe(false)
  })

  it('vacío → inválido (suma 0)', () => {
    expect(validarProrrateo({})).toBe(false)
  })
})

describe('distribuirEntreMarcas', () => {
  it('distribuye según porcentajes', () => {
    const r = distribuirEntreMarcas(1000, { BDI: 50, ZATTIA: 30, STUNNED: 20 })
    expect(r).toEqual({ BDI: 500, ZATTIA: 300, STUNNED: 200 })
  })

  it('redondea a 2 decimales', () => {
    const r = distribuirEntreMarcas(100, { BDI: 33.33, ZATTIA: 33.33, STUNNED: 33.34 })
    expect(r.BDI).toBe(33.33)
    expect(r.STUNNED).toBe(33.34)
  })
})
