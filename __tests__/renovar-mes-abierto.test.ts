import { describe, it, expect } from 'vitest'
import { capitalAlVencimiento, filaDelMesPartidoAbierto } from '../lib/inversiones-cadena'
import { generarPeriodos } from '../lib/inversiones-calc'

/**
 * Renovar el mismo día que vence, con el mes del vencimiento abierto. Caso real: Javier
 * Sequeira INV-001, US$ al 1,75% sin capitalizar, 09/07 → 09/10/2026, septiembre cerrado
 * en 16.655,26 y octubre abierto con 72,55 de interés (del 1 al 8).
 */

const plazoViejo = () => generarPeriodos({
  capitalInicial: 9886.41,
  fechaInicio: '2026-07-09',
  fechaFin: '2026-10-09',
  capitalizable: false,
  hasta: '2026-10',
  movimientos: [{ mes: '2026-07', fecha: '2026-07-09', monto: 6007 }],
  tramos: [{ fecha_desde: '2026-06-09', tasa_mensual: 0.0175 }],
  plazoDias: 92,
})

const plazoNuevo = (capital: number) => generarPeriodos({
  capitalInicial: capital,
  fechaInicio: '2026-10-09',
  fechaFin: '2027-01-09',
  capitalizable: false,
  hasta: '2027-01',
  movimientos: [{ mes: '2026-07', fecha: '2026-07-09', monto: 6007 }],
  tramos: [{ fecha_desde: '2026-06-09', tasa_mensual: 0.0175 }],
  plazoDias: 92,
})

describe('renovar con el mes del vencimiento abierto', () => {
  const viejo = plazoViejo()
  const octubreViejo = viejo.find((p) => p.mes === '2026-10')!

  it('el motor da para octubre lo mismo que está guardado', () => {
    expect(octubreViejo.saldo_inicio).toBe(16655.26)
    expect(octubreViejo.interes_devengado).toBe(72.55)
    // El plazo completo rinde 15.893,41 × 1,75% × 3, ni un centavo menos.
    expect(viejo.reduce((s, p) => s + p.interes_devengado, 0)).toBeCloseTo(834.40, 2)
  })

  it('el capital nuevo es el saldo con los intereses hasta el vencimiento', () => {
    const r = capitalAlVencimiento({
      fechaVencimiento: '2026-10-09',
      filaDelMes: octubreViejo,
      cierreAnterior: 16655.26,
      movimientosDelMes: [],
    })
    expect(r).toEqual({ ok: true, capital: 16727.81, interesDelMes: 72.55, movidoAntes: 0 })
  })

  it('octubre suma los días del plazo viejo y los del nuevo, y no se pierde nada al recalcular', () => {
    const nuevo = plazoNuevo(16727.81)
    const octubreNuevo = nuevo.find((p) => p.mes === '2026-10')!
    const guardadoAntes = { mes: '2026-10', saldo_inicio: 16655.26, interes_devengado: 72.55, int_inicio_prorrateado: 0, movimiento: 0, cerrado: false }

    const fila = filaDelMesPartidoAbierto({
      fechaInicioCiclo: '2026-10-09',
      guardado: guardadoAntes,
      cierreAnterior: 16655.26,
      pedazoDelPlazoNuevo: octubreNuevo.int_inicio_prorrateado,
      movimientoDelMes: 0,
    })!
    expect(fila.saldo_inicio).toBe(16655.26)
    expect(fila.int_fin_prorrateado).toBe(72.55)
    expect(fila.interes_devengado).toBe(Math.round((72.55 + octubreNuevo.int_inicio_prorrateado) * 100) / 100)
    // Octubre cierra donde arranca noviembre en el plazo nuevo: la cadena sigue sana.
    expect(fila.saldo_cierre).toBe(octubreNuevo.saldo_cierre)

    // Recalcular otra vez (editar, cargar una tasa, cerrar otro mes) da exactamente lo mismo.
    const otraVez = filaDelMesPartidoAbierto({
      fechaInicioCiclo: '2026-10-09',
      guardado: { ...guardadoAntes, ...fila },
      cierreAnterior: 16655.26,
      pedazoDelPlazoNuevo: octubreNuevo.int_inicio_prorrateado,
      movimientoDelMes: 0,
    })
    expect(otraVez).toEqual(fila)

    // El plazo nuevo completo rinde 16.727,81 × 1,75% × 3.
    expect(nuevo.reduce((s, p) => s + p.interes_devengado, 0)).toBeCloseTo(878.21, 2)
  })

  it('la plata que se movió en el mes antes de vencer entra al capital; la de después, no', () => {
    const r = capitalAlVencimiento({
      fechaVencimiento: '2026-10-09',
      filaDelMes: { saldo_inicio: 1000, interes_devengado: 5 },
      cierreAnterior: 1000,
      movimientosDelMes: [
        { fecha: '2026-10-03', monto: -100 },
        { fecha: '2026-10-09', monto: 50 }, // el día que vence ya es del plazo nuevo
      ],
    })
    expect(r).toEqual({ ok: true, capital: 905, interesDelMes: 5, movidoAntes: -100 })
  })

  it('no renueva con un movimiento sin día ni con la cuenta cortada', () => {
    expect(capitalAlVencimiento({
      fechaVencimiento: '2026-10-09',
      filaDelMes: { saldo_inicio: 1000, interes_devengado: 5 },
      cierreAnterior: 1000,
      movimientosDelMes: [{ fecha: null, monto: -100 }],
    }).ok).toBe(false)
    expect(capitalAlVencimiento({
      fechaVencimiento: '2026-10-09',
      filaDelMes: { saldo_inicio: 1000, interes_devengado: 5 },
      cierreAnterior: 990,
      movimientosDelMes: [],
    }).ok).toBe(false)
  })

  it('caso Tello: renovado antes de vencer, la cola del plazo viejo queda en octubre', () => {
    // US$15.000 al 1,5%, 06/04 → 06/10, renovado el 30/09. La fila de octubre guardada a
    // mano: 36,88 del plazo viejo + 207,93 del nuevo.
    const fila = filaDelMesPartidoAbierto({
      fechaInicioCiclo: '2026-10-06',
      guardado: { mes: '2026-10', saldo_inicio: 16313.12, interes_devengado: 244.81, int_inicio_prorrateado: 207.93, movimiento: 0, cerrado: false },
      cierreAnterior: 16313.12,
      pedazoDelPlazoNuevo: 207.93,
      movimientoDelMes: 0,
    })
    expect(fila).toEqual({ saldo_inicio: 16313.12, interes_devengado: 244.81, int_inicio_prorrateado: 207.93, int_fin_prorrateado: 36.88, saldo_cierre: 16557.93 })
  })

  it('no aplica a un plazo nuevo sin historia, a uno que arranca un día 1, ni a un mes cerrado', () => {
    const base = { fechaInicioCiclo: '2026-10-09', cierreAnterior: 16655.26, pedazoDelPlazoNuevo: 10, movimientoDelMes: 0 }
    const g = { mes: '2026-10', saldo_inicio: 16655.26, interes_devengado: 72.55, int_inicio_prorrateado: 0, movimiento: 0, cerrado: false }
    expect(filaDelMesPartidoAbierto({ ...base, guardado: g, cierreAnterior: null })).toBeNull()
    expect(filaDelMesPartidoAbierto({ ...base, guardado: { ...g, cerrado: true } })).toBeNull()
    expect(filaDelMesPartidoAbierto({ ...base, guardado: g, fechaInicioCiclo: '2026-10-01' })).toBeNull()
    expect(filaDelMesPartidoAbierto({ ...base, guardado: undefined })).toBeNull()
  })
})
