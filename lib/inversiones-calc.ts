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
  tramos: TramoEntrada[] // ordenados ASC por fecha_desde
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

export function generarPeriodos(args: CalcArgs): PeriodoCalc[] {
  const { capitalInicial, fechaInicio, fechaFin, capitalizable, hasta, movimientosByMes = {}, tramos } = args

  if (tramos.length === 0) return []

  const start = parseDate(fechaInicio)
  const fin = fechaFin ? parseDate(fechaFin) : null
  const [yHasta, mHasta] = hasta.split('-').map(Number)

  const periodos: PeriodoCalc[] = []
  let saldoActual = capitalInicial

  let cy = start.getFullYear()
  let cm = start.getMonth() + 1

  while (cy < yHasta || (cy === yHasta && cm <= mHasta)) {
    const mes = mesKey(cy, cm)
    const saldoInicio = capitalizable ? saldoActual : capitalInicial

    const calc = calcularInteresMes(saldoInicio, mes, start, fin, tramos)

    const movimiento = movimientosByMes[mes] ?? 0
    const saldoCierre = capitalizable
      ? saldoInicio + calc.interes + movimiento
      : saldoInicio + movimiento

    periodos.push({
      mes,
      saldo_inicio: round(saldoInicio),
      interes_devengado: round(calc.interes),
      int_inicio_prorrateado: round(calc.intInicio),
      int_fin_prorrateado: round(calc.intFin),
      movimiento: round(movimiento),
      saldo_cierre: round(saldoCierre),
      tasa_aplicada: round(calc.tasaPromedio * 1000000) / 1000000,
      segmentos: calc.segmentos,
    })

    if (capitalizable) saldoActual = saldoCierre
    if (fin && cy === fin.getFullYear() && cm === fin.getMonth() + 1) break

    ;[cy, cm] = nextMonth(cy, cm)
  }

  return periodos
}

// ────────────────────────────────────────────────────────────
// Simulador de movimientos (retiro parcial / total / ingreso)
// ────────────────────────────────────────────────────────────

export type TipoMovimiento = 'RETIRO_PARCIAL' | 'RETIRO_TOTAL' | 'INGRESO'

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
  esRetiroTotal: boolean
  capitalAlMomento?: number
  totalAPagar?: number
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
  const monto = tipoMov === 'RETIRO_TOTAL' ? args.saldoInicioMes : args.monto

  // Validar fecha dentro del rango activo
  if (fechaMov < activoStart || fechaMov > activoEnd) {
    return {
      tramos: [], saldoInicio: args.saldoInicioMes, diasMes,
      totalIntereses: 0, movimientoSignado: 0, saldoCierre: args.saldoInicioMes,
      esRetiroTotal: false,
      error: 'La fecha está fuera del rango activo del instrumento en este mes',
    }
  }

  // Validar monto
  if (tipoMov !== 'INGRESO' && monto > args.saldoInicioMes) {
    return {
      tramos: [], saldoInicio: args.saldoInicioMes, diasMes,
      totalIntereses: 0, movimientoSignado: 0, saldoCierre: args.saldoInicioMes,
      esRetiroTotal: false,
      error: 'El monto supera el saldo disponible',
    }
  }

  if (monto <= 0) {
    return {
      tramos: [], saldoInicio: args.saldoInicioMes, diasMes,
      totalIntereses: 0, movimientoSignado: 0, saldoCierre: args.saldoInicioMes,
      esRetiroTotal: false,
      error: 'Ingresá un monto mayor a cero',
    }
  }

  // Retiro total: solo Tramo 1, hasta fecha_movimiento
  if (tipoMov === 'RETIRO_TOTAL') {
    const segs = segmentarPorTramos(activoStart, fechaMov, args.saldoInicioMes, args.tramosTasa, diasMes)
    const totalInt = segs.reduce((s, x) => s + x.interes, 0)
    return {
      tramos: segs,
      saldoInicio: args.saldoInicioMes,
      diasMes,
      totalIntereses: round(totalInt),
      movimientoSignado: -args.saldoInicioMes,
      saldoCierre: 0,
      esRetiroTotal: true,
      capitalAlMomento: args.saldoInicioMes,
      totalAPagar: round(args.saldoInicioMes + totalInt),
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
    esRetiroTotal: false,
  }
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
