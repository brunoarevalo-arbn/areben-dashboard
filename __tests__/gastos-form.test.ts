import { describe, it, expect } from 'vitest'
import { camposAConservar, CAMPOS_FUERA_DEL_FORM } from '@/lib/gastos-form'

// Simula un FormData: `enviados` son las claves que el formulario mandó.
function form(...enviados: string[]) {
  const s = new Set(enviados)
  return (campo: string) => s.has(campo)
}

const PREVIO = {
  recurrente_id: 'rec-abogado',
  cuenta_origen_pago_id: 'cta-galicia',
  monto_secundario: 1100,
  moneda_secundaria: 'USD',
}

describe('camposAConservar', () => {
  // El bug: el formulario de gasto no tiene campo para el vínculo con la plantilla, así que
  // guardar un gasto —sin tocar nada— lo dejaba suelto y ese mes volvía a figurar sin confirmar.
  it('repone el vínculo con la plantilla cuando el formulario no lo mandó', () => {
    const r = camposAConservar(PREVIO, form('concepto', 'monto', 'estado'))
    expect(r.recurrente_id).toBe('rec-abogado')
  })

  it('repone también la cuenta de origen y el monto en la otra moneda', () => {
    const r = camposAConservar(PREVIO, form('concepto'))
    expect(r.cuenta_origen_pago_id).toBe('cta-galicia')
    expect(r.monto_secundario).toBe(1100)
    expect(r.moneda_secundaria).toBe('USD')
  })

  it('un gasto que no venía de una plantilla sigue sin vínculo', () => {
    const r = camposAConservar({ recurrente_id: null }, form('concepto'))
    expect(r.recurrente_id).toBeNull()
  })

  it('sin gasto previo no inventa nada: todo queda en null', () => {
    const r = camposAConservar(null, form())
    for (const c of CAMPOS_FUERA_DEL_FORM) expect(r[c]).toBeNull()
  })

  // La clave del diseño: si mañana el formulario gana un campo para el acreedor o para la cuenta
  // de origen, ese campo va a viajar y se va a poder VACIAR a propósito. No hay que tocar la lista.
  it('lo que el formulario sí manda no se toca, ni siquiera para vaciarlo', () => {
    const r = camposAConservar(PREVIO, form('recurrente_id', 'cuenta_origen_pago_id'))
    expect('recurrente_id' in r).toBe(false)
    expect('cuenta_origen_pago_id' in r).toBe(false)
    // los que siguen sin viajar, se reponen igual
    expect(r.monto_secundario).toBe(1100)
  })

  it('no devuelve ningún campo de más', () => {
    const r = camposAConservar(PREVIO, form())
    expect(Object.keys(r).sort()).toEqual([...CAMPOS_FUERA_DEL_FORM].sort())
  })
})
