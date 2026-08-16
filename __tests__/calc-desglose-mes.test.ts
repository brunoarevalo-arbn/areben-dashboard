import { describe, it, expect } from 'vitest'
import { desgloseDelMes, tasaAnualEquivalente, generarPeriodos } from '@/lib/inversiones-calc'

const sum = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100

describe('el desglose del mes le deja al inversor rehacer la cuenta', () => {
  // Caso real: INV-003 de Fredy, $2.500.000 al 3,2%, retiro de $1.389.605 el 11-ago
  const AGO = {
    mes: '2026-08', saldoInicio: 2591008, interesMes: 47828.57,
    movimientos: [{ fecha: '2026-08-11', monto: -1389605 }],
    fechaInicio: '2026-06-27', fechaFin: '2026-08-27',
  }

  it('parte el mes en dos: antes y después del retiro', () => {
    const t = desgloseDelMes(AGO)
    expect(t).toHaveLength(2)
    expect(t[0]).toMatchObject({ desde: '2026-08-01', hasta: '2026-08-10', dias: 10, base: 2591008 })
    expect(t[1]).toMatchObject({ desde: '2026-08-11', hasta: '2026-08-27', dias: 17, base: 1201403 })
  })

  it('los tramos suman exactamente el interés del mes', () => {
    expect(sum(desgloseDelMes(AGO).map((t) => t.interes))).toBe(47828.57)
  })

  it('el corte respeta el vencimiento: agosto termina el 27, no el 31', () => {
    const t = desgloseDelMes(AGO)
    expect(t[t.length - 1].hasta).toBe('2026-08-27')
    expect(sum(t.map((x) => x.dias))).toBe(27)
  })

  it('sin movimientos no hay desglose que mostrar', () => {
    expect(desgloseDelMes({ ...AGO, movimientos: [] })).toEqual([])
  })

  it('un movimiento sin día tampoco parte el mes', () => {
    expect(desgloseDelMes({ ...AGO, movimientos: [{ fecha: '', monto: -1000 }] })).toEqual([])
  })

  it('con dos retiros el mes queda partido en tres', () => {
    const t = desgloseDelMes({
      ...AGO,
      movimientos: [{ fecha: '2026-08-11', monto: -1000000 }, { fecha: '2026-08-20', monto: -500000 }],
    })
    expect(t).toHaveLength(3)
    expect(t.map((x) => x.base)).toEqual([2591008, 1591008, 1091008])
    expect(sum(t.map((x) => x.interes))).toBe(47828.57) // sigue cerrando
  })

  it('también cierra en el modelo plano, que reparte distinto', () => {
    const p = generarPeriodos({
      capitalInicial: 10000, fechaInicio: '2026-06-01', fechaFin: '2026-09-01', capitalizable: false,
      hasta: '2026-08', tramos: [{ fecha_desde: '2026-06-01', tasa_mensual: 0.0175 }], plazoDias: 92,
      movimientos: [{ mes: '2026-07', fecha: '2026-07-17', monto: -4000 }],
    })
    const jul = p.find((x) => x.mes === '2026-07')!
    const t = desgloseDelMes({
      mes: '2026-07', saldoInicio: jul.saldo_inicio, interesMes: jul.interes_devengado,
      movimientos: [{ fecha: '2026-07-17', monto: -4000 }],
      fechaInicio: '2026-06-01', fechaFin: '2026-09-01',
    })
    expect(sum(t.map((x) => x.interes))).toBe(jul.interes_devengado)
  })
})

describe('la tasa anual sale de cómo capitalice cada plazo', () => {
  it('si capitaliza, el interés se compone mes a mes', () => {
    expect(Math.round(tasaAnualEquivalente(0.032, true) * 10000) / 100).toBe(45.93)
  })

  it('si no capitaliza, es la mensual por doce', () => {
    expect(Math.round(tasaAnualEquivalente(0.032, false) * 10000) / 100).toBe(38.4)
  })

  it('capitalizar siempre rinde más que no capitalizar', () => {
    for (const t of [0.0175, 0.025, 0.032, 0.045]) {
      expect(tasaAnualEquivalente(t, true)).toBeGreaterThan(tasaAnualEquivalente(t, false))
    }
  })
})
