import { describe, it, expect } from 'vitest'
import { generarPeriodos, planDevolucion, detalleComprobanteDevolucion, type FilaPeriodo } from '@/lib/inversiones-calc'

const TASA = 0.0175
const tramo = (fecha: string, tasa = TASA) => [{ fecha_desde: fecha, tasa_mensual: tasa }]

/**
 * Replica lo que hace la server action `devolverYCerrarInstrumento`:
 * recalcula el ciclo con la fecha de corte y arma el plan de devolución.
 * El día del pago NO devenga interés (es el día en que se cierra el trato).
 */
function devolver(args: {
  capitalInicial: number
  fechaInicio: string
  vencimiento: string | null
  capitalizable: boolean
  plazoDias?: number
  fechaPago: string
  periodosActuales?: FilaPeriodo[]
}) {
  const { capitalInicial, fechaInicio, vencimiento, capitalizable, plazoDias, fechaPago } = args
  const fechaCorte = vencimiento && fechaPago > vencimiento ? vencimiento : fechaPago
  const usaPlano = !capitalizable && !!vencimiento
  const finGenerador = usaPlano
    ? fechaCorte
    : new Date(new Date(`${fechaCorte}T00:00:00Z`).getTime() - 86400000).toISOString().substring(0, 10)

  const periodosGenerados = generarPeriodos({
    capitalInicial,
    fechaInicio,
    fechaFin: finGenerador,
    capitalizable,
    hasta: fechaCorte.substring(0, 7),
    tramos: tramo(fechaInicio),
    plazoDias,
  })

  return planDevolucion({
    periodosGenerados,
    periodosActuales: args.periodosActuales ?? [],
    capitalInicial,
    fechaInicioCiclo: fechaInicio,
    mesDevolucion: fechaPago.substring(0, 7),
  })
}

const CICLO = {
  capitalInicial: 10000,
  fechaInicio: '2026-06-01',
  vencimiento: '2026-09-01',
  capitalizable: false,
  plazoDias: 90,
}

describe('devolución al vencimiento — se paga el mismo día que vence', () => {
  const plan = devolver({ ...CICLO, fechaPago: '2026-09-01' })

  it('paga el capital más los 3 meses de interés plano (1,75% × 3 = 525)', () => {
    expect(plan.capitalPendiente).toBe(10000)
    expect(plan.interesesCiclo).toBe(525)
    expect(plan.totalADevolver).toBe(10525)
  })

  it('el día del pago no devenga: el último mes con interés es agosto', () => {
    const conInteres = plan.filas.filter((f) => f.interes_devengado !== 0).map((f) => f.mes)
    expect(conInteres).toEqual(['2026-06', '2026-07', '2026-08'])
  })

  it('abre el mes del pago con interés 0 — al 31/8 la deuda todavía está viva', () => {
    const agosto = plan.filas.find((f) => f.mes === '2026-08')!
    expect(agosto.saldo_cierre).toBe(10525)
    const septiembre = plan.filas.find((f) => f.mes === '2026-09')!
    expect(septiembre.interes_devengado).toBe(0)
    expect(septiembre.movimiento).toBe(-10525)
    expect(septiembre.saldo_cierre).toBe(0)
  })

  it('el saldo queda en cero exacto', () => {
    expect(plan.filas[plan.filas.length - 1].saldo_cierre).toBe(0)
  })
})

describe('devolución anticipada — el plazo no se cumplió, se prorratea', () => {
  // Retiro el 10/7: 39 días corridos devengados (1/6 al 9/7 inclusive)
  const plan = devolver({ ...CICLO, fechaPago: '2026-07-10' })

  it('cobra el interés prorrateado (39/30 de un mes), no el del plazo entero', () => {
    expect(plan.interesesCiclo).toBe(227.5) // 10.000 × 1,75% × 39/30
    expect(plan.totalADevolver).toBe(10227.5)
  })

  it('el saldo queda en cero exacto — no deja cola negativa', () => {
    expect(plan.filas[plan.filas.length - 1].saldo_cierre).toBe(0)
  })
})

describe('meses ya cerrados', () => {
  // Junio cerrado con el reparto del plazo original (171,20), y ahora se
  // devuelve anticipadamente el 10/7: el total correcto pasa a ser 227,50.
  const junioCerrado: FilaPeriodo[] = [
    { mes: '2026-06', saldo_inicio: 10000, interes_devengado: 171.2, movimiento: 0, saldo_cierre: 10171.2, cerrado: true },
  ]
  const plan = devolver({ ...CICLO, fechaPago: '2026-07-10', periodosActuales: junioCerrado })

  it('no reescribe el mes cerrado', () => {
    const junio = plan.filas.find((f) => f.mes === '2026-06')!
    expect(junio.interes_devengado).toBe(171.2)
    expect(junio.cerrado).toBe(true)
  })

  it('el último mes abierto absorbe la diferencia para que el total sea el correcto', () => {
    expect(plan.totalADevolver).toBe(10227.5)
    expect(plan.ajusteUltimoMes).toBe(3.8) // lo que junio devengó de menos con el plazo viejo
    const julio = plan.filas.find((f) => f.mes === '2026-07')!
    expect(julio.saldo_inicio).toBe(10171.2) // arranca donde terminó junio
    expect(julio.saldo_cierre).toBe(0)
  })
})

describe('retiro parcial previo', () => {
  // Julio cerrado con un retiro parcial de 2.000; se devuelve el resto el 10/8
  const previos: FilaPeriodo[] = [
    { mes: '2026-06', saldo_inicio: 10000, interes_devengado: 171.2, movimiento: 0, saldo_cierre: 10171.2, cerrado: true },
    { mes: '2026-07', saldo_inicio: 10171.2, interes_devengado: 176.9, movimiento: -2000, saldo_cierre: 8348.1, cerrado: true },
  ]
  const plan = devolver({ ...CICLO, fechaPago: '2026-08-10', periodosActuales: previos })

  it('descuenta el retiro previo del capital pendiente', () => {
    expect(plan.capitalPendiente).toBe(8000)
    expect(plan.totalADevolver).toBe(plan.capitalPendiente + plan.interesesCiclo)
  })

  it('el saldo queda en cero', () => {
    expect(plan.filas[plan.filas.length - 1].saldo_cierre).toBe(0)
  })
})

describe('ciclo que arranca a mitad de mes (renovación)', () => {
  // Caso real (Feliciano): renovó el 28/6 con capital ya neto de un retiro que quedó
  // registrado en junio. Ese junio cerrado es del ciclo ANTERIOR.
  const junioDelCicloViejo: FilaPeriodo[] = [
    { mes: '2026-06', saldo_inicio: 28993.3, interes_devengado: 499.89, movimiento: -6668.97, saldo_cierre: 22324.33, cerrado: true },
  ]
  const plan = devolver({
    capitalInicial: 22324.33,
    fechaInicio: '2026-06-28',
    vencimiento: '2026-09-28',
    capitalizable: false,
    plazoDias: 92,
    fechaPago: '2026-09-28',
    periodosActuales: junioDelCicloViejo,
  })

  it('no descuenta de nuevo el retiro que ya está dentro del capital renovado', () => {
    expect(plan.capitalPendiente).toBe(22324.33)
    expect(plan.movimientosDelCicloAnterior).toEqual([{ mes: '2026-06', monto: -6668.97 }])
  })

  it('cobra los 3 meses del ciclo nuevo sobre el capital renovado', () => {
    expect(plan.interesesCiclo).toBe(1172.03) // 22.324,33 × 1,75% × 3
    expect(plan.totalADevolver).toBe(23496.36)
    expect(plan.filas[plan.filas.length - 1].saldo_cierre).toBe(0)
  })
})

describe('el mes del pago no muestra intereses que no existen', () => {
  // Junio cerrado con el mes entero (45.000.000 × 1,75% = 787.500) mientras el reparto
  // proporcional del plano le daría menos: la diferencia va al último mes que devengó,
  // no al del pago.
  const junio: FilaPeriodo[] = [
    { mes: '2026-06', saldo_inicio: 45000000, interes_devengado: 787500, movimiento: 0, saldo_cierre: 45787500, cerrado: true },
  ]
  const plan = devolver({
    capitalInicial: 45000000,
    fechaInicio: '2026-06-01',
    vencimiento: '2026-09-01',
    capitalizable: false,
    plazoDias: 92,
    fechaPago: '2026-09-01',
    periodosActuales: junio,
  })

  it('el mes del pago queda con interés cero', () => {
    const sept = plan.filas.find((f) => f.mes === '2026-09')!
    expect(sept.interes_devengado).toBe(0)
    expect(sept.saldo_cierre).toBe(0)
  })

  it('el ajuste cae en agosto, el último mes que devengó', () => {
    expect(plan.ajusteUltimoMes).toBeLessThan(0)
    expect(plan.interesesCiclo).toBe(2362500) // 45.000.000 × 1,75% × 3
    const suma = plan.filas.reduce((s, f) => s + f.interes_devengado, 0)
    expect(Math.round(suma * 100) / 100).toBe(2362500)
  })
})

describe('capitalizable (modelo compuesto)', () => {
  const plan = devolver({
    capitalInicial: 10000,
    fechaInicio: '2026-06-01',
    vencimiento: '2026-08-01',
    capitalizable: true,
    fechaPago: '2026-08-01',
  })

  it('el día del pago no devenga y el saldo cierra en cero', () => {
    const conInteres = plan.filas.filter((f) => f.interes_devengado !== 0).map((f) => f.mes)
    expect(conInteres).toEqual(['2026-06', '2026-07'])
    expect(plan.filas[plan.filas.length - 1].saldo_cierre).toBe(0)
  })

  it('capitaliza: el segundo mes devenga sobre el saldo crecido', () => {
    const [jun, jul] = plan.filas
    expect(jul.interes_devengado).toBeGreaterThan(jun.interes_devengado)
    expect(plan.totalADevolver).toBe(10000 + plan.interesesCiclo)
  })
})

describe('devolución con un retiro en el MISMO mes del pago (caso Tamayo, 28-nov-2026)', () => {
  // INV-001 USD de Feliciano Tamayo: retiro de US$400,64 el 3/11 y se cierra el 28/11.
  // Antes el retiro del mes del pago se perdía y el capital salía US$400,64 de más.
  const movimientos = [
    { mes: '2026-10', fecha: '2026-10-16', monto: -6472.49 },
    { mes: '2026-10', fecha: '2026-10-21', monto: -3215.43 },
    { mes: '2026-10', fecha: '2026-10-28', monto: -1597.44 },
    { mes: '2026-11', fecha: '2026-11-03', monto: -400.64 },
  ]
  const periodosGenerados = generarPeriodos({
    capitalInicial: 24111.08,
    fechaInicio: '2026-09-28',
    fechaFin: '2026-11-28',
    capitalizable: false,
    hasta: '2026-11',
    movimientos,
    tramos: tramo('2026-09-28'),
  })
  const periodosActuales: FilaPeriodo[] = [
    { mes: '2026-09', saldo_inicio: 23758.11, interes_devengado: 394.7, movimiento: 0, saldo_cierre: 24152.81, cerrado: true },
    { mes: '2026-10', saldo_inicio: 24152.81, interes_devengado: 347.38, movimiento: -11285.36, saldo_cierre: 13214.83, cerrado: true },
    { mes: '2026-11', saldo_inicio: 13214.83, interes_devengado: 215.51, movimiento: -400.64, saldo_cierre: 13029.7, cerrado: false },
  ]
  const plan = planDevolucion({
    periodosGenerados,
    periodosActuales,
    capitalInicial: 24111.08,
    fechaInicioCiclo: '2026-09-28',
    mesDevolucion: '2026-11',
    movimientoMesPago: -400.64,
  })

  it('el capital que le queda descuenta TODOS los retiros, también el del 3/11', () => {
    expect(plan.capitalPendiente).toBe(12425.08)
  })

  it('el total es capital + intereses del ciclo', () => {
    expect(plan.totalADevolver).toBe(Math.round((12425.08 + plan.interesesCiclo) * 100) / 100)
  })

  it('el mes del pago queda en cero y su movimiento junta retiro + devolución', () => {
    const nov = plan.filas[plan.filas.length - 1]
    expect(nov.saldo_cierre).toBe(0)
    expect(nov.movimiento).toBe(Math.round((-400.64 - plan.totalADevolver) * 100) / 100)
  })
})

describe('detalle del comprobante de devolución (caso Tamayo, 28-nov-2026)', () => {
  const d = detalleComprobanteDevolucion({
    capitalInicial: 24111.08,
    fechaInicio: '2026-09-28',
    fechaPago: '2026-11-28',
    totalPagado: 13014.68,
    movimientos: [
      { fecha: '2026-06-10', mes: '2026-06', monto: -6668.97, motivo: 'retiro_parcial' }, // ciclo anterior: no va
      { fecha: '2026-10-16', mes: '2026-10', monto: -6472.49, motivo: 'retiro_parcial' },
      { fecha: '2026-10-21', mes: '2026-10', monto: -3215.43, motivo: 'retiro_parcial' },
      { fecha: '2026-10-28', mes: '2026-10', monto: -1597.44, motivo: 'retiro_parcial' },
      { fecha: '2026-11-03', mes: '2026-11', monto: -400.64, motivo: 'retiro_parcial' },
    ],
    tramosTasa: [{ fecha_desde: '2026-09-28', tasa_mensual: 0.0175 }],
  })

  it('capital e intereses salen de lo pagado, no del caché de períodos', () => {
    expect(d.capital).toBe(12425.08)
    expect(d.intereses).toBe(589.6)
  })
  it('lista el capital inicial y solo los retiros de este ciclo', () => {
    expect(d.movimientos.map((m) => m.fecha)).toEqual(['2026-09-28', '2026-10-16', '2026-10-21', '2026-10-28', '2026-11-03'])
  })
  it('los tramos cortan en cada retiro y cada mes, y suman el interés exacto', () => {
    expect(d.tramos.map((t) => [t.desde, t.hasta, t.dias])).toEqual([
      ['2026-09-28', '2026-09-30', 3], ['2026-10-01', '2026-10-15', 15], ['2026-10-16', '2026-10-20', 5],
      ['2026-10-21', '2026-10-27', 7], ['2026-10-28', '2026-10-31', 4], ['2026-11-01', '2026-11-02', 2],
      ['2026-11-03', '2026-11-27', 25],
    ])
    expect(Math.round(d.tramos.reduce((s, t) => s + t.interes, 0) * 100) / 100).toBe(589.6)
    expect(d.tramos[0].interes).toBe(42.19)
  })
})
