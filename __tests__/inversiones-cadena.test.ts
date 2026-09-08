import { describe, it, expect } from 'vitest'
import { revisarCadena, capitalAlRenovar, type FilaCadena } from '@/lib/inversiones-cadena'

function fila(mes: string, inicio: number, cierre: number, instrumento_id = 'i1'): FilaCadena {
  return { instrumento_id, mes, saldo_inicio: inicio, saldo_cierre: cierre }
}

describe('revisarCadena', () => {
  it('no marca nada cuando cada mes arranca donde cerró el anterior', () => {
    expect(revisarCadena([
      fila('2026-05', 1000, 1017.50),
      fila('2026-06', 1017.50, 1035.31),
      fila('2026-07', 1035.31, 1053.43),
    ])).toEqual([])
  })

  it('el movimiento del mes no se vuelve a sumar al arrancar el siguiente', () => {
    // junio: 1000 de inicio + 17.50 de interés + 500 de aporte = 1517.50 de cierre.
    // julio tiene que arrancar en 1517.50, no en 1517.50 + 500.
    expect(revisarCadena([
      fila('2026-06', 1000, 1517.50),
      fila('2026-07', 1517.50, 1544.06),
    ])).toEqual([])
  })

  it('marca el corte con el mes, los dos saldos y la diferencia', () => {
    // El caso real de Elisa: julio cierra en 6521.13 y agosto arranca en 5603.17.
    const r = revisarCadena([
      fila('2026-07', 6423.73, 6521.13),
      fila('2026-08', 5603.17, 5700.57),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      instrumentoId: 'i1',
      mes: '2026-08',
      mesAnterior: '2026-07',
      saldoCierreAnterior: 6521.13,
      saldoInicio: 5603.17,
      diferencia: -917.96,
    })
  })

  it('la diferencia es positiva cuando el mes arranca con plata de más', () => {
    // El caso real de Sequeira: el aporte de 6007 se cuenta dos veces.
    const r = revisarCadena([
      fila('2026-07', 15893.41, 15893.41),
      fila('2026-08', 22109.01, 22390.17),
    ])
    expect(r[0].diferencia).toBe(6215.60)
  })

  it('deja pasar un centavo de redondeo', () => {
    expect(revisarCadena([
      fila('2026-06', 1000, 1017.50),
      fila('2026-07', 1017.51, 1035.32),
    ])).toEqual([])
  })

  it('revisa cada instrumento por separado y no los cruza', () => {
    const r = revisarCadena([
      fila('2026-06', 1000, 1017.50, 'i1'),
      fila('2026-07', 1017.50, 1035.31, 'i1'),
      fila('2026-06', 5000, 5087.50, 'i2'),
      fila('2026-07', 4000, 4070.00, 'i2'),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].instrumentoId).toBe('i2')
  })

  it('ordena por mes aunque las filas vengan desordenadas', () => {
    const r = revisarCadena([
      fila('2026-08', 5603.17, 5700.57),
      fila('2026-05', 5505.77, 5613.30),
      fila('2026-07', 6423.73, 6521.13),
      fila('2026-06', 5613.30, 6423.73),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].mes).toBe('2026-08')
  })

  it('acepta los números como texto, que es como vienen de la base', () => {
    const r = revisarCadena([
      { instrumento_id: 'i1', mes: '2026-06', saldo_inicio: '1000.00', saldo_cierre: '1017.50' },
      { instrumento_id: 'i1', mes: '2026-07', saldo_inicio: '1500.00', saldo_cierre: '1526.25' },
    ])
    expect(r[0].diferencia).toBe(482.50)
  })

  it('un instrumento con un solo mes no puede estar descuadrado', () => {
    expect(revisarCadena([fila('2026-09', 5000, 5066.76)])).toEqual([])
  })
})

describe('capitalAlRenovar', () => {
  it('toma el saldo del último mes cerrado, no la suma de los intereses', () => {
    // Blesio INV-002: capital_inicial 6.713.274,70 ya contiene mayo y los 2 días de junio.
    // El método viejo sumaba mayo (241.215,42) y junio (25.785,10) otra vez → 6.980.275,22.
    expect(capitalAlRenovar([
      { mes: '2026-05', saldo_cierre: 6687489.60 },
      { mes: '2026-06', saldo_cierre: 6713274.70 },
    ])).toEqual({ mes: '2026-06', capital: 6713274.70 })
  })

  it('el último es el mes más alto, no el último de la lista', () => {
    expect(capitalAlRenovar([
      { mes: '2026-07', saldo_cierre: 15893.41 },
      { mes: '2026-05', saldo_cierre: 9791.44 },
      { mes: '2026-06', saldo_cierre: 9841.29 },
    ])).toEqual({ mes: '2026-07', capital: 15893.41 })
  })

  it('cruza el año sin desordenarse', () => {
    expect(capitalAlRenovar([
      { mes: '2026-12', saldo_cierre: 100 },
      { mes: '2027-01', saldo_cierre: 200 },
    ])?.mes).toBe('2027-01')
  })

  it('devuelve null cuando no hay ningún mes cerrado', () => {
    expect(capitalAlRenovar([])).toBeNull()
  })

  it('deja pasar el saldo en cero o negativo para que lo frene quien llama', () => {
    // Fredy INV-003 habría quedado en -1.536,86 con el método viejo. Acá el saldo real es
    // 0 (devuelto): la función lo informa y renovarInstrumento es quien rechaza.
    expect(capitalAlRenovar([{ mes: '2026-08', saldo_cierre: 0 }])).toEqual({ mes: '2026-08', capital: 0 })
  })

  it('acepta el saldo como texto, que es como viene de la base', () => {
    expect(capitalAlRenovar([{ mes: '2026-08', saldo_cierre: '49320000.00' }])?.capital).toBe(49320000)
  })
})
