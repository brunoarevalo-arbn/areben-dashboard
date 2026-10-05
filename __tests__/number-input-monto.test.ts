import { describe, it, expect } from 'vitest'
import { formatearMontoTipeado, montoDeTexto, textoDeMonto } from '@/components/ui/number-input'

describe('montos — se ven como plata mientras se escriben', () => {
  it('los puntos de miles aparecen solos', () => {
    expect(formatearMontoTipeado('8800000', 'ARS')).toBe('$ 8.800.000')
    expect(formatearMontoTipeado('4800', 'USD')).toBe('US$ 4.800')
    expect(formatearMontoTipeado('1234', 'ARS')).toBe('$ 1.234')
  })

  it('al seguir escribiendo sobre lo ya formateado, se reacomodan los puntos', () => {
    expect(formatearMontoTipeado('$ 8.8000', 'ARS')).toBe('$ 88.000')
    expect(formatearMontoTipeado('$ 8.00', 'ARS')).toBe('$ 800')
  })

  it('la coma es para los centavos (hasta 2)', () => {
    expect(formatearMontoTipeado('1500,5', 'ARS')).toBe('$ 1.500,5')
    expect(formatearMontoTipeado('$ 1.500,555', 'ARS')).toBe('$ 1.500,55')
    expect(formatearMontoTipeado(',', 'ARS')).toBe('$ 0,')
  })

  it('el punto tipeado se ignora (en pesos es el de miles)', () => {
    expect(formatearMontoTipeado('8.800.000', 'ARS')).toBe('$ 8.800.000')
  })

  it('vacío queda vacío; el signo solo no se escribe', () => {
    expect(formatearMontoTipeado('', 'ARS')).toBe('')
    expect(formatearMontoTipeado('$ ', 'ARS')).toBe('')
  })

  it('negativos', () => {
    expect(formatearMontoTipeado('-', 'ARS')).toBe('-')
    expect(formatearMontoTipeado('-34122', 'ARS')).toBe('-$ 34.122')
  })

  it('ceros de adelante se van', () => {
    expect(formatearMontoTipeado('$ 05', 'ARS')).toBe('$ 5')
  })
})

describe('montoDeTexto — el número que se guarda', () => {
  it('lee lo formateado', () => {
    expect(montoDeTexto('$ 8.800.000')).toBe(8800000)
    expect(montoDeTexto('US$ 4.800,50')).toBe(4800.5)
    expect(montoDeTexto('-$ 34.122')).toBe(-34122)
    expect(montoDeTexto('')).toBe(0)
    expect(montoDeTexto('-')).toBe(-0)
  })
})

describe('textoDeMonto — cómo se ve un monto guardado', () => {
  it('con signo y puntos, centavos solo si hay', () => {
    expect(textoDeMonto(8800000, 'ARS')).toBe('$ 8.800.000')
    expect(textoDeMonto(4800.5, 'USD')).toBe('US$ 4.800,50')
    expect(textoDeMonto(-34122, 'ARS')).toBe('-$ 34.122')
  })
  it('el cero: vacío salvo que sea un dato cargado', () => {
    expect(textoDeMonto(0, 'ARS')).toBe('')
    expect(textoDeMonto(0, 'ARS', true)).toBe('$ 0')
    expect(textoDeMonto(null, 'ARS')).toBe('')
  })
})
