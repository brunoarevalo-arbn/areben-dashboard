import { describe, it, expect } from 'vitest'
import { planAdelantos, type Adelanto } from '@/lib/calc/adelantos'

const adel = (id: string, monto: number, fecha: string, mes: string): Adelanto => ({
  id, monto, fecha, mes, cliente_nombre: `Cliente ${id}`, cliente_id: null,
})

describe('planAdelantos', () => {
  it('sin nómina todavía: todo queda pendiente y no se escribe nada', () => {
    const p = planAdelantos([adel('a', 100_000, '2026-09-10', '2026-09')], [], [], null)
    expect(p.enganches).toEqual([])
    expect(p.pendientes.map((x) => x.restante)).toEqual([100_000])
  })

  it('se liquida: los tres adelantos entran en la nómina del mes, el más viejo primero', () => {
    const p = planAdelantos(
      [
        adel('c', 50_000, '2026-09-25', '2026-09'),
        adel('a', 100_000, '2026-09-10', '2026-09'),
        adel('b', 80_000, '2026-09-18', '2026-09'),
      ],
      [{ id: 'sep', mes: '2026-09', neto: 380_000, pagado: 0 }],
      [],
      null,
    )
    expect(p.enganches.map((e) => [e.adelanto.id, e.monto])).toEqual([['a', 100_000], ['b', 80_000], ['c', 50_000]])
    expect(p.pendientes).toEqual([])
  })

  it('se adelantó de más: entra hasta el neto y lo que sobra queda para el mes siguiente', () => {
    const adelantos = [adel('a', 250_000, '2026-09-10', '2026-09'), adel('b', 150_000, '2026-09-20', '2026-09')]
    const sep = planAdelantos(adelantos, [{ id: 'sep', mes: '2026-09', neto: 380_000, pagado: 0 }], [], null)
    expect(sep.enganches.map((e) => [e.adelanto.id, e.monto])).toEqual([['a', 250_000], ['b', 130_000]])
    expect(sep.pendientes.map((x) => [x.adelanto.id, x.restante])).toEqual([['b', 20_000]])

    // Al mes siguiente, con los pagos de septiembre ya escritos, entra sólo el resto.
    const oct = planAdelantos(
      adelantos,
      [
        { id: 'sep', mes: '2026-09', neto: 380_000, pagado: 380_000 },
        { id: 'oct', mes: '2026-10', neto: 390_000, pagado: 0 },
      ],
      [{ adelanto_id: 'a', monto: 250_000 }, { adelanto_id: 'b', monto: 130_000 }],
      null,
    )
    expect(oct.enganches.map((e) => [e.nominaId, e.adelanto.id, e.monto])).toEqual([['oct', 'b', 20_000]])
  })

  it('es idempotente: con los pagos ya escritos no propone nada', () => {
    const p = planAdelantos(
      [adel('a', 100_000, '2026-09-10', '2026-09')],
      [{ id: 'sep', mes: '2026-09', neto: 380_000, pagado: 100_000 }],
      [{ adelanto_id: 'a', monto: 100_000 }],
      null,
    )
    expect(p.enganches).toEqual([])
    expect(p.pendientes).toEqual([])
  })

  it('un adelanto de octubre no entra en la nómina de septiembre', () => {
    const p = planAdelantos(
      [adel('a', 100_000, '2026-09-28', '2026-10')],
      [{ id: 'sep', mes: '2026-09', neto: 380_000, pagado: 0 }],
      [],
      null,
    )
    expect(p.enganches).toEqual([])
    expect(p.pendientes).toHaveLength(1)
  })

  it('respeta lo que la nómina ya tenía pagado a mano', () => {
    const p = planAdelantos(
      [adel('a', 100_000, '2026-09-10', '2026-09')],
      [{ id: 'sep', mes: '2026-09', neto: 380_000, pagado: 300_000 }],
      [],
      null,
    )
    expect(p.enganches.map((e) => e.monto)).toEqual([80_000])
    expect(p.pendientes.map((x) => x.restante)).toEqual([20_000])
  })

  it('una fecha en mes cerrado no se escribe: queda bloqueada y se avisa', () => {
    const p = planAdelantos(
      [adel('a', 100_000, '2026-08-30', '2026-09')],
      [{ id: 'sep', mes: '2026-09', neto: 380_000, pagado: 0 }],
      [],
      '2026-08',
    )
    expect(p.enganches).toEqual([])
    expect(p.bloqueados.map((x) => x.restante)).toEqual([100_000])
  })
})
