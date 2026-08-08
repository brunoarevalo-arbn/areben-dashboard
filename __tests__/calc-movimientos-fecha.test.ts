import { describe, it, expect } from 'vitest'
import { generarPeriodos } from '@/lib/inversiones-calc'

const TASA = 0.0175
const tramo = (fecha: string) => [{ fecha_desde: fecha, tasa_mensual: TASA }]
const sum = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) * 100) / 100

// Ciclo de 3 meses, 10.000 al 1,75% → 525 de interés si no se mueve nada
const CICLO = {
  capitalInicial: 10000,
  fechaInicio: '2026-06-01',
  fechaFin: '2026-09-01',
  capitalizable: false,
  hasta: '2026-08',
  tramos: tramo('2026-06-01'),
  plazoDias: 92,
}

describe('retiro parcial con fecha — lo retirado cobra por los días que estuvo', () => {
  it('sin mover nada, el ciclo rinde el plano de siempre', () => {
    expect(sum(generarPeriodos(CICLO).map((p) => p.interes_devengado))).toBe(525)
  })

  it('retirar 4.000 a mitad de ciclo saca la mitad del interés de esa parte', () => {
    // 46 de 92 días: los 4.000 estuvieron la mitad del plazo
    const p = generarPeriodos({
      ...CICLO,
      movimientosByMes: { '2026-07': -4000 },
      fechasMovimiento: { '2026-07': '2026-07-17' },
    })
    // 6.000 todo el ciclo + 4.000 la mitad = 315 + 105 = 420
    expect(sum(p.map((x) => x.interes_devengado))).toBe(420)
  })

  it('retirar el día 1 del ciclo: esa plata no cobra nada', () => {
    const p = generarPeriodos({
      ...CICLO,
      movimientosByMes: { '2026-06': -4000 },
      fechasMovimiento: { '2026-06': '2026-06-01' },
    })
    expect(sum(p.map((x) => x.interes_devengado))).toBe(315) // solo los 6.000 que quedaron
  })

  it('retirar el último día del ciclo: cobró casi todo, salvo ese día', () => {
    // Mismo criterio que la devolución: el día que sale la plata ya no trabaja.
    // El ciclo corre del 1/6 al 31/8 (92 días); retirar el 31/8 pierde 1 día.
    const p = generarPeriodos({
      ...CICLO,
      movimientosByMes: { '2026-08': -4000 },
      fechasMovimiento: { '2026-08': '2026-08-31' },
    })
    const esperado = Math.round((10000 - 4000 / 92) * TASA * 3 * 100) / 100
    expect(sum(p.map((x) => x.interes_devengado))).toBe(esperado)
    expect(esperado).toBeCloseTo(522.72, 2)
  })

  it('un movimiento SIN fecha no toca el interés (los viejos quedan como estaban)', () => {
    const p = generarPeriodos({ ...CICLO, movimientosByMes: { '2026-07': -4000 } })
    expect(sum(p.map((x) => x.interes_devengado))).toBe(525)
  })

  it('un ingreso a mitad de ciclo cobra por los días que estuvo', () => {
    const p = generarPeriodos({
      ...CICLO,
      movimientosByMes: { '2026-07': 4000 },
      fechasMovimiento: { '2026-07': '2026-07-17' },
    })
    expect(sum(p.map((x) => x.interes_devengado))).toBe(630) // 525 + los 4.000 medio plazo
  })
})

describe('el interés se reparte según el capital que hubo cada mes', () => {
  const p = generarPeriodos({
    ...CICLO,
    movimientosByMes: { '2026-07': -4000 },
    fechasMovimiento: { '2026-07': '2026-07-01' },
  })

  it('los meses con menos capital devengan menos', () => {
    const [jun, jul, ago] = p
    expect(jun.interes_devengado).toBeGreaterThan(jul.interes_devengado)
    expect(Math.abs(jul.interes_devengado - ago.interes_devengado)).toBeLessThan(6) // solo difieren por los días del mes
  })

  it('la suma de los meses da el total del ciclo, sin perder centavos', () => {
    // 10.000 en junio (30d) + 6.000 en julio y agosto (62d) sobre 92 días
    const esperado = Math.round(((10000 * 30 + 6000 * 62) / 92) * TASA * 3 * 100) / 100
    expect(sum(p.map((x) => x.interes_devengado))).toBe(esperado)
  })

  it('el saldo sigue encadenado mes a mes', () => {
    for (let i = 1; i < p.length; i++) {
      expect(p[i].saldo_inicio).toBe(p[i - 1].saldo_cierre)
    }
  })
})

describe('capitalizable — el retiro también deja de rendir desde su día', () => {
  const base = {
    capitalInicial: 10000,
    fechaInicio: '2026-06-01',
    fechaFin: null,
    capitalizable: true,
    hasta: '2026-07',
    tramos: tramo('2026-06-01'),
  }

  it('retirar a mitad de julio rinde menos que no retirar', () => {
    const quieto = generarPeriodos(base)
    const conRetiro = generarPeriodos({
      ...base,
      movimientosByMes: { '2026-07': -5000 },
      fechasMovimiento: { '2026-07': '2026-07-16' },
    })
    const julioQuieto = quieto.find((x) => x.mes === '2026-07')!
    const julioRetiro = conRetiro.find((x) => x.mes === '2026-07')!
    expect(julioRetiro.interes_devengado).toBeLessThan(julioQuieto.interes_devengado)
    // 5.000 dejaron de trabajar 16 de los 31 días de julio
    const esperado = Math.round((julioQuieto.interes_devengado - 5000 * TASA * (16 / 31)) * 100) / 100
    expect(julioRetiro.interes_devengado).toBe(esperado)
  })
})
