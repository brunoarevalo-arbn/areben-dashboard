/**
 * Lógica de cálculo de períodos de inversión.
 * Soporta capitalizable / no capitalizable, prorrateo en mes inicial/final
 * y múltiples tramos de tasa dentro del mismo mes.
 */

export interface SegmentoCalc {
  desde: string // YYYY-MM-DD
  hasta: string // YYYY-MM-DD
  tasa: number
  dias: number
  interes: number
}

export interface PeriodoCalc {
  mes: string
  saldo_inicio: number
  interes_devengado: number
  int_inicio_prorrateado: number
  int_fin_prorrateado: number
  movimiento: number
  saldo_cierre: number
  tasa_aplicada: number // tasa efectiva (weighted avg si hubo cambios)
  segmentos: SegmentoCalc[]
}

export interface TramoEntrada {
  fecha_desde: string // YYYY-MM-DD
  tasa_mensual: number
}

/**
 * Un movimiento de plata dentro del instrumento: un retiro o un ingreso.
 * Puede haber varios en el mismo mes, cada uno con su día.
 */
export interface MovimientoCalc {
  mes: string // YYYY-MM al que se imputa
  /**
   * Día en que se movió la plata (YYYY-MM-DD).
   * Con la fecha, lo que se retira cobra interés solo por los días que estuvo.
   * Sin fecha, el movimiento no ajusta el interés (así ningún número viejo se mueve).
   */
  fecha?: string | null
  monto: number // con signo: negativo sale
}

interface CalcArgs {
  capitalInicial: number
  fechaInicio: string
  fechaFin?: string | null
  capitalizable: boolean
  hasta: string // YYYY-MM
  movimientos?: MovimientoCalc[]
  /** @deprecated Entrada vieja de un movimiento por mes. Usar `movimientos`. */
  movimientosByMes?: Record<string, number>
  /** @deprecated Entrada vieja de un movimiento por mes. Usar `movimientos`. */
  fechasMovimiento?: Record<string, string | null>
  tramos: TramoEntrada[] // ordenados ASC por fecha_desde
  plazoDias?: number | null // plazo contractual del ciclo (para el modelo plano)
}

/**
 * Deja la entrada en una sola forma: la lista de movimientos. Acepta todavía el par
 * `movimientosByMes` / `fechasMovimiento` (un movimiento por mes) para no romper a los
 * llamadores viejos; con un solo movimiento por mes las dos formas dan lo mismo.
 */
function normalizarMovs(args: CalcArgs): MovimientoCalc[] {
  if (args.movimientos) return args.movimientos.filter((m) => m.monto !== 0)
  const out: MovimientoCalc[] = []
  for (const [mes, monto] of Object.entries(args.movimientosByMes ?? {})) {
    if (!monto) continue
    out.push({ mes, fecha: args.fechasMovimiento?.[mes] ?? null, monto })
  }
  return out
}

/** Cuánta plata neta se movió en cada mes. */
function totalesPorMes(movs: MovimientoCalc[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of movs) out.set(m.mes, (out.get(m.mes) ?? 0) + m.monto)
  return out
}

const round = (n: number) => Math.round(n * 100) / 100

function diasEnMes(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mesKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function nextMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1]
}

/**
 * El vencimiento de un plazo de N MESES: 14-ago + 3 meses = 14-nov, no 14-ago + 90 días.
 * Un plazo se pacta en meses, y un mes es un mes tenga 28, 30 o 31 días. Si el día no
 * existe en el mes destino (un 31 que cae en un mes de 30), cae en el último día.
 * Ojo: el vencimiento NO devenga — es el día del pago y el arranque del ciclo siguiente.
 */
export function sumarMeses(fechaISO: string, meses: number): string {
  const d = parseDate(fechaISO)
  const dia = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + meses, 1)
  const ultimoDia = diasEnMes(target.getFullYear(), target.getMonth() + 1)
  target.setDate(Math.min(dia, ultimoDia))
  return fmtDate(target)
}

/** Suma días de calendario. Solo para plazos pactados en días, no en meses. */
export function sumarDias(fechaISO: string, dias: number): string {
  const d = parseDate(fechaISO)
  d.setDate(d.getDate() + dias)
  return fmtDate(d)
}

/** Días de calendario entre dos fechas (lo que se guarda como `plazo_dias`). */
export function diasEntre(desdeISO: string, hastaISO: string): number {
  return Math.round((parseDate(hastaISO).getTime() - parseDate(desdeISO).getTime()) / 86400000)
}

/**
 * Cuántos meses redondos hay entre dos fechas, o `null` si el vencimiento no cae en un
 * aniversario mensual del inicio (una fecha pactada a mano). Sirve para renovar un ciclo
 * por el mismo plazo que traía, sin que se corra dos días en cada vuelta.
 */
export function mesesEntre(desdeISO: string, hastaISO: string): number | null {
  if (hastaISO <= desdeISO) return null
  const a = parseDate(desdeISO), b = parseDate(hastaISO)
  const meses = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  for (const m of [meses, meses - 1, meses + 1]) {
    if (m > 0 && sumarMeses(desdeISO, m) === hastaISO) return m
  }
  return null
}

/**
 * Devuelve la tasa aplicable a una fecha dada según los tramos.
 * El tramo aplicable es el más reciente cuya fecha_desde sea ≤ fecha.
 */
function tasaEnFecha(tramos: TramoEntrada[], fecha: Date): number {
  const fechaStr = fmtDate(fecha)
  let tasa = tramos[0]?.tasa_mensual ?? 0
  for (const t of tramos) {
    if (t.fecha_desde <= fechaStr) tasa = t.tasa_mensual
    else break
  }
  return tasa
}

/**
 * Calcula el interés de un mes para un instrumento, considerando
 * cambios de tasa intra-mes y prorrateo del mes inicial / final.
 */
function calcularInteresMes(
  saldoInicio: number,
  mes: string, // YYYY-MM
  fechaInicio: Date,
  fechaFin: Date | null,
  tramos: TramoEntrada[],
): { interes: number; intInicio: number; intFin: number; segmentos: SegmentoCalc[]; tasaPromedio: number } {
  const [year, month] = mes.split('-').map(Number)
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0)
  const dim = diasEnMes(year, month)

  // Rango activo del instrumento dentro del mes
  const activoStart = fechaInicio > monthStart ? fechaInicio : monthStart
  const activoEnd = fechaFin && fechaFin < monthEnd ? fechaFin : monthEnd

  if (activoStart > activoEnd) {
    return { interes: 0, intInicio: 0, intFin: 0, segmentos: [], tasaPromedio: 0 }
  }

  // Identificar puntos de cambio de tasa dentro del rango activo
  const cambios: Date[] = []
  for (const t of tramos) {
    const tDate = parseDate(t.fecha_desde)
    if (tDate > activoStart && tDate <= activoEnd) {
      cambios.push(tDate)
    }
  }

  // Generar segmentos
  const segmentos: SegmentoCalc[] = []
  let segStart = new Date(activoStart)

  for (const c of cambios) {
    const segEnd = new Date(c.getTime() - 86400000) // día anterior
    if (segEnd >= segStart) {
      const tasa = tasaEnFecha(tramos, segStart)
      const dias = Math.round((segEnd.getTime() - segStart.getTime()) / 86400000) + 1
      const interes = saldoInicio * tasa * (dias / dim)
      segmentos.push({
        desde: fmtDate(segStart),
        hasta: fmtDate(segEnd),
        tasa,
        dias,
        interes: round(interes),
      })
    }
    segStart = new Date(c)
  }

  // Último segmento
  const tasaUlt = tasaEnFecha(tramos, segStart)
  const diasUlt = Math.round((activoEnd.getTime() - segStart.getTime()) / 86400000) + 1
  const interesUlt = saldoInicio * tasaUlt * (diasUlt / dim)
  segmentos.push({
    desde: fmtDate(segStart),
    hasta: fmtDate(activoEnd),
    tasa: tasaUlt,
    dias: diasUlt,
    interes: round(interesUlt),
  })

  const interes = segmentos.reduce((s, x) => s + x.interes, 0)
  const totalDias = segmentos.reduce((s, x) => s + x.dias, 0)

  // Determinar prorrateo (mes inicial / mes final)
  let intInicio = 0
  let intFin = 0
  if (fechaInicio.getFullYear() === year && fechaInicio.getMonth() + 1 === month && fechaInicio > monthStart) {
    intInicio = interes
  }
  if (fechaFin && fechaFin.getFullYear() === year && fechaFin.getMonth() + 1 === month && fechaFin < monthEnd) {
    intFin = interes
  }

  // Tasa promedio ponderada por días
  const tasaPromedio = totalDias > 0
    ? segmentos.reduce((s, x) => s + x.tasa * x.dias, 0) / totalDias
    : 0

  return { interes: round(interes), intInicio: round(intInicio), intFin: round(intFin), segmentos, tasaPromedio }
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

// Suma meses de calendario manteniendo el día (ajusta al último día si no existe, ej. 31).
function addMonthsDate(d: Date, meses: number): Date {
  const dia = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + meses, 1)
  const ultimoDia = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(dia, ultimoDia))
  return target
}

/** Movimientos que tienen fecha conocida y caen dentro del ciclo [start, fin). */
function fechados(
  movs: MovimientoCalc[],
  start: Date,
  fin: Date,
): { fecha: Date; monto: number }[] {
  const out: { fecha: Date; monto: number }[] = []
  for (const m of movs) {
    if (!m.fecha || !m.monto) continue
    const fecha = parseDate(m.fecha)
    if (fecha < start || fecha >= fin) continue
    out.push({ fecha, monto: m.monto })
  }
  return out.sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
}

/** Los movimientos con fecha que caen dentro de un mes de calendario. */
function conFechaEnMes(movs: MovimientoCalc[], mes: string): { fecha: Date; monto: number }[] {
  const [year, month] = mes.split('-').map(Number)
  const out: { fecha: Date; monto: number }[] = []
  for (const m of movs) {
    if (!m.fecha || !m.monto) continue
    const fecha = parseDate(m.fecha)
    if (fecha.getFullYear() !== year || fecha.getMonth() + 1 !== month) continue
    out.push({ fecha, monto: m.monto })
  }
  return out.sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
}

/** Días que un movimiento hecho en `fecha` queda vigente hasta el fin del ciclo. */
function diasVigente(fecha: Date, start: Date, fin: Date): number {
  const desde = fecha > start ? fecha : start
  return Math.max(0, daysBetween(desde, fin))
}

/** Suma de (capital vigente × 1 día) sobre un tramo de días. */
function capitalDias(
  desde: Date,
  dias: number,
  capitalInicial: number,
  movs: { fecha: Date; monto: number }[],
): number {
  let total = 0
  for (let t = 0; t < dias; t++) {
    const dia = new Date(desde.getTime() + t * 86400000)
    let capital = capitalInicial
    for (const m of movs) if (m.fecha <= dia) capital += m.monto
    total += capital
  }
  return total
}

export function generarPeriodos(args: CalcArgs): PeriodoCalc[] {
  if (args.tramos.length === 0) return []
  const start = parseDate(args.fechaInicio)
  const fin = args.fechaFin ? parseDate(args.fechaFin) : null
  const movs = normalizarMovs(args)
  const totales = totalesPorMes(movs)

  // PF NO capitalizables con vencimiento → modelo PLANO (1,75% por mes completo,
  // repartido proporcional por días). Capitalizables o sin vencimiento → compuesto histórico.
  if (!args.capitalizable && fin) {
    return generarPeriodosPlano(args, start, fin, movs, totales)
  }
  return generarPeriodosCompuesto(args, start, fin, movs, totales)
}

/**
 * MODELO PLANO — PF no capitalizables con vencimiento.
 * El ciclo [fechaInicio, fechaFin) rinde interés PLANO = capital × tasa × mesesDelPlazo.
 * Ese total se reparte entre los meses de calendario PROPORCIONAL a los días activos.
 * El día del vencimiento (fechaFin) NO cuenta: arranca el ciclo siguiente (fin exclusivo).
 * Si el ciclo se corta antes del plazo (retiro anticipado), se prorratea real (días/30).
 */
function generarPeriodosPlano(
  args: CalcArgs,
  start: Date,
  fin: Date,
  movs: MovimientoCalc[],
  totales: Map<string, number>,
): PeriodoCalc[] {
  const { capitalInicial, hasta, tramos, plazoDias } = args
  const [yHasta, mHasta] = hasta.split('-').map(Number)

  const diasCiclo = daysBetween(start, fin) // fin exclusivo
  if (diasCiclo <= 0) return []

  const diasPlan = plazoDias && plazoDias > 0 ? plazoDias : diasCiclo
  const mesesPlan = Math.max(1, Math.round(diasPlan / 30))
  // ¿Se cumplió el plazo o se cortó antes (retiro anticipado)?
  // Se compara por FECHA de vencimiento esperada (inicio + mesesPlan), NO por días:
  // así febrero (mes corto de 28 días) sigue contando como un mes completo.
  const vencimientoEsperado = addMonthsDate(start, mesesPlan)
  const completo = fin.getTime() >= vencimientoEsperado.getTime() - 86400000 // 1 día de tolerancia

  // Tasa promedio ponderada por día del ciclo (soporta tramos de tasa)
  let sumaTasa = 0
  for (let t = 0; t < diasCiclo; t++) {
    sumaTasa += tasaEnFecha(tramos, new Date(start.getTime() + t * 86400000))
  }
  const tasaProm = sumaTasa / diasCiclo

  // Movimientos con fecha conocida dentro del ciclo. Los que no tienen fecha no ajustan
  // el interés: mueven el saldo nomás, como antes de la migración 069.
  const movsConFecha = fechados(movs, start, fin)

  // Cuánto rinde el ciclo, medido en "meses" de la tasa. Si se cortó antes del plazo
  // (retiro anticipado), se prorratea real por los días que corrió.
  const mesesEquivalentes = completo ? mesesPlan : diasCiclo / 30

  // Lo que se retira cobra interés por los días que estuvo y deja de cobrar desde que
  // salió: cada movimiento rinde en proporción a los días que quedó vigente. Con capital
  // quieto esto es exactamente el plano de siempre.
  const capitalPonderado = capitalInicial + movsConFecha.reduce(
    (s, m) => s + m.monto * (diasVigente(m.fecha, start, fin) / diasCiclo), 0,
  )
  const interesTotalCiclo = round(capitalPonderado * tasaProm * mesesEquivalentes)

  // Meses de calendario que toca el ciclo, con sus días activos.
  // Se recorre SIEMPRE el ciclo entero, aunque `hasta` corte antes: el interés del ciclo
  // se reparte entre todos sus meses, y recién al final se devuelven los que entran en
  // `hasta`. Si se repartiera solo entre los meses generados, el mes en curso se llevaría
  // el interés de los meses que todavía no existen (un ciclo de 3 meses recién empezado
  // cargaba los 3 meses de interés en el primero).
  const filas: { mes: string; dias: number; activoStart: Date; primeroDelMes: boolean; ultimoDelCiclo: boolean }[] = []
  let cy = start.getFullYear()
  let cm = start.getMonth() + 1
  for (;;) {
    const monthStart = new Date(cy, cm - 1, 1)
    const monthStartNext = new Date(cy, cm, 1)
    const activoStart = start > monthStart ? start : monthStart
    const activoEndExcl = fin < monthStartNext ? fin : monthStartNext
    const dias = Math.max(0, daysBetween(activoStart, activoEndExcl))
    if (dias > 0) {
      filas.push({
        mes: mesKey(cy, cm),
        dias,
        activoStart,
        primeroDelMes: activoStart.getTime() === monthStart.getTime(),
        ultimoDelCiclo: activoEndExcl.getTime() === fin.getTime(),
      })
    }
    if (monthStartNext >= fin) break
    ;[cy, cm] = nextMonth(cy, cm)
  }

  // Reparto entre meses por "capital × días": un mes en que el capital estuvo más alto
  // se lleva más interés. Sin movimientos, capital-día es proporcional a los días y el
  // reparto queda idéntico al de siempre.
  const pesos = filas.map((f) => capitalDias(f.activoStart, f.dias, capitalInicial, movsConFecha))
  const pesoTotal = pesos.reduce((a, b) => a + b, 0)
  const shares = pesoTotal > 0
    ? pesos.map((peso) => round(interesTotalCiclo * peso / pesoTotal))
    : filas.map((f) => round(interesTotalCiclo * f.dias / diasCiclo))
  if (shares.length > 0) {
    const suma = shares.reduce((a, b) => a + b, 0)
    shares[shares.length - 1] = round(shares[shares.length - 1] + (interesTotalCiclo - suma))
  }

  // Aunque no capitalice (interés simple sobre el capital), el interés se ACUMULA al
  // saldo como deuda hasta que el inversor retira → el saldo cierre crece mes a mes y
  // el saldo inicio del mes siguiente arrastra ese acumulado.
  const mesTope = mesKey(yHasta, mHasta)
  let saldoAcum = capitalInicial
  return filas.map((f, idx) => {
    let sumaTasaMes = 0
    for (let t = 0; t < f.dias; t++) sumaTasaMes += tasaEnFecha(tramos, new Date(f.activoStart.getTime() + t * 86400000))
    const tasaMes = f.dias > 0 ? sumaTasaMes / f.dias : 0
    const movimiento = totales.get(f.mes) ?? 0
    const saldoInicio = saldoAcum
    const saldoCierre = round(saldoInicio + shares[idx] + movimiento)
    saldoAcum = saldoCierre
    return {
      mes: f.mes,
      saldo_inicio: round(saldoInicio),
      interes_devengado: shares[idx],
      int_inicio_prorrateado: idx === 0 && !f.primeroDelMes ? shares[idx] : 0,
      int_fin_prorrateado: idx === filas.length - 1 && f.ultimoDelCiclo ? shares[idx] : 0,
      movimiento: round(movimiento),
      saldo_cierre: saldoCierre,
      tasa_aplicada: round(tasaMes * 1000000) / 1000000,
      segmentos: [],
    }
  }).filter((p) => p.mes <= mesTope)
}

/**
 * Cuánto interés suman (o restan) los movimientos del mes por los días que quedaron
 * vigentes dentro de él. Un retiro a mitad de mes resta: esa plata dejó de trabajar.
 * Se suma sin redondear en el medio; el redondeo va una sola vez sobre el total.
 */
function ajusteIntraMes(
  movsDelMes: { fecha: Date; monto: number }[],
  mes: string,
  start: Date,
  fin: Date | null,
  tasa: number,
): number {
  if (!tasa || movsDelMes.length === 0) return 0
  const [year, month] = mes.split('-').map(Number)
  const monthEnd = new Date(year, month, 0)
  const dim = monthEnd.getDate()
  const activoEnd = fin && fin < monthEnd ? fin : monthEnd

  let total = 0
  for (const m of movsDelMes) {
    const desde = m.fecha > start ? m.fecha : start
    if (desde > activoEnd) continue
    const diasVigentes = Math.round((activoEnd.getTime() - desde.getTime()) / 86400000) + 1
    total += m.monto * tasa * (diasVigentes / dim)
  }
  return total
}

/**
 * MODELO COMPUESTO (histórico) — capitalizables o instrumentos sin vencimiento.
 * Interés por mes de calendario, prorrateado por días, con capitalización mensual.
 */
function generarPeriodosCompuesto(
  args: CalcArgs,
  start: Date,
  fin: Date | null,
  movs: MovimientoCalc[],
  totales: Map<string, number>,
): PeriodoCalc[] {
  const { capitalInicial, capitalizable, hasta, tramos } = args
  const [yHasta, mHasta] = hasta.split('-').map(Number)

  const periodos: PeriodoCalc[] = []
  let saldoActual = capitalInicial

  let cy = start.getFullYear()
  let cm = start.getMonth() + 1

  while (cy < yHasta || (cy === yHasta && cm <= mHasta)) {
    const mes = mesKey(cy, cm)
    // El saldo arrastra el acumulado en ambos casos. La diferencia es la BASE del
    // interés: capitalizable = compuesto (sobre el saldo que crece); no capitalizable
    // = simple (siempre sobre el capital original), pero igual se acumula al saldo.
    const saldoInicio = saldoActual
    const baseInteres = capitalizable ? saldoInicio : capitalInicial

    const calc = calcularInteresMes(baseInteres, mes, start, fin, tramos)

    const movimiento = totales.get(mes) ?? 0
    // Si se sabe qué día se movió la plata, lo movido rinde solo por los días que
    // estuvo dentro de este mes. Sin fecha, el interés del mes no se toca.
    const interesMes = round(calc.interes + ajusteIntraMes(conFechaEnMes(movs, mes), mes, start, fin, calc.tasaPromedio))
    const saldoCierre = saldoInicio + interesMes + movimiento

    periodos.push({
      mes,
      saldo_inicio: round(saldoInicio),
      interes_devengado: interesMes,
      int_inicio_prorrateado: round(calc.intInicio),
      int_fin_prorrateado: round(calc.intFin),
      movimiento: round(movimiento),
      saldo_cierre: round(saldoCierre),
      tasa_aplicada: round(calc.tasaPromedio * 1000000) / 1000000,
      segmentos: calc.segmentos,
    })

    saldoActual = saldoCierre
    if (fin && cy === fin.getFullYear() && cm === fin.getMonth() + 1) break

    ;[cy, cm] = nextMonth(cy, cm)
  }

  return periodos
}

// ────────────────────────────────────────────────────────────
// Devolución y cierre del instrumento
// ────────────────────────────────────────────────────────────

export interface FilaPeriodo {
  mes: string // YYYY-MM
  saldo_inicio: number
  interes_devengado: number
  movimiento: number
  saldo_cierre: number
  cerrado: boolean
}

export interface PlanDevolucion {
  /** Filas finales del instrumento, ordenadas por mes. Las cerradas no se tocan. */
  filas: FilaPeriodo[]
  /** Lo que hay que pagarle al inversor: capital pendiente + intereses del ciclo. */
  totalADevolver: number
  /** Intereses del ciclo que todavía no se le habían pagado. */
  interesesCiclo: number
  /** Capital pendiente al momento de la devolución (sin intereses). */
  capitalPendiente: number
  /**
   * Ajuste imputado al último mes abierto para que el total del ciclo cierre exacto.
   * Aparece cuando meses ya cerrados devengaron con otro plazo (ej. retiro anticipado).
   */
  ajusteUltimoMes: number
  /**
   * Movimientos de meses cerrados que quedaron fuera del cálculo por ser del ciclo
   * anterior. Se muestran para que se pueda revisar si el capital arranca bien.
   */
  movimientosDelCicloAnterior: { mes: string; monto: number }[]
}

/**
 * Arma la devolución total de un instrumento: deja cada mes encadenado con el
 * anterior y saca el saldo a cero en el mes en que se paga.
 *
 * Reglas:
 * - **Solo se mira el ciclo vigente**, del `mesInicioCiclo` en adelante. Los meses
 *   anteriores son de ciclos ya renovados: sus intereses ya se capitalizaron dentro
 *   del capital actual, así que contarlos otra vez sería duplicar.
 * - **Lo que cobra el inversor son los intereses del ciclo** (`periodosGenerados`,
 *   recalculado con la fecha de corte real) más el capital que le quede.
 * - **Los meses cerrados no se reescriben.** Son foto contable ya publicada; si
 *   devengaron con el plazo viejo, la diferencia se imputa al último mes abierto para
 *   que el total que cobra el inversor sea el correcto.
 * - El pago se imputa en `mesDevolucion`, que puede ser un mes POSTERIOR al último con
 *   interés: un plazo que vence el 1/9 devenga hasta el 31/8 y se paga el 1/9. En ese
 *   caso se abre una fila de septiembre con interés 0 — así al 31/8 la deuda sigue viva.
 */
export function planDevolucion(args: {
  /** Períodos del ciclo recalculados con la fecha de corte, en orden. */
  periodosGenerados: { mes: string; interes_devengado: number }[]
  /** Períodos como están hoy en la base, en orden. */
  periodosActuales: FilaPeriodo[]
  /** Capital con el que arrancó el ciclo vigente. */
  capitalInicial: number
  /** Día en que arrancó el ciclo vigente (YYYY-MM-DD). */
  fechaInicioCiclo: string
  /** Mes en que se le paga (YYYY-MM). */
  mesDevolucion: string
}): PlanDevolucion {
  const { periodosGenerados, periodosActuales, capitalInicial, fechaInicioCiclo, mesDevolucion } = args
  const mesInicioCiclo = fechaInicioCiclo.substring(0, 7)
  // Si el ciclo arrancó a mitad de mes, ese mes está partido entre el ciclo viejo y el
  // nuevo: lo que quedó cerrado ahí es del viejo y no cuenta como interés de este ciclo.
  const mesInicioPartido = !fechaInicioCiclo.endsWith('-01')

  const delCiclo = (mes: string) => mes >= mesInicioCiclo && mes <= mesDevolucion
  const interesGenerado = new Map(periodosGenerados.map((p) => [p.mes, round(p.interes_devengado)]))
  const actualesPorMes = new Map(periodosActuales.map((p) => [p.mes, p]))

  const meses = [...new Set([
    ...periodosGenerados.map((p) => p.mes),
    ...periodosActuales.map((p) => p.mes),
    mesDevolucion,
  ])].filter(delCiclo).sort()

  // Interés de cada mes. El mes en que arranca el ciclo puede venir cerrado con el
  // interés del ciclo ANTERIOR (una renovación a mitad de mes parte el mes en dos):
  // ahí manda el recalculado, y la diferencia la absorbe el último mes abierto.
  // Una fila CERRADA en el mes de inicio partido es del ciclo anterior: al renovar, su
  // interés y su movimiento ya se sumaron dentro de capital_inicial. Contarlos otra vez
  // sería duplicar.
  const esDelCicloAnterior = (mes: string) =>
    !!actualesPorMes.get(mes)?.cerrado && mes === mesInicioCiclo && mesInicioPartido

  const interesPorMes = new Map<string, number>()
  for (const mes of meses) {
    const actual = actualesPorMes.get(mes)
    const usarCerrado = actual?.cerrado && !esDelCicloAnterior(mes)
    interesPorMes.set(mes, usarCerrado ? round(actual.interes_devengado) : (interesGenerado.get(mes) ?? 0))
  }

  // Lo que cobra el inversor: los intereses del ciclo, sí o sí.
  const interesesCiclo = round(periodosGenerados.reduce((s, p) => s + p.interes_devengado, 0))

  // El último mes abierto ajusta para que la suma mensual dé ese total. Se prefiere el
  // último mes que devengó: si el pago cae en un mes que ya no devenga (vencimiento el
  // 1/9), meterle el ajuste ahí lo mostraría con un interés que no existe.
  const mesesAbiertos = meses.filter((m) => !actualesPorMes.get(m)?.cerrado)
  const conInteres = mesesAbiertos.filter((m) => (interesPorMes.get(m) ?? 0) !== 0)
  const ultimoAbierto = (conInteres.length ? conInteres : mesesAbiertos)[
    (conInteres.length ? conInteres : mesesAbiertos).length - 1
  ]
  let ajusteUltimoMes = 0
  if (ultimoAbierto) {
    const suma = meses.reduce((s, m) => s + (interesPorMes.get(m) ?? 0), 0)
    ajusteUltimoMes = round(interesesCiclo - suma)
    if (ajusteUltimoMes !== 0) {
      interesPorMes.set(ultimoAbierto, round((interesPorMes.get(ultimoAbierto) ?? 0) + ajusteUltimoMes))
    }
  }

  // Encadenar los saldos del ciclo desde el capital inicial
  const filas: FilaPeriodo[] = []
  let saldo = capitalInicial
  for (const mes of meses) {
    const actual = actualesPorMes.get(mes)
    const interes = interesPorMes.get(mes) ?? 0
    const movimiento = mes === mesDevolucion || esDelCicloAnterior(mes) ? 0 : round(actual?.movimiento ?? 0)
    const saldoCierre = round(saldo + interes + movimiento)
    filas.push({
      mes,
      saldo_inicio: round(saldo),
      interes_devengado: interes,
      movimiento,
      saldo_cierre: saldoCierre,
      cerrado: !!actual?.cerrado,
    })
    saldo = saldoCierre
  }

  // El mes del pago se lleva todo el saldo → queda en cero
  const filaPago = filas[filas.length - 1]
  const totalADevolver = round(filaPago.saldo_inicio + filaPago.interes_devengado)
  filaPago.movimiento = round(-totalADevolver)
  filaPago.saldo_cierre = 0

  const capitalPendiente = round(totalADevolver - interesesCiclo)

  const movimientosDelCicloAnterior = meses
    .filter((m) => esDelCicloAnterior(m) && round(actualesPorMes.get(m)?.movimiento ?? 0) !== 0)
    .map((m) => ({ mes: m, monto: round(actualesPorMes.get(m)!.movimiento) }))

  return { filas, totalADevolver, interesesCiclo, capitalPendiente, ajusteUltimoMes, movimientosDelCicloAnterior }
}

// ────────────────────────────────────────────────────────────
// Desglose de un mes en el que se movió plata (para el reporte del inversor)
// ────────────────────────────────────────────────────────────

export interface TramoMes {
  desde: string // YYYY-MM-DD
  hasta: string // YYYY-MM-DD
  dias: number
  /** Capital sobre el que rindió ese tramo. */
  base: number
  interes: number
}

/**
 * Parte el mes en tramos por cada día en que se movió plata, para que el inversor
 * pueda rehacer la cuenta: "hasta el 10 me rindió todo, desde el 11 me rinde lo que
 * quedó". El interés del mes se reparte entre los tramos en proporción a
 * capital × días, que es exactamente el criterio con el que se calculó — así el
 * desglose SIEMPRE suma el interés del mes, sea el modelo plano o el compuesto.
 */
export function desgloseDelMes(args: {
  mes: string // YYYY-MM
  saldoInicio: number
  interesMes: number
  /** Movimientos del mes que tienen día, en cualquier orden. */
  movimientos: { fecha: string; monto: number }[]
  fechaInicio: string
  fechaFin?: string | null
}): TramoMes[] {
  const conFecha = args.movimientos
    .filter((m) => m.fecha && m.monto)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (conFecha.length === 0 || !args.interesMes) return []

  const [year, month] = args.mes.split('-').map(Number)
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0)
  const instStart = parseDate(args.fechaInicio)
  const instEnd = args.fechaFin ? parseDate(args.fechaFin) : null

  const activoStart = instStart > monthStart ? instStart : monthStart
  const activoEnd = instEnd && instEnd < monthEnd ? instEnd : monthEnd
  if (activoStart > activoEnd) return []

  // Días en que cambia el capital, dentro del rango activo
  const cortes = conFecha
    .map((m) => parseDate(m.fecha))
    .filter((d) => d > activoStart && d <= activoEnd)
  if (cortes.length === 0) return []

  const tramos: { desde: Date; hasta: Date; dias: number; base: number }[] = []
  let segStart = new Date(activoStart)
  let base = args.saldoInicio
  // Lo que ya se movió antes del arranque del rango activo also cuenta
  for (const m of conFecha) if (parseDate(m.fecha) <= activoStart) base += m.monto

  for (const corte of cortes) {
    const segEnd = new Date(corte.getTime() - 86400000)
    if (segEnd >= segStart) {
      tramos.push({
        desde: new Date(segStart),
        hasta: segEnd,
        dias: daysBetween(segStart, segEnd) + 1,
        base,
      })
    }
    for (const m of conFecha) if (parseDate(m.fecha).getTime() === corte.getTime()) base += m.monto
    segStart = new Date(corte)
  }
  if (segStart <= activoEnd) {
    tramos.push({
      desde: new Date(segStart),
      hasta: new Date(activoEnd),
      dias: daysBetween(segStart, activoEnd) + 1,
      base,
    })
  }
  if (tramos.length < 2) return []

  // Repartir el interés del mes proporcional a capital × días
  const pesos = tramos.map((t) => t.base * t.dias)
  const pesoTotal = pesos.reduce((a, b) => a + b, 0)
  if (pesoTotal === 0) return []

  const out: TramoMes[] = tramos.map((t, i) => ({
    desde: fmtDate(t.desde),
    hasta: fmtDate(t.hasta),
    dias: t.dias,
    base: round(t.base),
    interes: round((args.interesMes * pesos[i]) / pesoTotal),
  }))
  // El último absorbe el redondeo para que la suma dé el interés del mes, exacto
  const suma = out.reduce((s, t) => s + t.interes, 0)
  out[out.length - 1].interes = round(out[out.length - 1].interes + (args.interesMes - suma))
  return out
}

/**
 * Tasa anual equivalente, según cómo capitalice el instrumento.
 * Capitalizable → interés compuesto mes a mes. Si no → tasa simple por 12.
 */
export function tasaAnualEquivalente(tasaMensual: number, capitalizable: boolean): number {
  return capitalizable ? Math.pow(1 + tasaMensual, 12) - 1 : tasaMensual * 12
}

/**
 * Calcula los segmentos de un único mes — útil para mostrar el desglose
 * en el reporte cuando hubo cambio de tasa intra-mes.
 */
export function segmentosDeMes(
  saldoInicio: number,
  mes: string,
  fechaInicio: string,
  fechaFin: string | null,
  tramos: TramoEntrada[],
): SegmentoCalc[] {
  const calc = calcularInteresMes(
    saldoInicio,
    mes,
    parseDate(fechaInicio),
    fechaFin ? parseDate(fechaFin) : null,
    tramos,
  )
  return calc.segmentos
}

export function getCurrentMonth(): string {
  const d = new Date()
  return mesKey(d.getFullYear(), d.getMonth() + 1)
}

/**
 * Formato de moneda específico para inversiones:
 * ARS → "$ 1.250.000,50"
 * USD → "U$S 10.506,25"
 */
export function formatMoneda(amount: number, moneda: 'USD' | 'ARS') {
  const num = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return moneda === 'USD' ? `U$S ${num}` : `$ ${num}`
}

// ============ ESTADO DE VENCIMIENTO ============

export type NivelVencimiento = 'vencido' | 'pronto' | 'plazo'

export interface EstadoVencimiento {
  dias: number | null // días hasta el vencimiento (negativo = ya venció)
  nivel: NivelVencimiento | null // null si no tiene fecha de vencimiento
  necesitaRenovar: boolean // true si ya venció o está por vencer
  label: string // texto corto listo para mostrar
  colorClass: string // clase de color de texto (Tailwind)
}

// Ventana en días para considerar que un instrumento está "por vencer".
export const DIAS_POR_VENCER = 7

/**
 * Estado del vencimiento de un instrumento a partir de su fecha_fin (YYYY-MM-DD).
 * - 'vencido' → la fecha ya pasó (rojo) → hay que renovar o retirar
 * - 'pronto'  → vence dentro de los próximos DIAS_POR_VENCER días (ámbar)
 * - 'plazo'   → todavía falta bastante (atenuado) → solo se cierra el mes
 */
export function estadoVencimiento(
  fechaFin: string | null | undefined,
  hoy = new Date(),
): EstadoVencimiento {
  if (!fechaFin) {
    return { dias: null, nivel: null, necesitaRenovar: false, label: 'Sin vencimiento', colorClass: 'text-fg-muted' }
  }
  const finMs = new Date(`${fechaFin}T00:00:00`).getTime()
  const hoyMs = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()
  const dias = Math.ceil((finMs - hoyMs) / 86_400_000)

  if (dias < 0) {
    const n = Math.abs(dias)
    return { dias, nivel: 'vencido', necesitaRenovar: true, label: `Vencido hace ${n} día${n === 1 ? '' : 's'}`, colorClass: 'text-red-700 font-medium' }
  }
  if (dias <= DIAS_POR_VENCER) {
    return { dias, nivel: 'pronto', necesitaRenovar: true, label: dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias === 1 ? '' : 's'}`, colorClass: 'text-amber-700 font-medium' }
  }
  return { dias, nivel: 'plazo', necesitaRenovar: false, label: `Vence en ${dias} días`, colorClass: 'text-fg-muted' }
}

// ============================================================
// ¿Qué instrumentos le corresponden a un mes?
// ============================================================

/**
 * Situación de un instrumento frente a un mes de cierre:
 * - 'dentro'   → el mes cae adentro del plazo pactado, así que le toca período.
 * - 'vencido'  → el plazo ya terminó y el instrumento sigue activo: no se le
 *                genera nada. Un PF vencido no devenga solo; hay que renovarlo
 *                o devolverle la plata al inversor. Mientras eso no pase, queda
 *                como pendiente a la vista en la pantalla de cierre.
 * - 'fuera'    → todavía no arrancó, o el instrumento ya está cerrado/renovado.
 *
 * El último mes que devenga es el del día ANTERIOR al vencimiento: el día del
 * vencimiento es el del pago y el arranque del ciclo siguiente, no devenga.
 * Un ciclo 01/06 → 01/09 devenga junio, julio y agosto; septiembre ya no.
 */
export type SituacionEnMes = 'dentro' | 'vencido' | 'fuera'

export function situacionEnMes(
  inst: { estado: string; fecha_inicio: string; fecha_fin?: string | null },
  mes: string,
): SituacionEnMes {
  if (inst.estado !== 'activo') return 'fuera'
  if (mes < inst.fecha_inicio.substring(0, 7)) return 'fuera'
  // Sin vencimiento pactado el plazo no termina nunca: siempre le toca período.
  if (!inst.fecha_fin) return 'dentro'
  const ultimoMes = sumarDias(inst.fecha_fin, -1).substring(0, 7)
  return mes <= ultimoMes ? 'dentro' : 'vencido'
}
