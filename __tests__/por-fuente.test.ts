import { describe, it, expect } from 'vitest'
import { fuenteDe, sumarFuente, cerrarFuente } from '@/lib/gestion-nube/por-fuente.mjs'

describe('por-fuente: de qué sistema sale lo vendido', () => {
  it('una venta sin fuente NO se supone de GN', () => {
    expect(fuenteDe({ fuente: 'gn' })).toBe('gn')
    expect(fuenteDe({ fuente: 'erp' })).toBe('erp')
    expect(fuenteDe({})).toBe('sin_dato')
    expect(fuenteDe({ fuente: 'GN' })).toBe('sin_dato')
  })

  it('suma ventas y brutas por fuente, con el primer y el último día', () => {
    const por = {}
    sumarFuente(por, 'gn', '2026-11-14 18:00:00', 100.005)
    sumarFuente(por, 'gn', '2026-11-01', 50)
    sumarFuente(por, 'erp', '2026-11-16', 30)
    sumarFuente(por, 'erp', '2026-11-15', 20)
    expect(cerrarFuente(por)).toEqual({
      gn: { ventas: 2, brutas: 150.01, desde: '2026-11-01', hasta: '2026-11-14' },
      erp: { ventas: 2, brutas: 50, desde: '2026-11-15', hasta: '2026-11-16' },
    })
  })
})
