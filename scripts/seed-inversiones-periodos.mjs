import { resolve } from 'node:path'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: resolve(process.cwd(), '.env.local') })

function diasEnMes(year, month) {
  return new Date(year, month, 0).getDate()
}

function mesKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function generarPeriodos({ capitalInicial, tasaMensual, fechaInicio, fechaFin, capitalizable, hasta }) {
  const [yIni, mIni, dIni] = fechaInicio.split('-').map(Number)
  const fin = fechaFin ? fechaFin.split('-').map(Number) : null
  const [yHasta, mHasta] = hasta.split('-').map(Number)

  const periodos = []
  let saldoActual = capitalInicial
  let cy = yIni, cm = mIni

  const round = (n) => Math.round(n * 100) / 100

  while (cy < yHasta || (cy === yHasta && cm <= mHasta)) {
    const dim = diasEnMes(cy, cm)
    const saldoInicio = capitalizable ? saldoActual : capitalInicial
    const interesMesCompleto = saldoInicio * tasaMensual

    let intInicio = 0, intFin = 0, interesDevengado = interesMesCompleto

    if (cy === yIni && cm === mIni) {
      const dias = dim - dIni + 1
      intInicio = (dias / dim) * interesMesCompleto
      interesDevengado = intInicio
    }
    if (fin && cy === fin[0] && cm === fin[1]) {
      const dias = fin[2]
      intFin = (dias / dim) * interesMesCompleto
      if (cy === yIni && cm === mIni) {
        const diasReales = fin[2] - dIni + 1
        interesDevengado = (diasReales / dim) * interesMesCompleto
      } else {
        interesDevengado = intFin
      }
    }

    const saldoCierre = capitalizable ? saldoInicio + interesDevengado : saldoInicio

    periodos.push({
      mes: mesKey(cy, cm),
      saldo_inicio: round(saldoInicio),
      interes_devengado: round(interesDevengado),
      int_inicio_prorrateado: round(intInicio),
      int_fin_prorrateado: round(intFin),
      movimiento: 0,
      saldo_cierre: round(saldoCierre),
    })

    if (capitalizable) saldoActual = saldoCierre
    if (fin && cy === fin[0] && cm === fin[1]) break
    cm += 1; if (cm > 12) { cm = 1; cy += 1 }
  }
  return periodos
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

const { rows: instrs } = await c.query("SELECT * FROM instrumentos_inversion")
const now = new Date()
const hasta = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

for (const inst of instrs) {
  const { rows: existentes } = await c.query("SELECT mes FROM periodos_instrumento WHERE instrumento_id = $1", [inst.id])
  if (existentes.length > 0) {
    console.log(`✓ ${inst.codigo}: ya tiene ${existentes.length} períodos, salteando`)
    continue
  }
  const periodos = generarPeriodos({
    capitalInicial: Number(inst.capital_inicial),
    tasaMensual: Number(inst.tasa_mensual),
    fechaInicio: inst.fecha_inicio.toISOString().substring(0, 10),
    fechaFin: inst.fecha_fin ? inst.fecha_fin.toISOString().substring(0, 10) : null,
    capitalizable: inst.capitalizable,
    hasta,
  })
  for (const p of periodos) {
    await c.query(
      `INSERT INTO periodos_instrumento (instrumento_id, mes, saldo_inicio, interes_devengado, int_inicio_prorrateado, int_fin_prorrateado, movimiento, saldo_cierre, cerrado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false)
       ON CONFLICT (instrumento_id, mes) DO NOTHING`,
      [inst.id, p.mes, p.saldo_inicio, p.interes_devengado, p.int_inicio_prorrateado, p.int_fin_prorrateado, p.movimiento, p.saldo_cierre]
    )
  }
  console.log(`✓ ${inst.codigo}: ${periodos.length} períodos creados`)
}

await c.end()
console.log('✅ Seed completado')
