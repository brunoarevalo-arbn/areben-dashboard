import { describe, it, expect } from 'vitest'
import { textoDeNumero, numeroDeTexto } from '@/components/ui/number-input'

describe('textoDeNumero — qué se ve en el campo', () => {
  it('sin dato → vacío, listo para escribir', () => {
    expect(textoDeNumero(null)).toBe('')
    expect(textoDeNumero(undefined)).toBe('')
  })

  it('el cero de un alta se ve vacío (no hay que borrarlo para escribir)', () => {
    expect(textoDeNumero(0)).toBe('')
  })

  it('el cero cargado a propósito sí se ve', () => {
    // Ej: Max Capital cerró junio en $0 — el campo tiene que mostrar el 0
    expect(textoDeNumero(0, true)).toBe('0')
  })

  it('un número normal se ve tal cual', () => {
    expect(textoDeNumero(28000000)).toBe('28000000')
    expect(textoDeNumero(-34122)).toBe('-34122')
    expect(textoDeNumero(1520.12)).toBe('1520.12')
  })
})

describe('numeroDeTexto — qué recibe el formulario', () => {
  it('campo vacío → 0, sin romper las cuentas que dependen de él', () => {
    expect(numeroDeTexto('')).toBe(0)
  })

  it('a medio escribir un negativo → 0 hasta que haya un número', () => {
    expect(numeroDeTexto('-')).toBe(0)
    expect(numeroDeTexto('.')).toBe(0)
  })

  it('decimal a medio escribir conserva la parte entera', () => {
    // Antes esto se perdía: "12." tiene que valer 12, no 0
    expect(numeroDeTexto('12.')).toBe(12)
    expect(numeroDeTexto('-5.')).toBe(-5)
  })

  it('números completos', () => {
    expect(numeroDeTexto('28000000')).toBe(28000000)
    expect(numeroDeTexto('1520.12')).toBe(1520.12)
    expect(numeroDeTexto('-34122')).toBe(-34122)
  })

  it('el cero escrito a mano vale cero', () => {
    expect(numeroDeTexto('0')).toBe(0)
  })

  it('texto que no es número → 0', () => {
    expect(numeroDeTexto('abc')).toBe(0)
  })
})

describe('ida y vuelta', () => {
  it('escribir un monto y volver a leerlo da lo mismo', () => {
    for (const n of [0, 1, -1, 1520.12, 28000000, -34122]) {
      expect(numeroDeTexto(textoDeNumero(n, true))).toBe(n)
    }
  })
})
