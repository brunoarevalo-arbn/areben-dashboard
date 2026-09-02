import { describe, it, expect } from 'vitest'
import { armarCuentas, type AcreedorGastoInput, type AcreedorPagoInput } from '@/lib/acreedores'
import { cuentasPorAcreedor, type AcreedorCuenta } from '@/lib/acreedor-cuentas'
import { armarPuenteAcreedores } from '@/lib/puente-acreedores'

const PROVEEDORES = [{ id: 'p-abogado', nombre: 'Santiago Gómez (abogado)' }]

function gasto(o: Partial<AcreedorGastoInput> & { id: string; mes: string; monto: number }): AcreedorGastoInput {
  return { concepto: 'Abogado - Santiago Gomez', fecha: `${o.mes}-01`, proveedor_id: 'p-abogado', ...o }
}
function pago(o: Partial<AcreedorPagoInput> & { id: string; origen_id: string; monto: number; fecha_emision: string }): AcreedorPagoInput {
  return { debitado: true, ...o }
}
function banco(o: Partial<AcreedorCuenta> & { id: string }): AcreedorCuenta {
  return {
    proveedor_id: 'p-abogado', sugerida: false, activa: true,
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z', ...o,
  }
}

function armar(gastos: AcreedorGastoInput[], pagos: AcreedorPagoInput[], bancos: AcreedorCuenta[] = []) {
  return armarPuenteAcreedores(
    armarCuentas(gastos, pagos, PROVEEDORES),
    cuentasPorAcreedor(bancos.filter((b) => b.activa)),
  )
}

describe('lo que viaja al Monitor', () => {
  it('manda el saldo, los conceptos que deben y el último movimiento', () => {
    const [a] = armar(
      [gasto({ id: 'g1', mes: '2026-07', monto: 350000 }), gasto({ id: 'g2', mes: '2026-08', monto: 350000 })],
      [pago({ id: 'x1', origen_id: 'g1', monto: 350000, fecha_emision: '2026-08-14' })],
    )
    expect(a.nombre).toBe('Santiago Gómez (abogado)')
    expect(a.saldo).toBe(350000)
    expect(a.ultimoMovimiento).toBe('2026-08-14')
    // El de julio quedó saldado: no viaja. Lo que se muestra es a qué imputar.
    expect(a.conceptos.map((c) => c.id)).toEqual(['g2'])
  })

  // El caso que evita mandar la plata dos veces: la deuda figura abierta porque el cheque todavía
  // no se debitó, pero ya está saldada con un papel entregado.
  it('separa lo que se debe de lo que ya se pagó con un cheque sin debitar', () => {
    const [a] = armar(
      [gasto({ id: 'g1', mes: '2026-08', monto: 350000 })],
      [pago({ id: 'x1', origen_id: 'g1', monto: 350000, fecha_emision: '2026-08-20', debitado: false, instrumento: 'ECHEQ' })],
    )
    expect(a.saldo).toBe(350000)          // el banco todavía no lo debitó
    expect(a.disponible).toBe(0)          // pero no se le puede imputar nada más
    expect(a.yaPagadoSinDebitar).toBe(350000)
  })

  it('sin cheques en la calle, disponible y saldo son el mismo número', () => {
    const [a] = armar([gasto({ id: 'g1', mes: '2026-08', monto: 350000 })], [])
    expect(a.saldo).toBe(350000)
    expect(a.disponible).toBe(350000)
    expect(a.yaPagadoSinDebitar).toBe(0)
  })

  it('nunca devuelve un "ya pagado" negativo aunque se haya pagado de más', () => {
    const [a] = armar(
      [gasto({ id: 'g1', mes: '2026-08', monto: 100000 })],
      [pago({ id: 'x1', origen_id: 'g1', monto: 150000, fecha_emision: '2026-08-20' })],
    )
    expect(a.saldo).toBe(0)
    expect(a.yaPagadoSinDebitar).toBe(0)
  })
})

describe('las cuentas bancarias que viajan', () => {
  it('la sugerida va primera', () => {
    const [a] = armar(
      [gasto({ id: 'g1', mes: '2026-08', monto: 1000 })],
      [],
      [banco({ id: 'b1', alias: 'aaa.aaa.aaa' }), banco({ id: 'b2', alias: 'zzz.zzz.zzz', sugerida: true })],
    )
    expect(a.cuentas.map((c) => c.id)).toEqual(['b2', 'b1'])
  })

  it('las archivadas no viajan: no se transfiere a una cuenta dada de baja', () => {
    const [a] = armar(
      [gasto({ id: 'g1', mes: '2026-08', monto: 1000 })],
      [],
      [banco({ id: 'b1', alias: 'vieja.vieja', activa: false }), banco({ id: 'b2', alias: 'nueva.nueva', sugerida: true })],
    )
    expect(a.cuentas.map((c) => c.id)).toEqual(['b2'])
  })

  it('un acreedor sin ninguna cuenta cargada igual viaja, con la lista vacía', () => {
    const [a] = armar([gasto({ id: 'g1', mes: '2026-08', monto: 1000 })], [])
    expect(a.cuentas).toEqual([])
    expect(a.saldo).toBe(1000)
  })
})
