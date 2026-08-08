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

interface CalcArgs {
  capitalInicial: number
  fechaInicio: string
  fechaFin?: string | null
  capitalizable: boolean
  hasta: string // YYYY-MM
  movimientosByMes?: Record<string, number>
  /**
   * Día en que se movió la plata, por mes (YYYY-MM → YYYY-MM-DD).
   * Con la fecha, lo que se retira cobra interés solo por los días que estuvo.
   * Sin fecha, el movimiento no ajusta el interés (así ningún número viejo se mueve).
   */
  fechasMovimiento?: Record<string, string | null>
  tramos: TramoEntrada[] // ordenados ASC por fecha_desde
  plazoDias?: number | null // plazo contractual del ciclo (para el modelo plano)
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
  montos: Record<string, number>,
  fechas: Record<string, string | null>,
  start: Date,
  fin: Date,
): { fecha: Date; monto: number }[] {
  const out: { fecha: Date; monto: number }[] = []
  for (const [mes, monto] of Object.entries(montos)) {
    const f = fechas[mes]
    if (!f || !monto) continue
    const fecha = parseDate(f)
    if (fecha < start || fecha >= fin) continue
    out.push({ fecha, monto })
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

  // PF NO capitalizables con vencimiento → modelo PLANO (1,75% por mes completo,
  // repartido proporcional por días). Capitalizables o sin vencimiento → compuesto histórico.
  if (!args.capitalizable && fin) {
    return generarPeriodosPlano(args, start, fin)
  }
  return generarPeriodosCompuesto(args, start, fin)
}

/**
 * MODELO PLANO — PF no capitalizables con vencimiento.
 * El ciclo [fechaInicio, fechaFin) rinde interés PLANO = capital × tasa × mesesDelPlazo.
 * Ese total se reparte entre los meses de calendario PROPORCIONAL a los días activos.
 * El día del vencimiento (fechaFin) NO cuenta: arranca el ciclo siguiente (fin exclusivo).
 * Si el ciclo se corta antes del plazo (retiro anticipado), se prorratea real (días/30).
 */
function generarPeriodosPlano(args: CalcArgs, start: Date, fin: Date): PeriodoCalc[] {
  const { capitalInicial, hasta, movimientosByMes = {}, fechasMovimiento = {}, tramos, plazoDias } = args
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
  const movsConFecha = fechados(movimientosByMes, fechasMovimiento, start, fin)

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

  // Meses de calendario que toca el ciclo, con sus días activos
  const filas: { mes: string; dias: number; activoStart: Date; primeroDelMes: boolean; ultimoDelCiclo: boolean }[] = []
  let cy = start.getFullYear()
  let cm = start.getMonth() + 1
  while (cy < yHasta || (cy === yHasta && cm <= mHasta)) {
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
  const totalDiasGen = filas.reduce((s, f) => s + f.dias, 0)
  const cicloCompletoGenerado = totalDiasGen >= diasCiclo
  const pesos = filas.map((f) => capitalDias(f.activoStart, f.dias, capitalInicial, movsConFecha))
  const pesoTotal = pesos.reduce((a, b) => a + b, 0)
  const shares = pesoTotal > 0
    ? pesos.map((peso) => round(interesTotalCiclo * peso / pesoTotal))
    : filas.map((f) => round(interesTotalCiclo * f.dias / diasCiclo))
  if (cicloCompletoGenerado && shares.length > 0) {
    const suma = shares.reduce((a, b) => a + b, 0)
    shares[shares.length - 1] = round(shares[shares.length - 1] + (interesTotalCiclo - suma))
  }

  // Aunque no capitalice (interés simple sobre el capital), el interés se ACUMULA al
  // saldo como deuda hasta que el inversor retira → el saldo cierre crece mes a mes y
  // el saldo inicio del mes siguiente arrastra ese acumulado.
  let saldoAcum = capitalInicial
  return filas.map((f, idx) => {
    let sumaTasaMes = 0
    for (let t = 0; t < f.dias; t++) sumaTasaMes += tasaEnFecha(tramos, new Date(f.activoStart.getTime() + t * 86400000))
    const tasaMes = f.dias > 0 ? sumaTasaMes / f.dias : 0
    const movimiento = movimientosByMes[f.mes] ?? 0
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
  })
}

/**
 * Cuánto interés suma (o resta) un movimiento por los días que quedó vigente dentro de
 * su mes. Un retiro a mitad de mes devuelve negativo: esa plata dejó de trabajar.
 */
function ajusteIntraMes(
  movimiento: number,
  fechaMov: string | null | undefined,
  mes: string,
  start: Date,
  fin: Date | null,
  tasa: number,
): number {
  if (!movimiento || !fechaMov || !tasa) return 0
  const [year, month] = mes.split('-').map(Number)
  const monthEnd = new Date(year, month, 0)
  const dim = monthEnd.getDate()
  const fecha = parseDate(fechaMov)
  if (fecha.getFullYear() !== year || fecha.getMonth() + 1 !== month) return 0

  const activoEnd = fin && fin < monthEnd ? fin : monthEnd
  const desde = fecha > start ? fecha : start
  if (desde > activoEnd) return 0
  const diasVigentes = Math.round((activoEnd.getTime() - desde.getTime()) / 86400000) + 1
  return movimiento * tasa * (diasVigentes / dim)
}

/**
 * MODELO COMPUESTO (histórico) — capitalizables o instrumentos sin vencimiento.
 * Interés por mes de calendario, prorrateado por días, con capitalización mensual.
 */
function generarPeriodosCompuesto(args: CalcArgs, start: Date, fin: Date | null): PeriodoCalc[] {
  const { capitalInicial, capitalizable, hasta, movimientosByMes = {}, fechasMovimiento = {}, tramos } = args
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

    const movimiento = movimientosByMes[mes] ?? 0
    // Si se sabe qué día se movió la plata, lo movido rinde solo por los días que
    // estuvo dentro de este mes. Sin fecha, el interés del mes no se toca.
    const interesMes = round(calc.interes + ajusteIntraMes(movimiento, fechasMovimiento[mes], mes, start, fin, calc.tasaPromedio))
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
// Simulador de movimientos (retiro parcial / total / ingreso)
// ────────────────────────────────────────────────────────────

// El retiro total no se simula: se hace con `planDevolucion` + "Devolver y cerrar",
// que corta bien los intereses y deja el saldo en cero.
export type TipoMovimiento = 'RETIRO_PARCIAL' | 'INGRESO'

export interface SimuladorInput {
  saldoInicioMes: number
  capitalizable: boolean
  fechaInicio: string
  fechaFin?: string | null
  mes: string // YYYY-MM
  tramosTasa: TramoEntrada[]
  tipoMovimiento: TipoMovimiento
  fechaMovimiento: string // YYYY-MM-DD
  monto: number // siempre positivo; el tipo aplica el signo
}

export interface ResultadoSimulacion {
  tramos: SegmentoCalc[]
  saldoInicio: number
  diasMes: number
  totalIntereses: number
  movimientoSignado: number
  saldoCierre: number
  error?: string
}

function segmentarPorTramos(
  desde: Date,
  hasta: Date,
  base: number,
  tramos: TramoEntrada[],
  diasMes: number,
): SegmentoCalc[] {
  if (hasta < desde) return []

  const cambios: Date[] = []
  for (const t of tramos) {
    const tDate = parseDate(t.fecha_desde)
    if (tDate > desde && tDate <= hasta) cambios.push(tDate)
  }
  cambios.sort((a, b) => a.getTime() - b.getTime())

  const segmentos: SegmentoCalc[] = []
  let segStart = new Date(desde)

  for (const c of cambios) {
    const segEnd = new Date(c.getTime() - 86400000)
    if (segEnd >= segStart) {
      const tasa = tasaEnFecha(tramos, segStart)
      const dias = Math.round((segEnd.getTime() - segStart.getTime()) / 86400000) + 1
      segmentos.push({
        desde: fmtDate(segStart),
        hasta: fmtDate(segEnd),
        tasa,
        dias,
        interes: round(base * tasa * (dias / diasMes)),
      })
    }
    segStart = new Date(c)
  }

  const tasaUlt = tasaEnFecha(tramos, segStart)
  const diasUlt = Math.round((hasta.getTime() - segStart.getTime()) / 86400000) + 1
  if (diasUlt > 0) {
    segmentos.push({
      desde: fmtDate(segStart),
      hasta: fmtDate(hasta),
      tasa: tasaUlt,
      dias: diasUlt,
      interes: round(base * tasaUlt * (diasUlt / diasMes)),
    })
  }

  return segmentos
}

export function simularMovimiento(args: SimuladorInput): ResultadoSimulacion {
  const [year, month] = args.mes.split('-').map(Number)
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0)
  const diasMes = monthEnd.getDate()

  const instStart = parseDate(args.fechaInicio)
  const instEnd = args.fechaFin ? parseDate(args.fechaFin) : null

  const activoStart = instStart > monthStart ? instStart : monthStart
  const activoEnd = instEnd && instEnd < monthEnd ? instEnd : monthEnd

  const fechaMov = parseDate(args.fechaMovimiento)
  const tipoMov = args.tipoMovimiento
  const monto = args.monto

  // Validar fecha dentro del rango activo
  if (fechaMov < activoStart || fechaMov > activoEnd) {
    return {
      tramos: [], saldoInicio: args.saldoInicioMes, diasMes,
      totalIntereses: 0, movimientoSignado: 0, saldoCierre: args.saldoInicioMes,
      error: 'La fecha está fuera del rango activo del instrumento en este mes',
    }
  }

  // Validar monto
  if (tipoMov !== 'INGRESO' && monto > args.saldoInicioMes) {
    return {
      tramos: [], saldoInicio: args.saldoInicioMes, diasMes,
      totalIntereses: 0, movimientoSignado: 0, saldoCierre: args.saldoInicioMes,
      error: 'El monto supera el saldo disponible',
    }
  }

  if (monto <= 0) {
    return {
      tramos: [], saldoInicio: args.saldoInicioMes, diasMes,
      totalIntereses: 0, movimientoSignado: 0, saldoCierre: args.saldoInicioMes,
      error: 'Ingresá un monto mayor a cero',
    }
  }

  // Parcial / Ingreso → dos sub-rangos
  const signedMov = tipoMov === 'INGRESO' ? monto : -monto
  const segmentos: SegmentoCalc[] = []

  // Tramo 1: activoStart → (fechaMov - 1)
  const t1End = new Date(fechaMov.getTime() - 86400000)
  if (t1End >= activoStart) {
    segmentos.push(...segmentarPorTramos(activoStart, t1End, args.saldoInicioMes, args.tramosTasa, diasMes))
  }

  // Tramo 2: fechaMov → activoEnd, con base actualizada
  const baseT2 = args.saldoInicioMes + signedMov
  if (fechaMov <= activoEnd && baseT2 > 0) {
    segmentos.push(...segmentarPorTramos(fechaMov, activoEnd, baseT2, args.tramosTasa, diasMes))
  }

  const totalInt = segmentos.reduce((s, x) => s + x.interes, 0)
  const saldoCierre = args.capitalizable
    ? args.saldoInicioMes + totalInt + signedMov
    : args.saldoInicioMes + signedMov

  return {
    tramos: segmentos,
    saldoInicio: args.saldoInicioMes,
    diasMes,
    totalIntereses: round(totalInt),
    movimientoSignado: signedMov,
    saldoCierre: round(saldoCierre),
  }
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
