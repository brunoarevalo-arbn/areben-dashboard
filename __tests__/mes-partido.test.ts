import { describe, it, expect } from 'vitest'
import { ajusteDelMesPartido, revisarCadena } from '../lib/inversiones-cadena'
import { generarPeriodos } from '../lib/inversiones-calc'

/**
 * El mes partido: un plazo que vence a mitad de mes deja ese mes con dos pedazos, y el
 * sistema obliga a cerrarlo antes de que el segundo exista. Caso real: Fredy Arévalo
 * INV-003, agosto 2026.
 */

// La fila tal como quedó en la base: sólo el pedazo del plazo viejo (1 al 26 de agosto).
const AGOSTO_FREDY = {
  mes: '2026-08',
  saldo_inicio: 2591008,
  interes_devengado: 47828.57,
  int_inicio_prorrateado: 0,
  movimiento: -1389605,
  cerrado: true,
}

describe('ajusteDelMesPartido', () => {
  it('le suma al mes cerrado los primeros días del plazo nuevo', () => {
    const a = ajusteDelMesPartido({
      fechaInicioCiclo: '2026-08-27',
      guardado: AGOSTO_FREDY,
      pedazoDelPlazoNuevo: 6044.67,
    })
    expect(a).not.toBeNull()
    expect(a!.diferencia).toBe(6044.67)
    expect(a!.interesDespues).toBe(53873.24)
    // 2.591.008 + 53.873,24 − 1.389.605
    expect(a!.saldoCierreDespues).toBe(1255276.24)
  })

  it('es idempotente: correrlo de nuevo no vuelve a sumar', () => {
    const yaAjustada = {
      ...AGOSTO_FREDY,
      interes_devengado: 53873.24,
      int_inicio_prorrateado: 6044.67,
    }
    expect(ajusteDelMesPartido({
      fechaInicioCiclo: '2026-08-27', guardado: yaAjustada, pedazoDelPlazoNuevo: 6044.67,
    })).toBeNull()
  })

  it('NO duplica cuando el pedazo ya está adentro y bien anotado', () => {
    // Los 5 que se corrigieron a mano el 8-sep: la plata está y la marca también.
    const tamayoJunio = {
      mes: '2026-06', saldo_inicio: 29077.47, interes_devengado: 520.24,
      int_inicio_prorrateado: 39.19, movimiento: -6668.97, cerrado: true,
    }
    expect(ajusteDelMesPartido({
      fechaInicioCiclo: '2026-06-28', guardado: tamayoJunio, pedazoDelPlazoNuevo: 39.19,
    })).toBeNull()
  })

  it('no toca un plazo que arranca un día 1: no parte ningún mes', () => {
    expect(ajusteDelMesPartido({
      fechaInicioCiclo: '2026-07-01',
      guardado: { ...AGOSTO_FREDY, mes: '2026-07' },
      pedazoDelPlazoNuevo: 999,
    })).toBeNull()
  })

  it('no toca ningún mes cerrado que no sea el del arranque', () => {
    expect(ajusteDelMesPartido({
      fechaInicioCiclo: '2026-08-27',
      guardado: { ...AGOSTO_FREDY, mes: '2026-07' },
      pedazoDelPlazoNuevo: 6044.67,
    })).toBeNull()
  })

  it('no toca un mes abierto: ese se reescribe entero igual', () => {
    expect(ajusteDelMesPartido({
      fechaInicioCiclo: '2026-08-27',
      guardado: { ...AGOSTO_FREDY, cerrado: false },
      pedazoDelPlazoNuevo: 6044.67,
    })).toBeNull()
  })

  it('se planta si la corrección dejaría el mes con interés negativo', () => {
    expect(ajusteDelMesPartido({
      fechaInicioCiclo: '2026-08-27',
      guardado: { ...AGOSTO_FREDY, int_inicio_prorrateado: 999999 },
      pedazoDelPlazoNuevo: 0,
    })).toBeNull()
  })

  it('sin fila guardada no hay nada que ajustar', () => {
    expect(ajusteDelMesPartido({
      fechaInicioCiclo: '2026-08-27', guardado: undefined, pedazoDelPlazoNuevo: 6044.67,
    })).toBeNull()
  })
})

describe('el caso Fredy INV-003 de punta a punta', () => {
  const plazoNuevo = generarPeriodos({
    capitalInicial: 1249231.57,
    fechaInicio: '2026-08-27',
    fechaFin: '2026-09-27',
    capitalizable: false,
    hasta: '2026-09',
    movimientos: [{ mes: '2026-08', fecha: '2026-08-11', monto: -1389605 }],
    tramos: [
      { fecha_desde: '2026-06-27', tasa_mensual: 0.032 },
      { fecha_desde: '2026-08-27', tasa_mensual: 0.03 },
    ],
    plazoDias: 31,
  })

  it('el motor le asigna a agosto los 5 días del plazo nuevo', () => {
    const agosto = plazoNuevo.find((p) => p.mes === '2026-08')!
    expect(agosto.int_inicio_prorrateado).toBe(6044.67)
  })

  it('el retiro del 11/08 NO se vuelve a restar en el plazo nuevo', () => {
    // Es anterior al arranque del 27/08: ya está adentro del capital.
    expect(plazoNuevo.find((p) => p.mes === '2026-08')!.movimiento).toBe(0)
  })

  it('con el ajuste aplicado, la cadena cierra', () => {
    const agostoCalc = plazoNuevo.find((p) => p.mes === '2026-08')!
    const ajuste = ajusteDelMesPartido({
      fechaInicioCiclo: '2026-08-27',
      guardado: AGOSTO_FREDY,
      pedazoDelPlazoNuevo: agostoCalc.int_inicio_prorrateado,
    })!
    const septiembre = plazoNuevo.find((p) => p.mes === '2026-09')!

    // Sin el ajuste, la cadena se rompe por los 6.044,67 exactos.
    const rota = revisarCadena([
      { instrumento_id: 'x', mes: '2026-08', saldo_inicio: 2591008, saldo_cierre: 1249231.57 },
      { instrumento_id: 'x', mes: '2026-09', saldo_inicio: septiembre.saldo_inicio, saldo_cierre: septiembre.saldo_cierre },
    ])
    expect(rota).toHaveLength(1)
    expect(rota[0].diferencia).toBe(6044.67)

    // Con el ajuste, no queda ningún descuadre.
    const sana = revisarCadena([
      { instrumento_id: 'x', mes: '2026-08', saldo_inicio: 2591008, saldo_cierre: ajuste.saldoCierreDespues },
      { instrumento_id: 'x', mes: '2026-09', saldo_inicio: septiembre.saldo_inicio, saldo_cierre: septiembre.saldo_cierre },
    ])
    expect(sana).toHaveLength(0)
  })
})
