/**
 * Revisión de la cadena de saldos de un instrumento.
 *
 * La regla es una sola: el saldo con el que ARRANCA un mes tiene que ser igual al
 * saldo con el que CERRÓ el mes anterior. El movimiento del mes se aplica dentro de
 * su propio período — ya está adentro de su saldo de cierre — así que no hay que
 * volver a sumarlo al arrancar el siguiente.
 *
 * Cuando la cadena se corta, el saldo del inversor cambia sin que ningún movimiento
 * lo explique, y ese saldo es el que termina en el pasivo del cierre de mes. Hoy eso
 * no se ve por ningún lado: por eso esta revisión corre sola sobre todos los meses.
 */

export interface FilaCadena {
  instrumento_id: string
  mes: string // YYYY-MM
  saldo_inicio: number | string | null
  saldo_cierre: number | string | null
}

export interface DescuadreCadena {
  instrumentoId: string
  /** Mes que arranca con un saldo que no es el del cierre anterior. */
  mes: string
  mesAnterior: string
  saldoCierreAnterior: number
  saldoInicio: number
  /** Positiva: el mes arranca con MÁS plata de la que cerró el anterior. */
  diferencia: number
}

/** Un centavo de tolerancia: por debajo de eso es redondeo, no un descuadre. */
const TOLERANCIA = 0.01

const num = (v: number | string | null) => (v === null ? 0 : Number(v))
const round = (n: number) => Math.round(n * 100) / 100

/**
 * Recorre los períodos de cada instrumento en orden y devuelve los cortes de cadena.
 * Acepta las filas de cualquier instrumento mezcladas y en cualquier orden.
 */
export function revisarCadena(filas: FilaCadena[]): DescuadreCadena[] {
  const porInstrumento = new Map<string, FilaCadena[]>()
  for (const f of filas) {
    porInstrumento.set(f.instrumento_id, [...(porInstrumento.get(f.instrumento_id) ?? []), f])
  }

  const out: DescuadreCadena[] = []
  for (const [instrumentoId, lista] of porInstrumento) {
    const ordenados = [...lista].sort((a, b) => a.mes.localeCompare(b.mes))
    for (let i = 1; i < ordenados.length; i++) {
      const previo = ordenados[i - 1]
      const actual = ordenados[i]
      const diferencia = round(num(actual.saldo_inicio) - num(previo.saldo_cierre))
      if (Math.abs(diferencia) <= TOLERANCIA) continue
      out.push({
        instrumentoId,
        mes: actual.mes,
        mesAnterior: previo.mes,
        saldoCierreAnterior: round(num(previo.saldo_cierre)),
        saldoInicio: round(num(actual.saldo_inicio)),
        diferencia,
      })
    }
  }
  return out.sort((a, b) => a.mes.localeCompare(b.mes) || a.instrumentoId.localeCompare(b.instrumentoId))
}
