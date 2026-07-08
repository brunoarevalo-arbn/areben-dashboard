import { describe, it, expect } from 'vitest'
import { generarPeriodos } from '@/lib/inversiones-calc'

const TASA = 0.0175 // 1,75% mensual
const tramo = (fecha: string, tasa = TASA) => [{ fecha_desde: fecha, tasa_mensual: tasa }]
const sum = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) * 100) / 100

describe('modelo plano — 1,75% por mes completo, repartido proporcional por días', () => {
  it('Javier INV-002: ciclo 18-may → 18-jun rinde 130,00 plano (58,71 mayo + 71,29 junio)', () => {
    const p = generarPeriodos({
      capitalInicial: 7428.41,
      fechaInicio: '2026-05-18',
      fechaFin: '2026-06-18',
      capitalizable: false,
      hasta: '2026-06',
      tramos: tramo('2026-05-18'),
      plazoDias: 30,
    })
    expect(p.map((x) => x.mes)).toEqual(['2026-05', '2026-06'])
    // El total del ciclo debe ser exactamente 1,75% plano
    expect(sum(p.map((x) => x.interes_devengado))).toBe(130.0)
    // Reparto proporcional por días (mayo 14 días, junio 17 días, sobre 31)
    expect(p[0].interes_devengado).toBe(58.71)
    expect(p[1].interes_devengado).toBe(71.29)
    // Renovación = capital + interés plano
    expect(7428.41 + sum(p.map((x) => x.interes_devengado))).toBe(7558.41)
  })

  it('febrero (mes corto) también rinde el mes plano: ciclo 18-feb → 18-mar', () => {
    const cap = 10000
    const p = generarPeriodos({
      capitalInicial: cap,
      fechaInicio: '2026-02-18',
      fechaFin: '2026-03-18',
      capitalizable: false,
      hasta: '2026-03',
      tramos: tramo('2026-02-18'),
      plazoDias: 30,
    })
    // Total = 1,75% plano, aunque febrero tenga 28 días
    expect(sum(p.map((x) => x.interes_devengado))).toBe(175.0)
    expect(p.map((x) => x.mes)).toEqual(['2026-02', '2026-03'])
  })

  it('ciclo alineado al mes (1 al 1) rinde exactamente 1,75%', () => {
    const p = generarPeriodos({
      capitalInicial: 10000,
      fechaInicio: '2026-05-01',
      fechaFin: '2026-06-01',
      capitalizable: false,
      hasta: '2026-06',
      tramos: tramo('2026-05-01'),
      plazoDias: 30,
    })
    expect(sum(p.map((x) => x.interes_devengado))).toBe(175.0)
  })

  it('plazo 3 meses (no capitalizable) rinde 3 × 1,75% plano repartido por días', () => {
    const p = generarPeriodos({
      capitalInicial: 10000,
      fechaInicio: '2026-06-18',
      fechaFin: '2026-09-18',
      capitalizable: false,
      hasta: '2026-09',
      tramos: tramo('2026-06-18'),
      plazoDias: 92,
    })
    // 3 meses planos sobre el mismo capital (no capitaliza en el medio)
    expect(sum(p.map((x) => x.interes_devengado))).toBe(525.0)
  })

  it('retiro anticipado (ciclo cortado) → se prorratea real, no un mes entero', () => {
    // plazo era 30 pero se cortó a 10 días (18 al 28)
    const p = generarPeriodos({
      capitalInicial: 10000,
      fechaInicio: '2026-05-18',
      fechaFin: '2026-05-28',
      capitalizable: false,
      hasta: '2026-05',
      tramos: tramo('2026-05-18'),
      plazoDias: 30,
    })
    // 10 días de 30 → 1,75% × 10/30 = 58,33 (no 175)
    expect(sum(p.map((x) => x.interes_devengado))).toBe(58.33)
  })

  it('el día del vencimiento NO se cuenta dos veces entre ciclos consecutivos', () => {
    // Ciclo 1: 18-may → 18-jun ; Ciclo 2 (renovado): 18-jun → 18-jul
    const cap = 10000
    const c1 = generarPeriodos({
      capitalInicial: cap, fechaInicio: '2026-05-18', fechaFin: '2026-06-18',
      capitalizable: false, hasta: '2026-06', tramos: tramo('2026-05-18'), plazoDias: 30,
    })
    const c2 = generarPeriodos({
      capitalInicial: cap, fechaInicio: '2026-06-18', fechaFin: '2026-07-18',
      capitalizable: false, hasta: '2026-07', tramos: tramo('2026-06-18'), plazoDias: 30,
    })
    // Cada ciclo rinde exactamente un mes plano; el 18-jun pertenece solo al ciclo 2
    expect(sum(c1.map((x) => x.interes_devengado))).toBe(175.0)
    expect(sum(c2.map((x) => x.interes_devengado))).toBe(175.0)
  })
})
