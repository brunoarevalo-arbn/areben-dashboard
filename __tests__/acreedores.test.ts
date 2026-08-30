import { describe, it, expect } from 'vitest'
import { armarCuentas, type AcreedorGastoInput, type AcreedorPagoInput } from '@/lib/acreedores'

const PROVEEDORES = [
  { id: 'p-abogado', nombre: 'Santiago Gómez (abogado)' },
  { id: 'p-contador', nombre: 'Joaquín Bolívar (contador)' },
]

function gasto(o: Partial<AcreedorGastoInput> & { id: string; mes: string; monto: number }): AcreedorGastoInput {
  return {
    concepto: 'Abogado - Santiago Gomez',
    fecha: `${o.mes}-01`,
    proveedor_id: 'p-abogado',
    ...o,
  }
}

function pago(o: Partial<AcreedorPagoInput> & { id: string; origen_id: string; monto: number; fecha_emision: string }): AcreedorPagoInput {
  return { debitado: true, ...o }
}

// El caso real cargado en la base al 30-ago-2026. El saldo del abogado tiene que dar $483.005:
// $4.892 que quedaron de mayo + $452.000 del litigio + $26.113 que quedaron de julio.
describe('cuenta corriente del abogado (datos reales)', () => {
  const gastos = [
    gasto({ id: 'g-abr', mes: '2026-04', monto: 350000 }),
    gasto({ id: 'g-may', mes: '2026-05', monto: 350000 }),
    gasto({ id: 'g-jun', mes: '2026-06', monto: 350000 }),
    gasto({ id: 'g-litigio', mes: '2026-06', monto: 452000, fecha: '2026-06-19', concepto: 'Honorarios abogado Santiago Gómez - litigio laboral' }),
    gasto({ id: 'g-jul', mes: '2026-07', monto: 350000 }),
  ]
  const pagos = [
    pago({ id: 'x1', origen_id: 'g-abr', monto: 350000, fecha_emision: '2026-05-18' }),
    pago({ id: 'x2', origen_id: 'g-may', monto: 345108, fecha_emision: '2026-06-11' }),
    pago({ id: 'x3', origen_id: 'g-jun', monto: 350000, fecha_emision: '2026-07-14' }),
    pago({ id: 'x4', origen_id: 'g-jul', monto: 221537, fecha_emision: '2026-08-12', notas: 'Matias Alvarado - BDI Mayorista' }),
    pago({ id: 'x5', origen_id: 'g-jul', monto: 102350, fecha_emision: '2026-08-14', notas: 'Regina Ghilarducci - BDI Mayorista' }),
  ]

  it('suma el abono mensual y el litigio en una sola cuenta', () => {
    const [cuenta] = armarCuentas(gastos, pagos, PROVEEDORES)
    expect(cuenta.nombre).toBe('Santiago Gómez (abogado)')
    expect(cuenta.conceptos).toHaveLength(5)
    expect(cuenta.saldo).toBe(483005)
    expect(cuenta.totalDevengado).toBe(1852000)
    expect(cuenta.totalPagado).toBe(1368995)
  })

  it('el saldo de cada concepto se ve por separado', () => {
    const [cuenta] = armarCuentas(gastos, pagos, PROVEEDORES)
    const porId = Object.fromEntries(cuenta.conceptos.map((c) => [c.id, c.saldo]))
    expect(porId['g-abr']).toBe(0)
    expect(porId['g-may']).toBe(4892)
    expect(porId['g-jun']).toBe(0)
    expect(porId['g-litigio']).toBe(452000)
    expect(porId['g-jul']).toBe(26113)
  })

  it('el último movimiento es la fecha del último pago debitado', () => {
    const [cuenta] = armarCuentas(gastos, pagos, PROVEEDORES)
    expect(cuenta.ultimoPago).toBe('2026-08-14')
  })

  it('los conceptos se leen del más viejo al más nuevo, como un extracto', () => {
    const [cuenta] = armarCuentas(gastos, pagos, PROVEEDORES)
    expect(cuenta.conceptos.map((c) => c.id)).toEqual(['g-abr', 'g-may', 'g-jun', 'g-litigio', 'g-jul'])
  })
})

describe('armarCuentas', () => {
  it('una cuenta saldada da cero, sin arrastrar centavos', () => {
    const gs = [gasto({ id: 'g1', mes: '2026-07', monto: 680553, proveedor_id: 'p-contador' })]
    const ps = [
      pago({ id: 'a', origen_id: 'g1', monto: 107367, fecha_emision: '2026-08-14' }),
      pago({ id: 'b', origen_id: 'g1', monto: 111427, fecha_emision: '2026-08-14' }),
      pago({ id: 'c', origen_id: 'g1', monto: 226800, fecha_emision: '2026-08-14' }),
      pago({ id: 'd', origen_id: 'g1', monto: 234959, fecha_emision: '2026-08-20' }),
    ]
    expect(armarCuentas(gs, ps, PROVEEDORES)[0].saldo).toBe(0)
  })

  it('un pago agendado a futuro todavía no baja la deuda', () => {
    const gs = [gasto({ id: 'g1', mes: '2026-08', monto: 350000 })]
    const ps = [pago({ id: 'a', origen_id: 'g1', monto: 350000, fecha_emision: '2026-09-10', debitado: false })]
    const [cuenta] = armarCuentas(gs, ps, PROVEEDORES)
    expect(cuenta.saldo).toBe(350000)
    expect(cuenta.totalPagado).toBe(0)
    expect(cuenta.ultimoPago).toBeNull()
    // El pago igual se ve en el detalle: está agendado, no es que no exista.
    expect(cuenta.conceptos[0].pagos).toHaveLength(1)
  })

  it('un gasto sin acreedor no arma cuenta', () => {
    const gs = [gasto({ id: 'g1', mes: '2026-08', monto: 100, proveedor_id: null })]
    expect(armarCuentas(gs, [], PROVEEDORES)).toEqual([])
  })

  it('pagar de más no genera saldo a favor', () => {
    const gs = [gasto({ id: 'g1', mes: '2026-08', monto: 100 })]
    const ps = [pago({ id: 'a', origen_id: 'g1', monto: 150, fecha_emision: '2026-08-10' })]
    expect(armarCuentas(gs, ps, PROVEEDORES)[0].saldo).toBe(0)
  })

  it('los pagos de otro gasto no se cuelan en esta cuenta', () => {
    const gs = [gasto({ id: 'g1', mes: '2026-08', monto: 350000 })]
    const ps = [pago({ id: 'a', origen_id: 'otro-gasto', monto: 350000, fecha_emision: '2026-08-10' })]
    expect(armarCuentas(gs, ps, PROVEEDORES)[0].saldo).toBe(350000)
  })

  it('primero se listan las cuentas con saldo', () => {
    const gs = [
      gasto({ id: 'g1', mes: '2026-08', monto: 100, proveedor_id: 'p-contador' }),
      gasto({ id: 'g2', mes: '2026-08', monto: 100, proveedor_id: 'p-abogado' }),
    ]
    const ps = [pago({ id: 'a', origen_id: 'g1', monto: 100, fecha_emision: '2026-08-10' })]
    expect(armarCuentas(gs, ps, PROVEEDORES).map((c) => c.proveedorId)).toEqual(['p-abogado', 'p-contador'])
  })
})
