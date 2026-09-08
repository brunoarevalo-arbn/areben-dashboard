/**
 * Reglas de saldos de los instrumentos de inversión: cuándo la cadena se corta, con qué
 * capital arranca un ciclo nuevo y qué instrumentos ya existían al cierre de un mes.
 *
 * Las tres comparten una causa: `capital_inicial` y `fecha_inicio` describen el CICLO
 * VIGENTE, no el instrumento, y se pisan en cada renovación. Todo lo que necesite el
 * estado real a una fecha tiene que salir de los períodos, no de esos dos campos.
 *
 * --- La cadena ---
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

/**
 * El capital con el que arranca un ciclo nuevo al renovar: el saldo con el que cerró el
 * último mes cerrado.
 *
 * Capitalice o no el instrumento, `saldo_cierre` ya arrastra el interés acumulado como
 * deuda con el inversor, así que el último cierre ES el saldo. No hay que reconstruirlo
 * sumando intereses sobre `capital_inicial`: desde la segunda renovación `capital_inicial`
 * ya es el saldo de arranque del ciclo vigente y esa suma cuenta dos veces los períodos
 * que ya tiene adentro.
 *
 * Devuelve null si no hay ningún período cerrado (no hay de dónde sacar el saldo).
 */
export function capitalAlRenovar(
  periodosCerrados: { mes: string; saldo_cierre: number | string | null }[],
): { mes: string; capital: number } | null {
  let ultimo: { mes: string; saldo_cierre: number | string | null } | null = null
  for (const p of periodosCerrados) {
    if (!ultimo || p.mes > ultimo.mes) ultimo = p
  }
  if (!ultimo) return null
  return { mes: ultimo.mes, capital: round(num(ultimo.saldo_cierre)) }
}

/**
 * Qué instrumentos ya existían al cierre de un mes.
 *
 * La prueba de que existía es tener un período de ese mes o de uno anterior. NO sirve
 * `fecha_inicio`: esa es la fecha del CICLO VIGENTE y cada renovación la empuja hacia
 * adelante, así que un instrumento renovado en septiembre "no existía" en agosto aunque
 * tuviera períodos cerrados desde junio.
 *
 * `fecha_inicio <= finDelMes` se suma como red para el que arrancó dentro del mes y
 * todavía no tiene período generado: sumarla nunca deja afuera a nadie, sólo agrega.
 */
export function existianAlCierre<T extends { id: string; fecha_inicio?: string | null }>(
  instrumentos: T[],
  periodosHastaElMes: { instrumento_id: string }[],
  finDelMes: string, // YYYY-MM-DD
): T[] {
  const conPeriodo = new Set(periodosHastaElMes.map((p) => p.instrumento_id))
  return instrumentos.filter(
    (i) => conPeriodo.has(i.id) || (!!i.fecha_inicio && i.fecha_inicio <= finDelMes),
  )
}
