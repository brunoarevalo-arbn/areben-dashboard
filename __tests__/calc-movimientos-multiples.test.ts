import { describe, it, expect } from 'vitest'
import { generarPeriodos, type MovimientoCalc } from '@/lib/inversiones-calc'

const TASA = 0.0175
const tramo = (fecha: string) => [{ fecha_desde: fecha, tasa_mensual: TASA }]
const sum = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) * 100) / 100
const total = (p: { interes_devengado: number }[]) => sum(p.map((x) => x.interes_devengado))

// Ciclo de 3 meses, 10.000 al 1,75% → 525 de interés si no se mueve nada.
// Mismo ciclo que usa calc-movimientos-fecha.test.ts, para poder comparar números.
const CICLO = {
  capitalInicial: 10000,
  fechaInicio: '2026-06-01',
  fechaFin: '2026-09-01',
  capitalizable: false,
  hasta: '2026-08',
  tramos: tramo('2026-06-01'),
  plazoDias: 92,
}

const COMPUESTO = {
  capitalInicial: 10000,
  fechaInicio: '2026-06-01',
  fechaFin: null,
  capitalizable: true,
  hasta: '2026-07',
  tramos: tramo('2026-06-01'),
}

describe('la forma vieja de pasar movimientos y la nueva dan lo mismo', () => {
  // Candado de no-regresión: mientras haya un solo movimiento por mes, pasar
  // movimientosByMes + fechasMovimiento tiene que dar exactamente lo mismo que pasar
  // la lista. Si esto se rompe, algún número ya publicado se movió.
  const casos: { nombre: string; base: object; mes: string; monto: number; fecha: string | null }[] = [
    { nombre: 'retiro a mitad de ciclo', base: CICLO, mes: '2026-07', monto: -4000, fecha: '2026-07-17' },
    { nombre: 'retiro el primer día', base: CICLO, mes: '2026-06', monto: -4000, fecha: '2026-06-01' },
    { nombre: 'retiro el último día', base: CICLO, mes: '2026-08', monto: -4000, fecha: '2026-08-31' },
    { nombre: 'movimiento sin fecha', base: CICLO, mes: '2026-07', monto: -4000, fecha: null },
    { nombre: 'ingreso a mitad de ciclo', base: CICLO, mes: '2026-07', monto: 4000, fecha: '2026-07-17' },
    { nombre: 'retiro intra-mes capitalizable', base: COMPUESTO, mes: '2026-07', monto: -5000, fecha: '2026-07-16' },
  ]

  for (const c of casos) {
    it(`${c.nombre}: los períodos salen idénticos`, () => {
      const viejo = generarPeriodos({
        ...c.base,
        movimientosByMes: { [c.mes]: c.monto },
        fechasMovimiento: { [c.mes]: c.fecha },
      } as Parameters<typeof generarPeriodos>[0])
      const nuevo = generarPeriodos({
        ...c.base,
        movimientos: [{ mes: c.mes, fecha: c.fecha, monto: c.monto }],
      } as Parameters<typeof generarPeriodos>[0])
      expect(nuevo).toEqual(viejo)
    })
  }
})

describe('varios movimientos en el mismo mes', () => {
  it('dos retiros el mismo mes: cada uno cobra por los días que estuvo', () => {
    // 2.000 salen el 1/7 (quedan 62 de 92 días) y 2.000 el 17/7 (quedan 46 de 92)
    const p = generarPeriodos({
      ...CICLO,
      movimientos: [
        { mes: '2026-07', fecha: '2026-07-01', monto: -2000 },
        { mes: '2026-07', fecha: '2026-07-17', monto: -2000 },
      ],
    })
    const ponderado = 10000 - 2000 * (62 / 92) - 2000 * (46 / 92)
    const esperado = Math.round(ponderado * TASA * 3 * 100) / 100
    expect(total(p)).toBe(esperado)
    expect(esperado).toBeCloseTo(401.74, 2)
  })

  it('un retiro de 4.000 es igual a dos de 2.000 el mismo día', () => {
    const uno = generarPeriodos({
      ...CICLO,
      movimientos: [{ mes: '2026-07', fecha: '2026-07-17', monto: -4000 }],
    })
    const dos = generarPeriodos({
      ...CICLO,
      movimientos: [
        { mes: '2026-07', fecha: '2026-07-17', monto: -2000 },
        { mes: '2026-07', fecha: '2026-07-17', monto: -2000 },
      ],
    })
    expect(total(dos)).toBe(total(uno))
    expect(total(dos)).toBe(420) // el número que ya estaba testeado
  })

  it('el orden en que se cargan no cambia nada', () => {
    const movs: MovimientoCalc[] = [
      { mes: '2026-07', fecha: '2026-07-17', monto: -2000 },
      { mes: '2026-06', fecha: '2026-06-10', monto: -1000 },
      { mes: '2026-08', fecha: '2026-08-05', monto: 500 },
    ]
    const enOrden = generarPeriodos({ ...CICLO, movimientos: movs })
    const alReves = generarPeriodos({ ...CICLO, movimientos: [...movs].reverse() })
    expect(alReves).toEqual(enOrden)
  })

  it('dos retiros el mismo mes en un capitalizable', () => {
    const quieto = generarPeriodos(COMPUESTO)
    const p = generarPeriodos({
      ...COMPUESTO,
      movimientos: [
        { mes: '2026-07', fecha: '2026-07-11', monto: -3000 },
        { mes: '2026-07', fecha: '2026-07-21', monto: -2000 },
      ],
    })
    const julioQuieto = quieto.find((x) => x.mes === '2026-07')!
    const julio = p.find((x) => x.mes === '2026-07')!
    // 3.000 dejaron de trabajar 21 días y 2.000 dejaron de trabajar 11, sobre 31
    const ajuste = 3000 * TASA * (21 / 31) + 2000 * TASA * (11 / 31)
    expect(julio.interes_devengado).toBe(Math.round((julioQuieto.interes_devengado - ajuste) * 100) / 100)
  })

  it('uno con fecha y otro sin fecha: solo el que tiene fecha ajusta el interés', () => {
    const soloConFecha = generarPeriodos({
      ...CICLO,
      movimientos: [{ mes: '2026-07', fecha: '2026-07-17', monto: -2000 }],
    })
    const conAmbos = generarPeriodos({
      ...CICLO,
      movimientos: [
        { mes: '2026-07', fecha: '2026-07-17', monto: -2000 },
        { mes: '2026-07', fecha: null, monto: -2000 },
      ],
    })
    // El interés es el mismo: el movimiento sin fecha no lo toca
    expect(total(conAmbos)).toBe(total(soloConFecha))
    // Pero el saldo sí baja por los dos
    const ultimo = conAmbos[conAmbos.length - 1]
    const ultimoSolo = soloConFecha[soloConFecha.length - 1]
    expect(ultimo.saldo_cierre).toBe(Math.round((ultimoSolo.saldo_cierre - 2000) * 100) / 100)
  })
})

describe('bordes del ciclo', () => {
  it('un movimiento el día del vencimiento no cambia el interés', () => {
    // Es el que inserta "Devolver y cerrar": si contara, la devolución se restaría dos veces.
    const p = generarPeriodos({
      ...CICLO,
      movimientos: [{ mes: '2026-09', fecha: '2026-09-01', monto: -10525 }],
    })
    expect(total(p)).toBe(525)
  })

  it('sacar todo a mitad de ciclo cobra solo por los días que estuvo', () => {
    const p = generarPeriodos({
      ...CICLO,
      movimientos: [{ mes: '2026-07', fecha: '2026-07-17', monto: -10000 }],
    })
    // 46 de 92 días sobre todo el capital
    expect(total(p)).toBe(Math.round(10000 * (46 / 92) * TASA * 3 * 100) / 100)
    expect(total(p)).toBe(262.5)
  })
})

describe('el caso real de Fredy — INV-001, 45.000.000 al 3,2% por 90 días', () => {
  const FREDY = {
    capitalInicial: 45000000,
    fechaInicio: '2026-06-01',
    fechaFin: '2026-09-01',
    capitalizable: false,
    hasta: '2026-09',
    tramos: [{ fecha_desde: '2026-06-01', tasa_mensual: 0.032 }],
    plazoDias: 90,
  }

  it('sin retiro, el ciclo rinde 3 meses planos', () => {
    expect(total(generarPeriodos(FREDY))).toBe(4320000)
  })

  it('retirar 5.000.000 el 14-jul baja el interés en lo que esa plata dejó de rendir', () => {
    const p = generarPeriodos({
      ...FREDY,
      movimientos: [{ mes: '2026-07', fecha: '2026-07-14', monto: -5000000 }],
    })
    expect(total(p)).toBe(4064347.83)
    // Los 5.000.000 se pierden 49 de los 92 días del ciclo
    expect(4320000 - total(p)).toBeCloseTo(5000000 * (49 / 92) * 0.032 * 3, 2)
  })

  it('el mismo retiro SIN fecha no descuenta nada: es el bug que se está arreglando', () => {
    const p = generarPeriodos({
      ...FREDY,
      movimientos: [{ mes: '2026-07', fecha: null, monto: -5000000 }],
    })
    expect(total(p)).toBe(4320000) // igual que no haber retirado
  })
})
