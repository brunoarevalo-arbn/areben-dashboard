import { describe, it, expect } from 'vitest'
import {
  normalizarCbu, limpiar, validarCuenta, formatearCbu, etiquetaCuenta, ordenarCuentasAcreedor,
  cuentasPorAcreedor, type AcreedorCuenta,
} from '@/lib/acreedor-cuentas'

function cuenta(o: Partial<AcreedorCuenta> & { id: string }): AcreedorCuenta {
  return {
    proveedor_id: 'p-abogado',
    sugerida: false,
    activa: true,
    created_at: '2026-08-31T00:00:00Z',
    updated_at: '2026-08-31T00:00:00Z',
    ...o,
  }
}

describe('normalizarCbu', () => {
  // El CBU se copia de un chat, de un PDF o del home banking y viene con cualquier separador.
  it('deja solo los 22 números, venga como venga', () => {
    expect(normalizarCbu('0170 0999 2000 0123 4567 78')).toBe('0170099920000123456778')
    expect(normalizarCbu('0170-0999-2000-0123-4567-78')).toBe('0170099920000123456778')
    expect(normalizarCbu(' 0170099920000123456778 ')).toBe('0170099920000123456778')
  })

  it('vacío es null, no cadena en blanco', () => {
    expect(normalizarCbu('')).toBeNull()
    expect(normalizarCbu('   ')).toBeNull()
    expect(normalizarCbu(undefined)).toBeNull()
  })
})

describe('limpiar', () => {
  it('recorta, colapsa espacios y devuelve null si no quedó nada', () => {
    expect(limpiar('  Gómez   y  Asociados ')).toBe('Gómez y Asociados')
    expect(limpiar('   ')).toBeNull()
  })
})

describe('validarCuenta', () => {
  it('sin alias ni CBU no se puede transferir', () => {
    expect(validarCuenta({})).toMatch(/al menos el alias o el CBU/)
  })

  it('con el alias solo alcanza', () => {
    expect(validarCuenta({ alias: 'santiago.gomez' })).toBeNull()
  })

  it('con el CBU solo también', () => {
    expect(validarCuenta({ cbu: '0170099920000123456778' })).toBeNull()
  })

  it('avisa cuántos números faltan cuando el CBU está cortado', () => {
    const r = validarCuenta({ cbu: '01700999200001234' })
    expect(r).toMatch(/22 números/)
    expect(r).toMatch(/17/)
  })

  it('el CBU con separadores es válido: se normaliza antes de contar', () => {
    expect(validarCuenta({ cbu: '0170 0999 2000 0123 4567 78' })).toBeNull()
  })

  it('rechaza un alias con caracteres que el banco no acepta', () => {
    expect(validarCuenta({ alias: 'santiago gomez' })).toMatch(/alias/)
    expect(validarCuenta({ alias: 'sgz' })).toMatch(/alias/)
  })
})

describe('formatearCbu', () => {
  it('parte en 8 + 14, que es como se lee y se dicta', () => {
    expect(formatearCbu('0170099920000123456778')).toBe('01700999 20000123456778')
  })

  it('lo incompleto se muestra tal cual en vez de romperse', () => {
    expect(formatearCbu('017009')).toBe('017009')
    expect(formatearCbu(null)).toBe('')
  })
})

describe('etiquetaCuenta', () => {
  it('el alias manda; si no hay, el banco; si no, el CBU', () => {
    expect(etiquetaCuenta(cuenta({ id: '1', alias: 'mi.alias', banco: 'Galicia' }))).toBe('mi.alias')
    expect(etiquetaCuenta(cuenta({ id: '2', banco: 'Galicia' }))).toBe('Galicia')
    expect(etiquetaCuenta(cuenta({ id: '3', cbu: '0170099920000123456778' }))).toBe('01700999 20000123456778')
  })
})

describe('ordenarCuentasAcreedor', () => {
  it('la sugerida va primera aunque alfabéticamente vaya última', () => {
    const orden = ordenarCuentasAcreedor([
      cuenta({ id: 'a', alias: 'aaa.aaa.aaa', banco: 'Galicia' }),
      cuenta({ id: 'z', alias: 'zzz.zzz.zzz', banco: 'Santander', sugerida: true }),
    ])
    expect(orden.map((c) => c.id)).toEqual(['z', 'a'])
  })

  it('no toca el arreglo que recibe', () => {
    const original = [
      cuenta({ id: 'a', alias: 'aaa.aaa.aaa' }),
      cuenta({ id: 'z', alias: 'zzz.zzz.zzz', sugerida: true }),
    ]
    ordenarCuentasAcreedor(original)
    expect(original.map((c) => c.id)).toEqual(['a', 'z'])
  })
})

describe('cuentasPorAcreedor', () => {
  it('agrupa por acreedor y deja cada grupo con la sugerida arriba', () => {
    const m = cuentasPorAcreedor([
      cuenta({ id: 'a1', proveedor_id: 'p-abogado', alias: 'bbb.bbb.bbb' }),
      cuenta({ id: 'c1', proveedor_id: 'p-contador', alias: 'ccc.ccc.ccc' }),
      cuenta({ id: 'a2', proveedor_id: 'p-abogado', alias: 'zzz.zzz.zzz', sugerida: true }),
    ])
    expect(m.get('p-abogado')?.map((c) => c.id)).toEqual(['a2', 'a1'])
    expect(m.get('p-contador')?.map((c) => c.id)).toEqual(['c1'])
  })

  it('las archivadas siguen agrupadas: la pantalla decide si las muestra', () => {
    const m = cuentasPorAcreedor([cuenta({ id: 'v', alias: 'vieja.vieja', activa: false })])
    expect(m.get('p-abogado')).toHaveLength(1)
  })
})
