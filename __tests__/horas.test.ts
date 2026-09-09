import { describe, it, expect } from 'vitest'
import {
  formatHoras,
  horasAMinutos,
  minutosAHoras,
  partirHoras,
  unirHoras,
} from '@/lib/horas'

describe('minutos ↔ horas decimales', () => {
  // El caso que motivó todo: 20 minutos no es un decimal exacto. Con 2 decimales el redondeo
  // sigue devolviendo 20, pero al SUMAR tres cargas daba 0,99 h y la pantalla decía "59 min".
  it('cualquier cantidad de minutos vuelve entera después de ida y vuelta', () => {
    for (let m = 1; m <= 12 * 60; m++) {
      expect(horasAMinutos(minutosAHoras(m))).toBe(m)
    }
  })

  it('tres cargas de 20 minutos suman una hora exacta', () => {
    const veinte = minutosAHoras(20)
    expect(formatHoras(veinte * 3)).toBe('1 h')
  })

  it('guarda con 4 decimales, que es como está la columna', () => {
    expect(minutosAHoras(20)).toBe(0.3333)
    expect(minutosAHoras(30)).toBe(0.5)
    expect(minutosAHoras(90)).toBe(1.5)
  })

  // El mínimo de la base es `round(p_cantidad * 60) < 1`: la misma cuenta que esta función.
  it('lo que no llega a medio minuto redondea a cero', () => {
    expect(horasAMinutos(0.008)).toBe(0)
    expect(horasAMinutos(0.009)).toBe(1)
    expect(horasAMinutos(minutosAHoras(1))).toBe(1)
  })
})

describe('partirHoras / unirHoras', () => {
  it('los minutos quedan siempre entre 0 y 59: el acarreo lo hace el núcleo', () => {
    expect(partirHoras(1.5)).toEqual({ horas: 1, minutos: 30 })
    expect(partirHoras(0.3333)).toEqual({ horas: 0, minutos: 20 })
    expect(partirHoras(2)).toEqual({ horas: 2, minutos: 0 })
    // 90 minutos tipeados en el campo de minutos: se convierten en 1 h 30, no en "1 h 90"
    expect(partirHoras(unirHoras(0, 90))).toEqual({ horas: 1, minutos: 30 })
  })

  it('unir y partir son la misma cuenta al derecho y al revés', () => {
    for (let h = 0; h <= 12; h++) {
      for (const m of [0, 1, 7, 20, 30, 45, 59]) {
        if (h === 12 && m > 0) continue
        expect(partirHoras(unirHoras(h, m))).toEqual({ horas: h, minutos: m })
      }
    }
  })

  it('un campo vacío o basura vale cero, no NaN', () => {
    expect(unirHoras(NaN, 30)).toBe(0.5)
    expect(minutosAHoras(NaN)).toBe(0)
    expect(horasAMinutos(Infinity)).toBe(0)
  })
})

describe('formatHoras', () => {
  it('escribe el par completo y omite la mitad que es cero', () => {
    expect(formatHoras(2.5)).toBe('2 h 30 min')
    expect(formatHoras(2)).toBe('2 h')
    expect(formatHoras(0.75)).toBe('45 min')
    expect(formatHoras(0.3333)).toBe('20 min')
    expect(formatHoras(0)).toBe('0 h')
  })

  // Un total en pantalla es una suma de varias cargas: no puede aparecer "0.9999 hs".
  it('nunca deja escapar el decimal crudo', () => {
    for (let m = 1; m <= 12 * 60; m++) {
      expect(formatHoras(minutosAHoras(m))).not.toMatch(/\./)
    }
  })
})
