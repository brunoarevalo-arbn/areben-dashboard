import { describe, it, expect } from 'vitest'
import { leerGastosComerciales } from '@/lib/calc/gastos-comerciales'

const ok = { total: 1700.5, por_tipo: { comision: 700.5, impuesto: 1000, otro: 0 }, comisionAutomatica: 700.5, cobrosSinComision: 3 }

describe('leerGastosComerciales', () => {
  it('lee lo que contesta el Monitor', () => {
    expect(leerGastosComerciales('ZATTIA', ok)).toEqual({
      marca: 'ZATTIA', total: 1700.5, porTipo: { comision: 700.5, impuesto: 1000, otro: 0 }, comisionAutomatica: 700.5, cobrosSinComision: 3,
    })
  })
  it('un cero verdadero es un cero', () => {
    const d = leerGastosComerciales('BDI', { ...ok, total: 0, por_tipo: { comision: 0, impuesto: 0, otro: 0 }, comisionAutomatica: 0, cobrosSinComision: 0 })
    expect(d?.total).toBe(0)
  })
  it('una respuesta rota o incompleta es null: ⛔ se completa con ceros', () => {
    expect(leerGastosComerciales('BDI', null)).toBeNull()
    expect(leerGastosComerciales('BDI', { error: 'Sobre inválido.' })).toBeNull()
    expect(leerGastosComerciales('BDI', { ...ok, por_tipo: { comision: 1 } })).toBeNull()
    expect(leerGastosComerciales('BDI', { ...ok, total: '10' })).toBeNull()
  })
})
