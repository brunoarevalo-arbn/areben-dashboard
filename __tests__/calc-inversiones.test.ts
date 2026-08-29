import { describe, it, expect } from 'vitest'
import { generarPeriodos, sumarMeses, diasEntre, mesesEntre, situacionEnMes } from '@/lib/inversiones-calc'

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

  it('un mes del ciclo devenga lo mismo se lo mire cuando se lo mire', () => {
    // Elisa INV-001 real: 01/07 → 01/10, 3 meses de 1,75% = 289,05 en todo el ciclo.
    // Mirado en julio (con el ciclo recién arrancado) julio tiene que dar los mismos
    // 97,40 que da mirado en septiembre: el mes en curso NO se lleva el interés de los
    // meses que todavía no pasaron.
    const args = {
      capitalInicial: 5505.77,
      fechaInicio: '2026-07-01',
      fechaFin: '2026-10-01',
      capitalizable: false,
      tramos: tramo('2026-07-01'),
      plazoDias: 92,
    }
    for (const hasta of ['2026-07', '2026-08', '2026-09']) {
      const p = generarPeriodos({ ...args, hasta })
      expect(p[0].interes_devengado).toBe(97.4) // julio, 31 días de 92
    }
    // Y el ciclo entero sigue sumando el plano exacto
    const completo = generarPeriodos({ ...args, hasta: '2026-09' })
    expect(sum(completo.map((x) => x.interes_devengado))).toBe(289.05)
  })
})

describe('el plazo se cuenta en meses, no en días', () => {
  it('3 meses desde el 14-ago vence el 14-nov (no el 12, que son 90 días contados)', () => {
    expect(sumarMeses('2026-08-14', 3)).toBe('2026-11-14')
    expect(diasEntre('2026-08-14', '2026-11-14')).toBe(92)
  })

  it('un mes es un mes tenga 28 o 31 días', () => {
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28') // no existe el 31 de febrero
    expect(sumarMeses('2026-02-28', 1)).toBe('2026-03-28')
    expect(sumarMeses('2026-12-15', 3)).toBe('2027-03-15') // cruza el año
  })

  it('renovar sumando meses no corre el vencimiento; sumando días sí', () => {
    // Cuatro renovaciones de 3 meses arrancando el 14-ago: siempre cae un 14
    let fecha = '2026-08-14'
    for (let i = 0; i < 4; i++) fecha = sumarMeses(fecha, 3)
    expect(fecha).toBe('2027-08-14')
  })

  it('reconoce el plazo en meses de un ciclo ya cargado, y avisa cuando no lo es', () => {
    expect(mesesEntre('2026-08-14', '2026-11-14')).toBe(3)
    expect(mesesEntre('2026-01-31', '2026-02-28')).toBe(1) // fin de mes
    expect(mesesEntre('2026-08-14', '2026-11-12')).toBeNull() // 90 días contados
    expect(mesesEntre('2026-08-14', '2026-08-29')).toBeNull() // 15 días pactados a mano
  })

  it('un plazo de 3 meses rinde 3 meses de tasa, tenga 90, 92 o 93 días', () => {
    const base = {
      capitalInicial: 10000, capitalizable: false,
      tramos: [{ fecha_desde: '2026-01-01', tasa_mensual: TASA }],
    }
    // 3 meses desde el 1-dic = 92 días; desde el 1-feb = 89 días. Los dos pagan 3 × 1,75%
    const dic = generarPeriodos({ ...base, fechaInicio: '2026-12-01', fechaFin: '2027-03-01',
      hasta: '2027-03', plazoDias: diasEntre('2026-12-01', '2027-03-01') })
    const feb = generarPeriodos({ ...base, fechaInicio: '2027-02-01', fechaFin: '2027-05-01',
      hasta: '2027-05', plazoDias: diasEntre('2027-02-01', '2027-05-01') })
    expect(sum(dic.map((x) => x.interes_devengado))).toBe(525.0)
    expect(sum(feb.map((x) => x.interes_devengado))).toBe(525.0)
  })
})

describe('situacionEnMes — a qué instrumentos les toca período en un mes', () => {
  const fredy = { estado: 'activo', fecha_inicio: '2026-06-01', fecha_fin: '2026-09-01' }

  it('el mes del vencimiento ya NO devenga: 01/06→01/09 cubre junio, julio y agosto', () => {
    expect(situacionEnMes(fredy, '2026-05')).toBe('fuera')
    expect(situacionEnMes(fredy, '2026-06')).toBe('dentro')
    expect(situacionEnMes(fredy, '2026-07')).toBe('dentro')
    expect(situacionEnMes(fredy, '2026-08')).toBe('dentro')
    expect(situacionEnMes(fredy, '2026-09')).toBe('vencido')
  })

  it('un plazo que venció a mitad de mes devenga ese mes y queda vencido el siguiente', () => {
    // Blesio INV-002: 03/06 → 03/07. El 2 de julio todavía devenga.
    const blesio = { estado: 'activo', fecha_inicio: '2026-06-03', fecha_fin: '2026-07-03' }
    expect(situacionEnMes(blesio, '2026-06')).toBe('dentro')
    expect(situacionEnMes(blesio, '2026-07')).toBe('dentro')
    expect(situacionEnMes(blesio, '2026-08')).toBe('vencido')
  })

  it('sin vencimiento pactado nunca queda vencido', () => {
    const abierto = { estado: 'activo', fecha_inicio: '2026-06-01', fecha_fin: null }
    expect(situacionEnMes(abierto, '2026-12')).toBe('dentro')
  })

  it('un instrumento ya cerrado o renovado queda afuera', () => {
    expect(situacionEnMes({ ...fredy, estado: 'cerrado' }, '2026-07')).toBe('fuera')
    expect(situacionEnMes({ ...fredy, estado: 'renovado' }, '2026-07')).toBe('fuera')
  })
})
