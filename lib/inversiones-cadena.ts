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

/**
 * --- El mes partido ---
 *
 * Cuando un plazo vence a mitad de mes, ese mes le pertenece a DOS plazos: los días de
 * antes del vencimiento son del plazo viejo y los de después, del nuevo. Pero la tabla
 * tiene una sola fila por mes (`UNIQUE(instrumento_id, mes)`), así que los dos pedazos
 * tienen que convivir adentro de la misma fila.
 *
 * Y el orden está forzado: renovar exige que no haya períodos abiertos, así que el mes
 * se cierra CUANDO EL PLAZO NUEVO TODAVÍA NO EXISTE. La fila queda con el pedazo viejo
 * nada más, y el pedazo nuevo llega tarde, contra un mes ya cerrado.
 *
 * `int_inicio_prorrateado` es el casillero donde se anota cuánto de la fila corresponde
 * al plazo que arrancó adentro del mes. Teniéndolo, reconciliar es una resta y una suma:
 * se saca lo que estaba anotado y se pone lo que corresponde ahora. Correrlo dos veces
 * da lo mismo, porque la segunda vez lo anotado ya coincide.
 *
 * Caso real (Fredy Arévalo INV-003, agosto 2026): del 1 al 26 el plazo viejo devengó
 * $47.828,57 al 3,2%; del 27 al 31 el plazo nuevo devengó $6.044,67 al 3%. Se cerró el
 * 28/08 12:21 con sólo el primer pedazo y se renovó minutos después: los $6.044,67 se
 * calcularon y se descartaron.
 *
 * ⚠️ LÍMITE CONOCIDO: la fila guarda UN pedazo nuevo. Si un mismo mes recibiera dos
 * renovaciones, la segunda pisaría a la primera. No pasa en la vida real (no se renueva
 * dos veces en un mes) y si pasara, `revisarCadena` lo delata en el mes siguiente.
 */

export interface FilaMesPartido {
  mes: string
  saldo_inicio: number | string | null
  interes_devengado: number | string | null
  int_inicio_prorrateado: number | string | null
  movimiento: number | string | null
  cerrado: boolean
}

export interface AjusteMesPartido {
  mes: string
  /** Lo que la fila tenía anotado como pedazo del plazo nuevo. */
  pedazoAntes: number
  /** Lo que le corresponde al plazo nuevo según el motor. */
  pedazoDespues: number
  interesAntes: number
  interesDespues: number
  saldoCierreDespues: number
  /** Positiva: el mes suma interés que se había perdido. */
  diferencia: number
  /** Qué pasó con el gasto financiero de ese mes. Lo completa quien escribe en la base. */
  gasto?: { ok: boolean; detalle: string; montoArs?: number }
}

/**
 * Qué hay que corregirle al mes en que arranca el plazo nuevo, cuando ese mes ya está
 * cerrado. Devuelve null cuando no hay nada que hacer, que es la enorme mayoría de las
 * veces: mes abierto (se reescribe entero igual), plazo que arranca un día 1 (no parte
 * ningún mes), o lo anotado ya coincide con lo calculado.
 *
 * NO toca ningún otro mes cerrado: el resto de la fila —el pedazo del plazo viejo, el
 * movimiento, el saldo de arranque— se respeta tal cual está.
 */
export function ajusteDelMesPartido(args: {
  /** Arranque del plazo VIGENTE (el que se acaba de renovar). */
  fechaInicioCiclo: string
  /** La fila guardada de ese mes, si existe. */
  guardado: FilaMesPartido | undefined | null
  /** Interés que el motor le asigna a ese mes por el plazo nuevo. */
  pedazoDelPlazoNuevo: number
}): AjusteMesPartido | null {
  const { fechaInicioCiclo, guardado, pedazoDelPlazoNuevo } = args
  if (!guardado || !guardado.cerrado) return null

  // Un plazo que arranca un día 1 no parte ningún mes: el mes entero es del plazo nuevo.
  if (fechaInicioCiclo.substring(8) === '01') return null
  // Sólo el mes en que arranca el plazo. Los demás meses cerrados no se tocan nunca.
  if (guardado.mes !== fechaInicioCiclo.substring(0, 7)) return null

  const pedazoAntes = round(num(guardado.int_inicio_prorrateado))
  const pedazoDespues = round(pedazoDelPlazoNuevo)
  const diferencia = round(pedazoDespues - pedazoAntes)
  if (Math.abs(diferencia) <= TOLERANCIA) return null

  const interesAntes = round(num(guardado.interes_devengado))
  const interesDespues = round(interesAntes + diferencia)
  // Una corrección que deja el mes con interés negativo no es una corrección: es un dato
  // roto. Mejor no escribir nada y que la cadena lo siga marcando.
  if (interesDespues < 0) return null

  return {
    mes: guardado.mes,
    pedazoAntes,
    pedazoDespues,
    interesAntes,
    interesDespues,
    saldoCierreDespues: round(num(guardado.saldo_inicio) + interesDespues + num(guardado.movimiento)),
    diferencia,
  }
}
