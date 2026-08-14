import { describe, it, expect } from 'vitest'
import { esCuentaCorriente, acreedorDe, ACREEDOR_POR_CONCEPTO } from '@/lib/cuentas-corrientes'

describe('esCuentaCorriente', () => {
  it('con recurrente manda el flag del recurrente', () => {
    expect(esCuentaCorriente({ concepto: 'X', recurrente_id: 'r1', recurrenteEsCC: true })).toBe(true)
    expect(esCuentaCorriente({ concepto: 'X', recurrente_id: 'r1', recurrenteEsCC: false })).toBe(false)
    expect(esCuentaCorriente({ concepto: 'X', recurrente_id: 'r1' })).toBe(false)
  })

  it('sin recurrente, se mira la lista curada de gastos sueltos', () => {
    expect(esCuentaCorriente({ concepto: 'Hangtags - Stunned' })).toBe(true)
    expect(esCuentaCorriente({ concepto: 'Cualquier otra cosa' })).toBe(false)
  })
})

describe('acreedorDe', () => {
  it('el abono mensual y los honorarios del juicio son del mismo acreedor', () => {
    const abono = acreedorDe('Abogado - Santiago Gomez')
    const litigio = acreedorDe('Honorarios abogado Santiago Gómez - litigio laboral')
    expect(abono).toBeTruthy()
    expect(abono).toBe(litigio)
  })

  it('un concepto sin acreedor declarado devuelve null (sigue agrupando por recurrente)', () => {
    expect(acreedorDe('TGI - Rioja 1440')).toBeNull()
    expect(acreedorDe('')).toBeNull()
  })

  // Si un concepto figura acá pero está escrito distinto al del gasto, el mapa no matchea y la
  // deuda vuelve a verse partida sin que nadie se entere.
  it('todos los conceptos del mapa apuntan a un nombre de acreedor no vacío', () => {
    for (const [concepto, acreedor] of Object.entries(ACREEDOR_POR_CONCEPTO)) {
      expect(concepto.trim()).toBe(concepto)
      expect(acreedor.length).toBeGreaterThan(0)
    }
  })
})
