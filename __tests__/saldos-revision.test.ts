import { describe, it, expect } from 'vitest'
import { estadoRevision, textoRevision, nombreRevisor, variacion, lugaresConDolares } from '@/lib/saldos-revision'

describe('estadoRevision', () => {
  it('sin fila del mes → sin cargar', () => {
    expect(estadoRevision(undefined)).toBe('sin-cargar')
  })

  it('el caso que motivó todo: saldo en $0 cargado NO es "sin cargar"', () => {
    // Max Capital cerró junio en cero. Antes esto se veía igual que no haberlo mirado.
    expect(estadoRevision({ cerrado: false, updated_at: '2026-07-25T12:00:00Z' })).toBe('cargado')
  })

  it('marcado por alguien → revisado', () => {
    expect(estadoRevision({ cerrado: true, fecha_cierre: '2026-07-25T12:00:00Z' })).toBe('revisado')
  })

  it('si el mes ya está cerrado, lo cargado cuenta como revisado', () => {
    expect(estadoRevision({ cerrado: false }, true)).toBe('revisado')
  })

  it('un mes cerrado no inventa saldos que nunca se cargaron', () => {
    expect(estadoRevision(undefined, true)).toBe('sin-cargar')
  })
})

describe('textoRevision', () => {
  it('muestra quién y cuándo revisó', () => {
    expect(textoRevision({
      cerrado: true,
      fecha_cierre: '2026-07-25T12:00:00Z',
      revisado_por: 'brunoarevalo@arebensrl.com',
    })).toBe('Revisado 25/7 por Bruno')
  })

  it('cargado muestra la fecha de carga', () => {
    expect(textoRevision({ cerrado: false, updated_at: '2026-07-25T12:00:00Z' })).toBe('Cargado el 25/7')
  })

  it('revisado por cierre del mes no inventa fecha', () => {
    expect(textoRevision({ cerrado: false }, true)).toBe('Revisado (mes cerrado)')
  })

  it('sin cargar', () => {
    expect(textoRevision(undefined)).toBe('Sin cargar')
  })
})

describe('nombreRevisor', () => {
  it('traduce los emails conocidos', () => {
    expect(nombreRevisor('brunoarevalo@arebensrl.com')).toBe('Bruno')
    expect(nombreRevisor('darioarevalo@arebensrl.com')).toBe('Darío')
  })

  it('email desconocido → parte antes del arroba', () => {
    expect(nombreRevisor('otro@arebensrl.com')).toBe('otro')
  })

  it('sin email → null', () => {
    expect(nombreRevisor(null)).toBeNull()
  })
})

describe('lugaresConDolares', () => {
  it('un solo lugar no es problema', () => {
    expect(lugaresConDolares({ enCuentas: true })).toHaveLength(1)
  })

  it('sin dólares en ningún lado', () => {
    expect(lugaresConDolares({})).toEqual([])
  })

  it('el caso de mayo: dólares como activo manual Y en la columna USD → dos lugares', () => {
    const l = lugaresConDolares({ enCuentas: true, enManuales: true })
    expect(l).toHaveLength(2)
    expect(l).toContain('la columna USD de las cuentas')
    expect(l).toContain('otros activos manuales')
  })

  it('los tres caminos a la vez', () => {
    expect(lugaresConDolares({ enCuentas: true, enManuales: true, enCajaCierre: true })).toHaveLength(3)
  })
})

describe('variacion', () => {
  it('sin mes anterior no muestra nada', () => {
    expect(variacion(100, undefined).hay).toBe(false)
  })

  it('detecta la cuenta que tenía plata y quedó en cero', () => {
    // Max Capital: $28.000.000 en mayo → $0 en junio
    const v = variacion(0, 28_000_000)
    expect(v.cayoACero).toBe(true)
    expect(v.delta).toBe(-28_000_000)
  })

  it('un cero que ya venía en cero no alarma', () => {
    expect(variacion(0, 0).cayoACero).toBe(false)
    expect(variacion(0, 0).hay).toBe(false)
  })

  it('saldo que sube', () => {
    const v = variacion(1500, 1000)
    expect(v.hay).toBe(true)
    expect(v.delta).toBe(500)
    expect(v.cayoACero).toBe(false)
  })

  it('ignora diferencias de centavos', () => {
    expect(variacion(1000.004, 1000).hay).toBe(false)
  })
})
