'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { generarPeriodos, getCurrentMonth, planDevolucion, sumarMeses, sumarDias, diasEntre, mesesEntre, situacionEnMes, type FilaPeriodo, type MovimientoCalc } from '@/lib/inversiones-calc'
import type { MotivoMovimiento } from '@/types/database'

// ============ INVERSORES ============

const inversorSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(['persona_fisica', 'empresa']),
  notas: z.string().optional().nullable(),
  // Datos formales (mig 036) — todos opcionales
  dni: z.string().optional().nullable(),
  cuit: z.string().optional().nullable(),
  domicilio_calle: z.string().optional().nullable(),
  domicilio_ciudad: z.string().optional().nullable(),
  domicilio_provincia: z.string().optional().nullable(),
  domicilio_cp: z.string().optional().nullable(),
  email: z.string().email('Email inválido').optional().or(z.literal('')).nullable(),
  telefono: z.string().optional().nullable(),
})

function blank(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export async function createInversor(prevState: string | null, formData: FormData) {
  await requireUser()
  const result = inversorSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message
  const supabase = await createClient()
  const { error } = await supabase.from('inversores').insert({
    nombre: result.data.nombre,
    tipo: result.data.tipo,
    notas: blank(result.data.notas),
    dni: blank(result.data.dni),
    cuit: blank(result.data.cuit),
    domicilio_calle: blank(result.data.domicilio_calle),
    domicilio_ciudad: blank(result.data.domicilio_ciudad),
    domicilio_provincia: blank(result.data.domicilio_provincia),
    domicilio_cp: blank(result.data.domicilio_cp),
    email: blank(result.data.email),
    telefono: blank(result.data.telefono),
    activo: true,
  })
  if (error) return error.message
  revalidatePath('/inversiones')
  return null
}

export async function updateInversor(id: string, prevState: string | null, formData: FormData) {
  await requireUser()
  const result = inversorSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message
  const supabase = await createClient()
  const { error } = await supabase.from('inversores').update({
    nombre: result.data.nombre,
    tipo: result.data.tipo,
    notas: blank(result.data.notas),
    dni: blank(result.data.dni),
    cuit: blank(result.data.cuit),
    domicilio_calle: blank(result.data.domicilio_calle),
    domicilio_ciudad: blank(result.data.domicilio_ciudad),
    domicilio_provincia: blank(result.data.domicilio_provincia),
    domicilio_cp: blank(result.data.domicilio_cp),
    email: blank(result.data.email),
    telefono: blank(result.data.telefono),
  }).eq('id', id)
  if (error) return error.message
  revalidatePath('/inversiones')
  revalidatePath(`/inversiones/${id}`)
  return null
}

export async function toggleInversorActivo(id: string, activo: boolean) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('inversores').update({ activo }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/inversiones')
}

// ============ INSTRUMENTOS ============

const instrumentoSchema = z.object({
  inversor_id: z.string().uuid(),
  codigo: z.string().optional().nullable(),
  moneda: z.enum(['USD', 'ARS']),
  capital_inicial: z.coerce.number().positive(),
  tasa_mensual: z.coerce.number().min(0),
  capitalizable: z.coerce.boolean(),
  fecha_inicio: z.string().min(1),
  fecha_fin: z.string().optional().nullable(),
  estado: z.enum(['activo', 'cerrado', 'renovado']).default('activo'),
  notas: z.string().optional().nullable(),
  // Acepta vacío "" desde el form y lo trata como sin plazo (null)
  plazo_dias: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
})

/**
 * Los movimientos de plata del instrumento, que son la fuente de verdad del cálculo.
 * `excluirDevolucion` saca el movimiento que genera "Devolver y cerrar": al recalcular
 * la devolución, contarlo restaría la plata dos veces.
 */
async function leerMovimientos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  instrumentoId: string,
  opts?: { excluirDevolucion?: boolean },
): Promise<MovimientoCalc[]> {
  let q = supabase
    .from('movimientos_instrumento')
    .select('mes, fecha, monto')
    .eq('instrumento_id', instrumentoId)
  if (opts?.excluirDevolucion) q = q.neq('origen', 'devolucion_cierre')
  const { data } = await q
  return (data ?? []).map((m) => ({ mes: m.mes, fecha: m.fecha ?? null, monto: Number(m.monto) }))
}

/**
 * El cache que se guarda en cada fila de período: cuánto se movió en el mes y, si se
 * puede, qué día. Con varios movimientos no hay "una" fecha, así que queda vacía —
 * ponerle una sería mentir. La devolución tiene prioridad porque su fecha es la que
 * usa el comprobante que firma el inversor.
 */
function cacheDeMovimientos(
  movs: { mes: string; fecha?: string | null; monto: number; motivo?: string }[],
): { totales: Record<string, number>; fechas: Record<string, string | null> } {
  const totales: Record<string, number> = {}
  const fechas: Record<string, string | null> = {}
  const porMes = new Map<string, typeof movs>()
  for (const m of movs) {
    totales[m.mes] = round2((totales[m.mes] ?? 0) + m.monto)
    porMes.set(m.mes, [...(porMes.get(m.mes) ?? []), m])
  }
  for (const [mes, lista] of porMes) {
    const devolucion = lista.find((m) => m.motivo === 'devolucion' && m.fecha)
    const conFecha = lista.filter((m) => m.fecha)
    fechas[mes] = devolucion?.fecha ?? (conFecha.length === 1 ? conFecha[0].fecha! : null)
  }
  return { totales, fechas }
}

const round2 = (n: number) => Math.round(n * 100) / 100

async function regenerarPeriodosDB(supabase: Awaited<ReturnType<typeof createClient>>, instrumentoId: string) {
  const { data: inst } = await supabase.from('instrumentos_inversion').select('*').eq('id', instrumentoId).single()
  if (!inst) return

  // Cargar tramos de tasa ordenados por fecha
  const { data: tramos } = await supabase
    .from('tramos_tasa')
    .select('fecha_desde, tasa_mensual')
    .eq('instrumento_id', instrumentoId)
    .order('fecha_desde', { ascending: true })

  // Si no hay tramos (caso edge), usar la tasa del instrumento como tramo único
  const tramosArr = (tramos ?? []).length > 0
    ? (tramos ?? []).map((t) => ({ fecha_desde: t.fecha_desde, tasa_mensual: Number(t.tasa_mensual) }))
    : [{ fecha_desde: inst.fecha_inicio, tasa_mensual: Number(inst.tasa_mensual) }]

  // Los movimientos salen de su tabla; del período solo se necesita saber qué meses
  // están cerrados, porque esos no se tocan nunca.
  const { data: movRows } = await supabase
    .from('movimientos_instrumento')
    .select('mes, fecha, monto, motivo')
    .eq('instrumento_id', instrumentoId)
  const movimientos: MovimientoCalc[] = (movRows ?? []).map((m) => ({
    mes: m.mes,
    fecha: m.fecha ?? null,
    monto: Number(m.monto),
  }))
  const cache = cacheDeMovimientos(
    (movRows ?? []).map((m) => ({ mes: m.mes, fecha: m.fecha ?? null, monto: Number(m.monto), motivo: m.motivo })),
  )

  const { data: existentes } = await supabase
    .from('periodos_instrumento')
    .select('mes, cerrado')
    .eq('instrumento_id', instrumentoId)
  const cerrados = new Set<string>()
  for (const p of existentes ?? []) if (p.cerrado) cerrados.add(p.mes)

  const hasta = inst.fecha_fin && inst.fecha_fin <= getCurrentMonthBoundary()
    ? inst.fecha_fin.substring(0, 7)
    : getCurrentMonth()

  const periodos = generarPeriodos({
    capitalInicial: Number(inst.capital_inicial),
    fechaInicio: inst.fecha_inicio,
    fechaFin: inst.fecha_fin,
    capitalizable: inst.capitalizable,
    hasta,
    movimientos,
    tramos: tramosArr,
    plazoDias: inst.plazo_dias,
  })

  // Borrar abiertos y reinsertar (los cerrados nunca se tocan)
  await supabase.from('periodos_instrumento').delete().eq('instrumento_id', instrumentoId).eq('cerrado', false)

  const rows = periodos
    .filter((p) => !cerrados.has(p.mes))
    .map((p) => ({
      instrumento_id: instrumentoId,
      mes: p.mes,
      saldo_inicio: p.saldo_inicio,
      interes_devengado: p.interes_devengado,
      int_inicio_prorrateado: p.int_inicio_prorrateado,
      int_fin_prorrateado: p.int_fin_prorrateado,
      movimiento: cache.totales[p.mes] ?? 0,
      fecha_movimiento: cache.fechas[p.mes] ?? null,
      saldo_cierre: p.saldo_cierre,
      tasa_aplicada: p.tasa_aplicada,
      cerrado: false,
    }))
  if (rows.length > 0) {
    await supabase.from('periodos_instrumento').insert(rows)
  }
}

function getCurrentMonthBoundary() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-31`
}

export async function createInstrumento(prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = {
    ...Object.fromEntries(formData),
    capitalizable: formData.get('capitalizable') === 'true' || formData.get('capitalizable') === 'on',
  }
  const result = instrumentoSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { data, error } = await supabase.from('instrumentos_inversion').insert({
    ...result.data,
    codigo: result.data.codigo || null,
    fecha_fin: result.data.fecha_fin || null,
    notas: result.data.notas || null,
  }).select('id').single()
  if (error) return error.message

  // Crear tramo de tasa inicial automáticamente
  if (data) {
    await supabase.from('tramos_tasa').insert({
      instrumento_id: data.id,
      tasa_mensual: result.data.tasa_mensual,
      fecha_desde: result.data.fecha_inicio,
      notas: 'Tasa inicial del instrumento',
    })
    // Generar periodos
    await regenerarPeriodosDB(supabase, data.id)
  }

  revalidatePath('/inversiones')
  revalidatePath(`/inversiones/${result.data.inversor_id}`)
  revalidatePath('/inversiones/cierre')
  revalidatePath('/inversiones/gastos')
  return null
}

export async function updateInstrumento(id: string, prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = {
    ...Object.fromEntries(formData),
    capitalizable: formData.get('capitalizable') === 'true' || formData.get('capitalizable') === 'on',
  }
  const result = instrumentoSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('instrumentos_inversion').update({
    ...result.data,
    codigo: result.data.codigo || null,
    fecha_fin: result.data.fecha_fin || null,
    notas: result.data.notas || null,
  }).eq('id', id)
  if (error) return error.message

  await regenerarPeriodosDB(supabase, id)

  revalidatePath('/inversiones')
  revalidatePath(`/inversiones/${result.data.inversor_id}`)
  revalidatePath('/inversiones/cierre')
  revalidatePath('/inversiones/gastos')
  return null
}

export async function deleteInstrumento(id: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('instrumentos_inversion').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/inversiones')
}

export async function regenerarPeriodos(instrumentoId: string) {
  await requireUser()
  const supabase = await createClient()
  await regenerarPeriodosDB(supabase, instrumentoId)
  revalidatePath('/inversiones')
  revalidatePath('/inversiones/cierre')
  revalidatePath('/inversiones/gastos')
}

// ============ RENOVAR INSTRUMENTO ============

export type RenovarResult =
  | { ok: true; capitalAnterior: number; capitalNuevo: number; fechaInicio: string; fechaFin: string; tasaMensual: number; capitalizable: boolean }
  | { ok: false; error: string }

/**
 * Renueva un instrumento de inversión sobre sí mismo:
 * 1) Calcula el saldo final del ciclo actual (capital + intereses devengados de períodos cerrados)
 * 2) Actualiza el instrumento con: capital_inicial = saldo final, fecha_inicio = fecha_fin actual, fecha_fin = nueva + plazo_dias
 * 3) Regenera períodos (los cerrados se preservan)
 *
 * Requiere que NO haya períodos abiertos (todos cerrados).
 */
export async function renovarInstrumento(
  instrumentoId: string,
  nuevaFechaFinCustom?: string,
  opts?: { tasaMensual?: number; capitalizable?: boolean },
): Promise<RenovarResult> {
  await requireUser()
  const supabase = await createClient()

  // 1. Cargar instrumento
  const { data: inst, error: errInst } = await supabase
    .from('instrumentos_inversion')
    .select('id, capital_inicial, fecha_inicio, fecha_fin, plazo_dias, estado, capitalizable, tasa_mensual, notas')
    .eq('id', instrumentoId)
    .single()

  if (errInst || !inst) {
    return { ok: false, error: 'No se encontró el instrumento' }
  }

  // 2. Validaciones
  if (inst.estado !== 'activo') {
    return { ok: false, error: `El instrumento no está activo (estado: ${inst.estado})` }
  }
  if (!inst.fecha_fin) {
    return { ok: false, error: 'El instrumento no tiene fecha de vencimiento. Configurala antes de renovar.' }
  }
  if (!inst.plazo_dias && !nuevaFechaFinCustom) {
    return { ok: false, error: 'El instrumento no tiene plazo definido. Configuralo antes de renovar, o elegí una fecha de vencimiento al renovar.' }
  }

  // 3. Verificar que NO haya períodos abiertos
  const { data: periodosAbiertos } = await supabase
    .from('periodos_instrumento')
    .select('mes')
    .eq('instrumento_id', instrumentoId)
    .eq('cerrado', false)

  if (periodosAbiertos && periodosAbiertos.length > 0) {
    const meses = periodosAbiertos.map((p) => p.mes).join(', ')
    return {
      ok: false,
      error: `Hay ${periodosAbiertos.length} período(s) abierto(s) (${meses}). Cerralos desde /inversiones/cierre antes de renovar.`,
    }
  }

  // 4. Calcular saldo final
  const capitalAnterior = Number(inst.capital_inicial)
  let capitalNuevo: number

  if (inst.capitalizable) {
    // Capitalizable: saldo_cierre del último período cerrado
    const { data: ultimoPeriodo } = await supabase
      .from('periodos_instrumento')
      .select('saldo_cierre')
      .eq('instrumento_id', instrumentoId)
      .eq('cerrado', true)
      .order('mes', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!ultimoPeriodo) {
      return { ok: false, error: 'No hay períodos cerrados. Cerrá al menos uno antes de renovar.' }
    }
    capitalNuevo = Number(ultimoPeriodo.saldo_cierre)
  } else {
    // NO capitalizable: capital_inicial + SUM(interes + movimiento) de cerrados
    const { data: periodosCerrados } = await supabase
      .from('periodos_instrumento')
      .select('interes_devengado, movimiento')
      .eq('instrumento_id', instrumentoId)
      .eq('cerrado', true)

    if (!periodosCerrados || periodosCerrados.length === 0) {
      return { ok: false, error: 'No hay períodos cerrados. Cerrá al menos uno antes de renovar.' }
    }
    const acumulado = periodosCerrados.reduce(
      (s, p) => s + Number(p.interes_devengado ?? 0) + Number(p.movimiento ?? 0),
      0,
    )
    capitalNuevo = Math.round((capitalAnterior + acumulado) * 100) / 100
  }

  // 5. Calcular nuevas fechas
  const nuevaFechaInicio = inst.fecha_fin // YYYY-MM-DD
  let nuevaFechaFin: string
  let nuevoPlazoDias = inst.plazo_dias ? Number(inst.plazo_dias) : null
  if (nuevaFechaFinCustom) {
    // Renovación con vencimiento elegido a mano (ej: 3 meses exactos → 18-jun a 18-sep)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFechaFinCustom)) {
      return { ok: false, error: 'Fecha de vencimiento inválida (formato YYYY-MM-DD).' }
    }
    if (nuevaFechaFinCustom <= nuevaFechaInicio) {
      return { ok: false, error: `El vencimiento (${nuevaFechaFinCustom}) debe ser posterior al inicio del nuevo ciclo (${nuevaFechaInicio}).` }
    }
    nuevaFechaFin = nuevaFechaFinCustom
    // Recalcular plazo_dias según las fechas elegidas (queda de referencia para la próxima)
    nuevoPlazoDias = diasEntre(nuevaFechaInicio, nuevaFechaFin)
  } else {
    // Renovar por el MISMO plazo que traía. Si el ciclo que termina era de meses
    // redondos (lo normal), se suman meses: un plazo de 3 meses que arrancó un 14
    // vuelve a vencer un 14. Sumar los días literales corría el vencimiento un par de
    // días para atrás en cada renovación, y a la cuarta vuelta ya era una semana.
    const mesesDelCiclo = mesesEntre(inst.fecha_inicio, inst.fecha_fin)
    nuevaFechaFin = mesesDelCiclo
      ? sumarMeses(nuevaFechaInicio, mesesDelCiclo)
      : sumarDias(nuevaFechaInicio, Number(inst.plazo_dias))
    nuevoPlazoDias = diasEntre(nuevaFechaInicio, nuevaFechaFin)
  }

  // 6. Condiciones del nuevo ciclo (tasa y capitalización pueden reacordarse al renovar).
  //    Por defecto se mantienen las actuales.
  const tasaAnterior = Number(inst.tasa_mensual)
  const nuevaTasa = opts?.tasaMensual != null && Number.isFinite(opts.tasaMensual) && opts.tasaMensual >= 0
    ? opts.tasaMensual
    : tasaAnterior
  const nuevoCapitalizable = opts?.capitalizable != null ? opts.capitalizable : inst.capitalizable
  const tasaCambio = nuevaTasa !== tasaAnterior
  const capCambio = nuevoCapitalizable !== inst.capitalizable

  // 6b. Update instrumento
  const hoyISO = new Date().toISOString().substring(0, 10)
  const cambios = [
    `Capital anterior: $${capitalAnterior.toFixed(2)} → Nuevo: $${capitalNuevo.toFixed(2)}`,
    `Periodo: ${nuevaFechaInicio} → ${nuevaFechaFin}`,
    tasaCambio ? `Tasa: ${(tasaAnterior * 100).toFixed(2)}% → ${(nuevaTasa * 100).toFixed(2)}%` : null,
    capCambio ? `Capitalización: ${inst.capitalizable ? 'sí' : 'no'} → ${nuevoCapitalizable ? 'sí' : 'no'}` : null,
  ].filter(Boolean).join('. ')
  const notaRenovacion = `[${hoyISO}] Renovado. ${cambios}.`
  const nuevasNotas = inst.notas ? `${inst.notas}\n${notaRenovacion}` : notaRenovacion

  const { error: errUpdate } = await supabase
    .from('instrumentos_inversion')
    .update({
      capital_inicial: capitalNuevo,
      fecha_inicio: nuevaFechaInicio,
      fecha_fin: nuevaFechaFin,
      plazo_dias: nuevoPlazoDias,
      tasa_mensual: nuevaTasa,
      capitalizable: nuevoCapitalizable,
      notas: nuevasNotas,
    })
    .eq('id', instrumentoId)

  if (errUpdate) {
    return { ok: false, error: `Error actualizando instrumento: ${errUpdate.message}` }
  }

  // 6c. Si cambió la tasa, agregar un tramo desde el inicio del nuevo ciclo.
  //     Los períodos ya cerrados conservan su tasa (se rigen por tramos anteriores);
  //     el ciclo nuevo usa la tasa reacordada.
  if (tasaCambio) {
    const { data: tramoExistente } = await supabase
      .from('tramos_tasa')
      .select('id')
      .eq('instrumento_id', instrumentoId)
      .eq('fecha_desde', nuevaFechaInicio)
      .maybeSingle()
    if (tramoExistente) {
      await supabase.from('tramos_tasa').update({ tasa_mensual: nuevaTasa }).eq('id', tramoExistente.id)
    } else {
      await supabase.from('tramos_tasa').insert({
        instrumento_id: instrumentoId,
        tasa_mensual: nuevaTasa,
        fecha_desde: nuevaFechaInicio,
        notas: `Tasa acordada al renovar (${hoyISO})`,
      })
    }
  }

  // 7. Regenerar períodos del nuevo ciclo (los cerrados se preservan)
  await regenerarPeriodosDB(supabase, instrumentoId)

  // 8. Revalidar paths
  revalidatePath('/inversiones')
  revalidatePath(`/inversiones/${instrumentoId}`)
  revalidatePath('/inversiones/cierre')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/pendientes')

  return {
    ok: true,
    capitalAnterior,
    capitalNuevo,
    fechaInicio: nuevaFechaInicio,
    fechaFin: nuevaFechaFin,
    tasaMensual: nuevaTasa,
    capitalizable: nuevoCapitalizable,
  }
}

// ============ DEVOLVER Y CERRAR ============

export interface DetalleDevolucion {
  /** Fecha en que se le paga al inversor. */
  fechaPago: string
  /** Primer día que ya NO devenga interés (el día del pago no devenga). */
  fechaCorte: string
  /** Vencimiento acordado, si tenía. */
  vencimientoAcordado: string | null
  /** true si se devuelve antes del vencimiento acordado → los intereses se prorratean. */
  anticipada: boolean
  capitalPendiente: number
  interesesCiclo: number
  totalADevolver: number
  moneda: 'ARS' | 'USD'
  mesDevolucion: string
  /** Meses abiertos que quedan por cerrar para que el interés llegue a Gastos. */
  mesesAbiertos: string[]
  /** Diferencia imputada al último mes abierto (meses cerrados con el plazo viejo). */
  ajusteUltimoMes: number
  /** Movimientos del ciclo anterior que quedaron fuera del cálculo (ya están en el capital). */
  movimientosDelCicloAnterior: { mes: string; monto: number }[]
  inversorNombre: string
  codigo: string | null
}

export type DevolucionResult =
  | { ok: true; detalle: DetalleDevolucion }
  | { ok: false; error: string }

/**
 * Arma la devolución total de un instrumento SIN escribir nada.
 * La usan tanto la previsualización como la ejecución, así el número que ve
 * Bruno en pantalla es exactamente el que se aplica.
 */
async function armarDevolucion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  instrumentoId: string,
  fechaPago: string,
): Promise<{ ok: false; error: string } | { ok: true; detalle: DetalleDevolucion; filas: FilaPeriodo[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) {
    return { ok: false, error: 'Fecha de devolución inválida (formato AAAA-MM-DD).' }
  }

  const { data: inst } = await supabase
    .from('instrumentos_inversion')
    .select('*, inversor:inversores(nombre)')
    .eq('id', instrumentoId)
    .single()
  if (!inst) return { ok: false, error: 'No se encontró el instrumento' }
  if (inst.estado !== 'activo') {
    return { ok: false, error: `El instrumento ya no está activo (estado: ${inst.estado}). No hay nada que devolver.` }
  }
  if (fechaPago <= inst.fecha_inicio) {
    return { ok: false, error: `La devolución (${fechaPago}) tiene que ser posterior al inicio del ciclo (${inst.fecha_inicio}).` }
  }

  // El día del pago NO devenga interés: es el día en que se cierra el trato.
  // Si se paga después del vencimiento, el devengamiento igual corta en el vencimiento.
  const vencimiento: string | null = inst.fecha_fin ?? null
  const fechaCorte = vencimiento && fechaPago > vencimiento ? vencimiento : fechaPago
  const anticipada = !!vencimiento && fechaPago < vencimiento

  const { data: tramos } = await supabase
    .from('tramos_tasa')
    .select('fecha_desde, tasa_mensual')
    .eq('instrumento_id', instrumentoId)
    .order('fecha_desde', { ascending: true })
  const tramosArr = (tramos ?? []).length > 0
    ? (tramos ?? []).map((t) => ({ fecha_desde: t.fecha_desde, tasa_mensual: Number(t.tasa_mensual) }))
    : [{ fecha_desde: inst.fecha_inicio, tasa_mensual: Number(inst.tasa_mensual) }]

  // El motor plano toma fecha_fin como exclusiva (no devenga ese día) y el compuesto
  // como inclusiva. Para que las dos ramas corten el mismo día, al compuesto se le
  // pasa el día anterior.
  const usaPlano = !inst.capitalizable && !!vencimiento
  const finGenerador = usaPlano ? fechaCorte : sumarDias(fechaCorte, -1)
  if (finGenerador < inst.fecha_inicio) {
    return { ok: false, error: 'La fecha de devolución no deja ni un día de plazo.' }
  }

  // Los retiros parciales del ciclo bajan el interés desde el día que salieron. Se
  // excluye la devolución anterior (si la hubo): esa plata ya sale por este mismo
  // cálculo, contarla otra vez la restaría dos veces.
  const movimientos = await leerMovimientos(supabase, instrumentoId, { excluirDevolucion: true })

  const periodosGenerados = generarPeriodos({
    capitalInicial: Number(inst.capital_inicial),
    fechaInicio: inst.fecha_inicio,
    fechaFin: finGenerador,
    capitalizable: inst.capitalizable,
    hasta: fechaCorte.substring(0, 7),
    movimientos,
    tramos: tramosArr,
    plazoDias: inst.plazo_dias,
  })

  const { data: actuales } = await supabase
    .from('periodos_instrumento')
    .select('mes, saldo_inicio, interes_devengado, movimiento, fecha_movimiento, saldo_cierre, cerrado')
    .eq('instrumento_id', instrumentoId)
    .order('mes', { ascending: true })

  const periodosActuales: FilaPeriodo[] = (actuales ?? []).map((p) => ({
    mes: p.mes,
    saldo_inicio: Number(p.saldo_inicio ?? 0),
    interes_devengado: Number(p.interes_devengado ?? 0),
    movimiento: Number(p.movimiento ?? 0),
    saldo_cierre: Number(p.saldo_cierre ?? 0),
    cerrado: !!p.cerrado,
  }))

  const mesDevolucion = fechaPago.substring(0, 7)

  // Un mes cerrado posterior al pago es una foto que ya no se puede reescribir.
  const cerradosPosteriores = periodosActuales.filter((p) => p.cerrado && p.mes > mesDevolucion)
  if (cerradosPosteriores.length > 0) {
    return {
      ok: false,
      error: `Hay meses ya cerrados posteriores a la devolución (${cerradosPosteriores.map((p) => p.mes).join(', ')}). Reabrilos desde Inversiones → Cierre mensual y volvé a intentar.`,
    }
  }
  if (periodosActuales.some((p) => p.cerrado && p.mes === mesDevolucion)) {
    return {
      ok: false,
      error: `El mes del pago (${mesDevolucion}) ya está cerrado. Reabrilo desde Inversiones → Cierre mensual y volvé a intentar.`,
    }
  }

  const plan = planDevolucion({
    periodosGenerados,
    periodosActuales,
    capitalInicial: Number(inst.capital_inicial),
    fechaInicioCiclo: inst.fecha_inicio,
    mesDevolucion,
  })

  const inversor = Array.isArray(inst.inversor) ? inst.inversor[0] : inst.inversor

  return {
    ok: true,
    filas: plan.filas,
    detalle: {
      fechaPago,
      fechaCorte,
      vencimientoAcordado: vencimiento,
      anticipada,
      capitalPendiente: plan.capitalPendiente,
      interesesCiclo: plan.interesesCiclo,
      totalADevolver: plan.totalADevolver,
      moneda: inst.moneda as 'ARS' | 'USD',
      mesDevolucion,
      mesesAbiertos: plan.filas.filter((f) => !f.cerrado && f.interes_devengado !== 0).map((f) => f.mes),
      ajusteUltimoMes: plan.ajusteUltimoMes,
      movimientosDelCicloAnterior: plan.movimientosDelCicloAnterior,
      inversorNombre: inversor?.nombre ?? 'Inversor s/d',
      codigo: inst.codigo ?? null,
    },
  }
}

/**
 * Calcula cuánto hay que devolverle al inversor a una fecha dada, sin tocar nada.
 * Es el mismo cálculo que ejecuta `devolverYCerrarInstrumento`.
 */
export async function previsualizarDevolucion(
  instrumentoId: string,
  fechaPago: string,
): Promise<DevolucionResult> {
  await requireUser()
  const supabase = await createClient()
  const r = await armarDevolucion(supabase, instrumentoId, fechaPago)
  if (!r.ok) return r
  return { ok: true, detalle: r.detalle }
}

/**
 * Devuelve la plata al inversor y cierra el instrumento.
 *
 * - Los meses ya cerrados no se tocan; los abiertos se reescriben encadenados.
 * - El saldo queda en CERO exacto en el mes del pago.
 * - El instrumento pasa a 'cerrado' y su vencimiento queda en la fecha de corte.
 *
 * La salida de plata no se registra acá a propósito: devolver capital no es un gasto,
 * es que baja una deuda. Se refleja en Tesorería al cargar el saldo de fin de mes.
 */
export async function devolverYCerrarInstrumento(
  instrumentoId: string,
  fechaPago: string,
): Promise<DevolucionResult> {
  await requireUser()
  const supabase = await createClient()

  const r = await armarDevolucion(supabase, instrumentoId, fechaPago)
  if (!r.ok) return r
  const { detalle, filas } = r

  // La plata que sale queda como un movimiento más, con su día y su motivo. Se borra el
  // de una devolución anterior (puede haber quedado de reabrir y rehacer) para no
  // duplicarlo. Cae el día del vencimiento, así que no toca el interés del ciclo.
  await supabase
    .from('movimientos_instrumento')
    .delete()
    .eq('instrumento_id', instrumentoId)
    .eq('origen', 'devolucion_cierre')

  const { error: errMov } = await supabase.from('movimientos_instrumento').insert({
    instrumento_id: instrumentoId,
    mes: detalle.mesDevolucion,
    fecha: detalle.fechaPago,
    monto: -detalle.totalADevolver,
    motivo: 'devolucion',
    nota: `Capital ${detalle.capitalPendiente.toFixed(2)} + intereses ${detalle.interesesCiclo.toFixed(2)}.`,
    origen: 'devolucion_cierre',
  })
  if (errMov) return { ok: false, error: `No se pudo guardar el movimiento: ${errMov.message}` }

  // Reescribir los períodos abiertos (los cerrados quedan intactos)
  const { error: errDel } = await supabase
    .from('periodos_instrumento')
    .delete()
    .eq('instrumento_id', instrumentoId)
    .eq('cerrado', false)
  if (errDel) return { ok: false, error: `No se pudieron actualizar los períodos: ${errDel.message}` }

  const rows = filas
    .filter((f) => !f.cerrado)
    .map((f) => ({
      instrumento_id: instrumentoId,
      mes: f.mes,
      saldo_inicio: f.saldo_inicio,
      interes_devengado: f.interes_devengado,
      int_inicio_prorrateado: 0,
      int_fin_prorrateado: 0,
      movimiento: f.movimiento,
      // El día del pago queda en la fila, no solo en las notas: de ahí lo lee el
      // comprobante. No afecta el interés (cae fuera del ciclo, que corta ese día).
      fecha_movimiento: f.mes === detalle.mesDevolucion ? detalle.fechaPago : null,
      saldo_cierre: f.saldo_cierre,
      cerrado: false,
    }))
  if (rows.length > 0) {
    const { error: errIns } = await supabase.from('periodos_instrumento').insert(rows)
    if (errIns) return { ok: false, error: `No se pudieron guardar los períodos: ${errIns.message}` }
  }

  const nota = `[${fechaPago}] Devuelto y cerrado. Capital ${detalle.capitalPendiente.toFixed(2)} + intereses ${detalle.interesesCiclo.toFixed(2)} = ${detalle.totalADevolver.toFixed(2)} ${detalle.moneda}${detalle.anticipada ? ' (devolución anticipada, intereses prorrateados)' : ''}.`
  const { data: instNotas } = await supabase
    .from('instrumentos_inversion')
    .select('notas')
    .eq('id', instrumentoId)
    .single()

  const { error: errInst } = await supabase
    .from('instrumentos_inversion')
    .update({
      estado: 'cerrado',
      fecha_fin: detalle.fechaCorte,
      notas: instNotas?.notas ? `${instNotas.notas}\n${nota}` : nota,
    })
    .eq('id', instrumentoId)
  if (errInst) return { ok: false, error: `No se pudo cerrar el instrumento: ${errInst.message}` }

  revalidatePath('/inversiones')
  revalidatePath('/inversiones/cierre')
  revalidatePath('/inversiones/gastos')
  revalidatePath('/finanzas/cierre-mes')

  return { ok: true, detalle }
}

// ============ TRAMOS DE TASA ============

const tramoSchema = z.object({
  instrumento_id: z.string().uuid(),
  tasa_mensual: z.coerce.number().min(0),
  fecha_desde: z.string().min(1),
  notas: z.string().optional().nullable(),
})

export async function agregarTramoTasa(prevState: string | null, formData: FormData) {
  await requireUser()
  const result = tramoSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()

  // Verificar que no exista un tramo con la misma fecha_desde (UNIQUE constraint)
  const { data: existe } = await supabase
    .from('tramos_tasa')
    .select('id')
    .eq('instrumento_id', result.data.instrumento_id)
    .eq('fecha_desde', result.data.fecha_desde)
    .maybeSingle()
  if (existe) return 'Ya existe un tramo con esa fecha. Elegí otra fecha.'

  const { error } = await supabase.from('tramos_tasa').insert({
    ...result.data,
    notas: result.data.notas || null,
  })
  if (error) return error.message

  // Recalcular períodos abiertos
  await regenerarPeriodosDB(supabase, result.data.instrumento_id)

  // Obtener inversor_id para revalidar
  const { data: inst } = await supabase
    .from('instrumentos_inversion')
    .select('inversor_id')
    .eq('id', result.data.instrumento_id)
    .single()

  revalidatePath('/inversiones')
  if (inst) revalidatePath(`/inversiones/${inst.inversor_id}`)
  revalidatePath('/inversiones/cierre')
  revalidatePath('/inversiones/gastos')
  return null
}

export async function deleteTramoTasa(id: string) {
  await requireUser()
  const supabase = await createClient()
  const { data: tramo } = await supabase.from('tramos_tasa').select('instrumento_id').eq('id', id).single()
  if (!tramo) throw new Error('Tramo no encontrado')

  // Verificar que no sea el único tramo
  const { count } = await supabase
    .from('tramos_tasa')
    .select('*', { count: 'exact', head: true })
    .eq('instrumento_id', tramo.instrumento_id)
  if ((count ?? 0) <= 1) throw new Error('No se puede eliminar el único tramo del instrumento')

  const { error } = await supabase.from('tramos_tasa').delete().eq('id', id)
  if (error) throw new Error(error.message)

  await regenerarPeriodosDB(supabase, tramo.instrumento_id)

  revalidatePath('/inversiones')
}

// ============ PERIODOS ============

// ============ MOVIMIENTOS DE PLATA ============
//
// Antes había dos caminos para cargar un retiro y solo uno guardaba el día. El que
// estaba más a mano (el lápiz de la grilla de cierre) no lo pedía, y sin día el interés
// no se ajusta: se le terminaba pagando de más al inversor por plata que ya se había
// llevado. Ahora hay un solo camino y el día es obligatorio.

export type MovimientoResult = { ok: true } | { ok: false; error: string }

const movimientoSchema = z.object({
  instrumentoId: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Falta el día del movimiento'),
  monto: z.number().refine((n) => n !== 0, 'El monto no puede ser cero'),
  motivo: z.enum(['retiro_parcial', 'aporte_nuevo', 'devolucion', 'ajuste']),
  nota: z.string().optional().nullable(),
})

/**
 * Chequea todo lo que tiene que dar bien para poder cargar (o mover) un movimiento.
 * `ignorarId` sirve al editar: el movimiento que se está tocando no cuenta contra el tope.
 */
async function validarMovimiento(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: { instrumentoId: string; fecha: string; monto: number; ignorarId?: string },
): Promise<{ ok: true; mes: string } | { ok: false; error: string }> {
  const mes = args.fecha.substring(0, 7)

  const { data: inst } = await supabase
    .from('instrumentos_inversion')
    .select('id, estado, fecha_inicio, fecha_fin, capital_inicial')
    .eq('id', args.instrumentoId)
    .single()
  if (!inst) return { ok: false, error: 'No se encontró el plazo fijo.' }
  if (inst.estado !== 'activo') {
    return { ok: false, error: 'Este plazo fijo ya está cerrado. No se le pueden cargar movimientos.' }
  }

  // El día tiene que caer dentro del plazo. El día del vencimiento no cuenta: ese día
  // ya arranca el ciclo siguiente.
  if (args.fecha < inst.fecha_inicio) {
    return { ok: false, error: `El plazo fijo arrancó el ${fmtDia(inst.fecha_inicio)}. No se puede mover plata antes de esa fecha.` }
  }
  if (inst.fecha_fin && args.fecha >= inst.fecha_fin) {
    return { ok: false, error: `El plazo fijo vence el ${fmtDia(inst.fecha_fin)}. Para cerrarlo usá "Devolver y cerrar".` }
  }

  const { data: periodos } = await supabase
    .from('periodos_instrumento')
    .select('mes, saldo_inicio, interes_devengado, cerrado')
    .eq('instrumento_id', args.instrumentoId)
    .order('mes')

  // El mes del movimiento no puede estar cerrado: es una foto contable ya publicada.
  const periodoDelMes = (periodos ?? []).find((p) => p.mes === mes)
  if (periodoDelMes?.cerrado) {
    return {
      ok: false,
      error: `El mes de ${mes} ya está cerrado. Reabrilo desde Inversiones → Cierre mensual y volvé a cargar el movimiento.`,
    }
  }

  // Y tampoco puede haber meses cerrados DESPUÉS: el movimiento les cambiaría el
  // interés y esos meses no se vuelven a calcular, así que quedarían mal en silencio.
  const cerradosPosteriores = (periodos ?? []).filter((p) => p.cerrado && p.mes > mes).map((p) => p.mes)
  if (cerradosPosteriores.length > 0) {
    return {
      ok: false,
      error:
        `Hay meses ya cerrados después de ese día (${cerradosPosteriores.join(', ')}). ` +
        'Reabrilos desde Inversiones → Cierre mensual, si no el interés de esos meses queda mal.',
    }
  }

  // Si saca plata, que no saque más de la que hay.
  if (args.monto < 0) {
    let q = supabase
      .from('movimientos_instrumento')
      .select('monto')
      .eq('instrumento_id', args.instrumentoId)
      .lte('mes', mes)
    if (args.ignorarId) q = q.neq('id', args.ignorarId)
    const { data: previos } = await q
    const movidoAntes = (previos ?? []).reduce((s, m) => s + Number(m.monto), 0)
    const tope = periodoDelMes
      ? Number(periodoDelMes.saldo_inicio) + Number(periodoDelMes.interes_devengado)
      : Number(inst.capital_inicial) + movidoAntes
    if (Math.abs(args.monto) > tope + 0.01) {
      return { ok: false, error: `Estás sacando más de lo que hay en el plazo fijo. Como mucho podés sacar ${tope.toFixed(2)}.` }
    }
  }

  return { ok: true, mes }
}

function fmtDia(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

async function refrescarInversiones(supabase: Awaited<ReturnType<typeof createClient>>, instrumentoId: string) {
  await regenerarPeriodosDB(supabase, instrumentoId)
  const { data: inst } = await supabase
    .from('instrumentos_inversion')
    .select('inversor_id')
    .eq('id', instrumentoId)
    .single()
  revalidatePath('/inversiones')
  if (inst?.inversor_id) revalidatePath(`/inversiones/${inst.inversor_id}`)
  revalidatePath('/inversiones/cierre')
  revalidatePath('/inversiones/gastos')
  revalidatePath('/finanzas/cierre-mes')
}

export async function crearMovimiento(args: {
  instrumentoId: string
  fecha: string
  monto: number
  motivo: MotivoMovimiento
  nota?: string | null
}): Promise<MovimientoResult> {
  await requireUser()
  const parsed = movimientoSchema.safeParse(args)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const check = await validarMovimiento(supabase, args)
  if (!check.ok) return check

  const { error } = await supabase.from('movimientos_instrumento').insert({
    instrumento_id: args.instrumentoId,
    mes: check.mes,
    fecha: args.fecha,
    monto: args.monto,
    motivo: args.motivo,
    nota: blank(args.nota),
    origen: 'manual',
  })
  if (error) return { ok: false, error: `No se pudo guardar el movimiento: ${error.message}` }

  await refrescarInversiones(supabase, args.instrumentoId)
  return { ok: true }
}

export async function editarMovimiento(
  id: string,
  patch: { fecha: string; monto: number; motivo: MotivoMovimiento; nota?: string | null },
): Promise<MovimientoResult> {
  await requireUser()
  const supabase = await createClient()

  const { data: actual } = await supabase
    .from('movimientos_instrumento')
    .select('id, instrumento_id, mes, origen')
    .eq('id', id)
    .single()
  if (!actual) return { ok: false, error: 'No se encontró el movimiento.' }
  if (actual.origen === 'devolucion_cierre') {
    return { ok: false, error: 'Este movimiento lo generó "Devolver y cerrar". Para cambiarlo hay que reabrir el mes y volver a hacer la devolución.' }
  }

  const parsed = movimientoSchema.safeParse({ ...patch, instrumentoId: actual.instrumento_id })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  // Se chequea contra el mes nuevo, y aparte que el mes viejo tampoco esté cerrado:
  // sacar un movimiento de un mes publicado le cambiaría el número.
  const check = await validarMovimiento(supabase, {
    instrumentoId: actual.instrumento_id,
    fecha: patch.fecha,
    monto: patch.monto,
    ignorarId: id,
  })
  if (!check.ok) return check

  if (check.mes !== actual.mes) {
    const { data: viejo } = await supabase
      .from('periodos_instrumento')
      .select('cerrado')
      .eq('instrumento_id', actual.instrumento_id)
      .eq('mes', actual.mes)
      .maybeSingle()
    if (viejo?.cerrado) {
      return { ok: false, error: `El movimiento está en ${actual.mes}, que ya está cerrado. Reabrí ese mes antes de moverlo.` }
    }
  }

  const { error } = await supabase
    .from('movimientos_instrumento')
    .update({
      fecha: patch.fecha,
      mes: check.mes,
      monto: patch.monto,
      motivo: patch.motivo,
      nota: blank(patch.nota),
    })
    .eq('id', id)
  if (error) return { ok: false, error: `No se pudo guardar el cambio: ${error.message}` }

  await refrescarInversiones(supabase, actual.instrumento_id)
  return { ok: true }
}

export async function borrarMovimiento(id: string): Promise<MovimientoResult> {
  await requireUser()
  const supabase = await createClient()

  const { data: mov } = await supabase
    .from('movimientos_instrumento')
    .select('id, instrumento_id, mes, origen')
    .eq('id', id)
    .single()
  if (!mov) return { ok: false, error: 'No se encontró el movimiento.' }
  if (mov.origen === 'devolucion_cierre') {
    return { ok: false, error: 'Este movimiento lo generó "Devolver y cerrar". No se borra a mano: hay que reabrir el mes y rehacer la devolución.' }
  }

  const { data: periodos } = await supabase
    .from('periodos_instrumento')
    .select('mes, cerrado')
    .eq('instrumento_id', mov.instrumento_id)
    .eq('cerrado', true)
  const bloqueantes = (periodos ?? []).filter((p) => p.mes >= mov.mes).map((p) => p.mes)
  if (bloqueantes.length > 0) {
    return {
      ok: false,
      error: `No se puede borrar: ${bloqueantes.join(', ')} ya está cerrado y el número quedaría mal. Reabrilo desde Inversiones → Cierre mensual.`,
    }
  }

  const { error } = await supabase.from('movimientos_instrumento').delete().eq('id', id)
  if (error) return { ok: false, error: `No se pudo borrar: ${error.message}` }

  await refrescarInversiones(supabase, mov.instrumento_id)
  return { ok: true }
}

/**
 * Los períodos no nacen solos: se generan cuando alguien toca el instrumento. Si nadie
 * lo toca, el mes nuevo simplemente no existe y el cierre lo pasa por alto en silencio.
 * Esto genera los que faltan para un mes: recorre los instrumentos que están DENTRO de
 * su plazo y regenera los que no tienen fila en ese mes.
 *
 * A los vencidos no se les genera nada a propósito: un PF que terminó no devenga solo,
 * hay que renovarlo o devolver la plata. La pantalla de cierre los muestra aparte.
 */
export async function generarPeriodosDelMes(mes: string): Promise<{ generados: number; sinNovedad: number }> {
  await requireUser()
  const supabase = await createClient()

  const { data: instrumentos } = await supabase
    .from('instrumentos_inversion')
    .select('id, estado, fecha_inicio, fecha_fin')
    .eq('estado', 'activo')

  const dentro = (instrumentos ?? []).filter((i) => situacionEnMes(i, mes) === 'dentro')
  if (dentro.length === 0) return { generados: 0, sinNovedad: 0 }

  const { data: yaTienen } = await supabase
    .from('periodos_instrumento')
    .select('instrumento_id')
    .eq('mes', mes)
    .in('instrumento_id', dentro.map((i) => i.id))
  const conFila = new Set((yaTienen ?? []).map((p) => p.instrumento_id))

  const faltan = dentro.filter((i) => !conFila.has(i.id))
  for (const inst of faltan) {
    await regenerarPeriodosDB(supabase, inst.id)
  }

  revalidatePath('/inversiones/cierre')
  revalidatePath('/inversiones')
  return { generados: faltan.length, sinNovedad: dentro.length - faltan.length }
}

/** Cierre masivo por mes. La pantalla NO lo usa: cierra fila por fila con
 * `cerrarPeriodoYCrearGasto`, que además genera el gasto financiero. */
export async function cerrarPeriodos(mes: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('periodos_instrumento')
    .update({ cerrado: true, fecha_cierre: new Date().toISOString() })
    .eq('mes', mes)
    .eq('cerrado', false)
  if (error) throw new Error(error.message)
  revalidatePath('/inversiones/cierre')
  revalidatePath('/inversiones/gastos')
}

export async function reabrirPeriodos(mes: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('periodos_instrumento')
    .update({ cerrado: false, fecha_cierre: null })
    .eq('mes', mes)
  if (error) throw new Error(error.message)
  revalidatePath('/inversiones/cierre')
}

// ============================================================
// Cierre individual de período con generación automática de gasto
// ============================================================

export interface CerrarPeriodoResult {
  ok: boolean
  gastoId?: string
  montoArs?: number
  montoOrigen?: number
  monedaOrigen?: 'ARS' | 'USD'
  tipoCambio?: number
  error?: string
}

/**
 * Cierra un período individual y crea automáticamente un gasto financiero asociado.
 *
 * Reglas:
 * - El interés del período se convierte a ARS al TC del mes (tipos_cambio_mes) si el instrumento es USD.
 * - El gasto hereda el prorrateo entre marcas desde configuracion_prorrateo.
 * - Subcategoría: 'inversores_privados' o 'creditos_bancarios' según instrumento.tipo.
 * - El gasto queda PENDIENTE; el medio de pago se elige al pagarlo.
 * - El partial UNIQUE index en gastos.periodo_instrumento_id garantiza idempotencia a nivel DB.
 */
export async function cerrarPeriodoYCrearGasto(periodoId: string): Promise<CerrarPeriodoResult> {
  await requireUser()
  const supabase = await createClient()

  // 1. Cargar período + instrumento + inversor
  const { data: periodo, error: errPeriodo } = await supabase
    .from('periodos_instrumento')
    .select(`
      id, mes, interes_devengado, cerrado, instrumento_id,
      instrumento:instrumentos_inversion(
        id, codigo, moneda, tipo, acreedor_nombre, inversor:inversores(id, nombre)
      )
    `)
    .eq('id', periodoId)
    .single()

  if (errPeriodo || !periodo) {
    return { ok: false, error: 'No se encontró el período' }
  }

  const inst = Array.isArray(periodo.instrumento) ? periodo.instrumento[0] : periodo.instrumento
  if (!inst) {
    return { ok: false, error: 'El período no tiene instrumento asociado' }
  }

  // 2. Validaciones de estado
  if (periodo.cerrado) {
    return { ok: false, error: 'El período ya está cerrado' }
  }
  if (periodo.interes_devengado === null || periodo.interes_devengado === undefined) {
    return { ok: false, error: 'El período no tiene interés calculado' }
  }

  const interes = Number(periodo.interes_devengado)
  const moneda = inst.moneda as 'ARS' | 'USD'
  const tipoInstrumento = (inst.tipo ?? 'INVERSION_PRIVADA') as 'INVERSION_PRIVADA' | 'CREDITO_BANCARIO'

  // 3. Validar que no exista ya un gasto para este período (idempotencia)
  const { data: gastoExistente } = await supabase
    .from('gastos')
    .select('id')
    .eq('periodo_instrumento_id', periodoId)
    .maybeSingle()
  if (gastoExistente) {
    return { ok: false, error: `Este período ya tiene gasto registrado (ref: ${gastoExistente.id.substring(0, 8)})` }
  }

  // 4. Calcular monto en ARS (convertir si moneda=USD)
  let montoArs = interes
  let tcAplicado: number | null = null

  if (moneda === 'USD') {
    const { data: tc } = await supabase
      .from('tipos_cambio_mes')
      .select('tipo_cambio')
      .eq('mes', periodo.mes)
      .maybeSingle()

    if (!tc) {
      return {
        ok: false,
        error: `Falta cargar el tipo de cambio del mes ${periodo.mes}. Cargalo en /finanzas/saldos y volvé a intentar.`,
      }
    }
    tcAplicado = Number(tc.tipo_cambio)
    montoArs = Math.round(interes * tcAplicado * 100) / 100
  }

  // 5. Resolver subcategoría
  const slugSubcategoria = tipoInstrumento === 'CREDITO_BANCARIO' ? 'creditos_bancarios' : 'inversores_privados'
  const { data: subcategoria } = await supabase
    .from('gastos_subcategorias')
    .select('id')
    .eq('slug', slugSubcategoria)
    .maybeSingle()

  if (!subcategoria) {
    return { ok: false, error: `No se encontró la subcategoría "${slugSubcategoria}". Aplicá la migración 033.` }
  }

  // 6. Leer configuración de prorrateo activa → construir JSON
  const { data: prorrateoConfig } = await supabase
    .from('configuracion_prorrateo')
    .select('marca, porcentaje')
    .eq('activo', true)

  const prorrateo = prorrateoConfig && prorrateoConfig.length > 0
    ? Object.fromEntries(prorrateoConfig.map((p) => [p.marca, Number(p.porcentaje)]))
    : null

  // 7. Calcular fecha (último día del mes del período)
  const [yearStr, monthStr] = periodo.mes.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const ultimoDia = new Date(year, month, 0).getDate()
  const fechaGasto = `${periodo.mes}-${String(ultimoDia).padStart(2, '0')}`

  // 8. Concepto descriptivo
  const inversor = Array.isArray(inst.inversor) ? inst.inversor[0] : inst.inversor
  const nombreAcreedor = tipoInstrumento === 'CREDITO_BANCARIO'
    ? (inst.acreedor_nombre || inversor?.nombre || 'Banco s/d')
    : (inversor?.nombre || 'Inversor s/d')
  const concepto = `Interés ${nombreAcreedor} — ${periodo.mes}`

  // 9. Crear el gasto auto-generado
  const insertData: Record<string, unknown> = {
    categoria: 'Gastos Financieros',
    subcategoria_id: subcategoria.id,
    concepto,
    monto: montoArs,
    monto_neto: montoArs,
    moneda: 'ARS',
    iva_incluido: false,
    porcentaje_iva: 0,
    negocio: 'GENERAL',
    mes: periodo.mes,
    fecha: fechaGasto,
    // Costo devengado, NO salida de caja: el interés nunca se paga como tal
    // (la caja se mueve solo cuando el inversor retira capital). Por eso nace
    // DEVENGADO y no PENDIENTE, para no ensuciar Tesorería con "por pagar" fantasma.
    estado: 'DEVENGADO',
    confirmado: true,
    prorrateo,
    instrumento_id: inst.id,
    periodo_instrumento_id: periodo.id,
    auto_generado: true,
    generado_desde: 'INVERSION_CIERRE',
    cuotas_total: 1,
    notas: `Auto-generado al cerrar período de inversión (${inst.codigo ?? inst.id.substring(0, 8)})`,
  }

  if (moneda === 'USD' && tcAplicado) {
    insertData.monto_origen = interes
    insertData.moneda_origen = 'USD'
    insertData.tipo_cambio_aplicado = tcAplicado
  }

  const { data: nuevoGasto, error: errInsert } = await supabase
    .from('gastos')
    .insert(insertData)
    .select('id')
    .single()

  if (errInsert || !nuevoGasto) {
    return { ok: false, error: `Error al crear el gasto: ${errInsert?.message ?? 'desconocido'}` }
  }

  // 10. Cerrar el período
  const { error: errCerrar } = await supabase
    .from('periodos_instrumento')
    .update({ cerrado: true, fecha_cierre: new Date().toISOString() })
    .eq('id', periodo.id)

  if (errCerrar) {
    // Compensación: borrar el gasto recién creado para no dejar inconsistencia
    await supabase.from('gastos').delete().eq('id', nuevoGasto.id)
    return { ok: false, error: `Error al cerrar el período (gasto revertido): ${errCerrar.message}` }
  }

  // Cerrado el mes de este instrumento, dejarle listo el siguiente. El motor nunca
  // devenga futuro: si el mes que viene todavía no llegó, esto no crea nada y el
  // período nace cuando el calendario lo alcanza. A un plazo ya vencido tampoco le
  // genera nada — ese hay que renovarlo o devolverlo.
  await regenerarPeriodosDB(supabase, periodo.instrumento_id)

  revalidatePath('/inversiones/cierre')
  revalidatePath('/inversiones')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/cierre-mes')

  return {
    ok: true,
    gastoId: nuevoGasto.id,
    montoArs,
    montoOrigen: interes,
    monedaOrigen: moneda,
    tipoCambio: tcAplicado ?? undefined,
  }
}
