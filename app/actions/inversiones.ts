'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { generarPeriodos, getCurrentMonth } from '@/lib/inversiones-calc'

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

  // Cargar movimientos existentes para preservarlos
  const { data: existentes } = await supabase
    .from('periodos_instrumento')
    .select('mes, movimiento, cerrado')
    .eq('instrumento_id', instrumentoId)
  const movs: Record<string, number> = {}
  const cerrados = new Set<string>()
  for (const p of existentes ?? []) {
    if (p.movimiento && p.movimiento !== 0) movs[p.mes] = Number(p.movimiento)
    if (p.cerrado) cerrados.add(p.mes)
  }

  const hasta = inst.fecha_fin && inst.fecha_fin <= getCurrentMonthBoundary()
    ? inst.fecha_fin.substring(0, 7)
    : getCurrentMonth()

  const periodos = generarPeriodos({
    capitalInicial: Number(inst.capital_inicial),
    fechaInicio: inst.fecha_inicio,
    fechaFin: inst.fecha_fin,
    capitalizable: inst.capitalizable,
    hasta,
    movimientosByMes: movs,
    tramos: tramosArr,
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
      movimiento: p.movimiento,
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
  | { ok: true; capitalAnterior: number; capitalNuevo: number; fechaInicio: string; fechaFin: string }
  | { ok: false; error: string }

/**
 * Renueva un instrumento de inversión sobre sí mismo:
 * 1) Calcula el saldo final del ciclo actual (capital + intereses devengados de períodos cerrados)
 * 2) Actualiza el instrumento con: capital_inicial = saldo final, fecha_inicio = fecha_fin actual, fecha_fin = nueva + plazo_dias
 * 3) Regenera períodos (los cerrados se preservan)
 *
 * Requiere que NO haya períodos abiertos (todos cerrados).
 */
export async function renovarInstrumento(instrumentoId: string): Promise<RenovarResult> {
  await requireUser()
  const supabase = await createClient()

  // 1. Cargar instrumento
  const { data: inst, error: errInst } = await supabase
    .from('instrumentos_inversion')
    .select('id, capital_inicial, fecha_inicio, fecha_fin, plazo_dias, estado, capitalizable, notas')
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
  if (!inst.plazo_dias) {
    return { ok: false, error: 'El instrumento no tiene plazo en días (plazo_dias). Configuralo antes de renovar.' }
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
  const fechaInicioDate = new Date(`${nuevaFechaInicio}T00:00:00Z`)
  const nuevaFechaFinDate = new Date(fechaInicioDate)
  nuevaFechaFinDate.setUTCDate(nuevaFechaFinDate.getUTCDate() + Number(inst.plazo_dias))
  const nuevaFechaFin = nuevaFechaFinDate.toISOString().substring(0, 10)

  // 6. Update instrumento
  const hoyISO = new Date().toISOString().substring(0, 10)
  const notaRenovacion = `[${hoyISO}] Renovado. Capital anterior: $${capitalAnterior.toFixed(2)} → Nuevo: $${capitalNuevo.toFixed(2)}. Periodo: ${nuevaFechaInicio} → ${nuevaFechaFin}.`
  const nuevasNotas = inst.notas ? `${inst.notas}\n${notaRenovacion}` : notaRenovacion

  const { error: errUpdate } = await supabase
    .from('instrumentos_inversion')
    .update({
      capital_inicial: capitalNuevo,
      fecha_inicio: nuevaFechaInicio,
      fecha_fin: nuevaFechaFin,
      notas: nuevasNotas,
    })
    .eq('id', instrumentoId)

  if (errUpdate) {
    return { ok: false, error: `Error actualizando instrumento: ${errUpdate.message}` }
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
  }
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

export async function actualizarMovimientoPeriodo(periodoId: string, movimiento: number) {
  await requireUser()
  const supabase = await createClient()
  const { data: p } = await supabase.from('periodos_instrumento').select('*, instrumento:instrumentos_inversion(*)').eq('id', periodoId).single()
  if (!p) throw new Error('Período no encontrado')

  const inst = (p as { instrumento: { capitalizable: boolean } }).instrumento
  const saldoCierre = inst.capitalizable
    ? Number(p.saldo_inicio) + Number(p.interes_devengado) + movimiento
    : Number(p.saldo_inicio) + movimiento

  const { error } = await supabase.from('periodos_instrumento').update({
    movimiento,
    saldo_cierre: Math.round(saldoCierre * 100) / 100,
  }).eq('id', periodoId)
  if (error) throw new Error(error.message)

  // Si capitalizable, los periodos siguientes (no cerrados) deben recalcularse
  if (inst.capitalizable) {
    await regenerarPeriodosDB(supabase, p.instrumento_id)
  }

  revalidatePath('/inversiones/cierre')
  revalidatePath('/inversiones')
}

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

/**
 * Aplica un movimiento simulado al período del mes correspondiente.
 * Si es RETIRO_TOTAL, además marca el instrumento como cerrado y setea fecha_fin.
 */
export async function aplicarMovimientoSimulado(args: {
  instrumentoId: string
  mes: string
  tipoMovimiento: 'RETIRO_PARCIAL' | 'RETIRO_TOTAL' | 'INGRESO'
  fechaMovimiento: string
  monto: number
}) {
  await requireUser()
  const supabase = await createClient()

  const { data: inst } = await supabase
    .from('instrumentos_inversion')
    .select('*')
    .eq('id', args.instrumentoId)
    .single()
  if (!inst) throw new Error('Instrumento no encontrado')

  const { data: periodo } = await supabase
    .from('periodos_instrumento')
    .select('*')
    .eq('instrumento_id', args.instrumentoId)
    .eq('mes', args.mes)
    .single()
  if (!periodo) throw new Error('No existe período para este mes')
  if (periodo.cerrado) throw new Error('El período ya está cerrado')

  // Validar monto si es retiro
  if (args.tipoMovimiento !== 'INGRESO') {
    if (args.tipoMovimiento === 'RETIRO_TOTAL') {
      // El RETIRO_TOTAL debe vaciar el período: retirar saldo_inicio + interes_devengado
      // para que saldo_cierre quede en 0. Antes solo retiraba saldo_inicio y dejaba el
      // interés como residual.
      args.monto = Number(periodo.saldo_inicio) + Number(periodo.interes_devengado)
    }
    const tope = Number(periodo.saldo_inicio) + Number(periodo.interes_devengado)
    if (args.monto > tope) {
      throw new Error('El monto supera el saldo disponible (capital + interés del período)')
    }
  }

  const signedMov = args.tipoMovimiento === 'INGRESO' ? args.monto : -args.monto

  // Para RETIRO_TOTAL → cerrar instrumento y fijar fecha_fin
  if (args.tipoMovimiento === 'RETIRO_TOTAL') {
    const { error: errInst } = await supabase
      .from('instrumentos_inversion')
      .update({
        estado: 'cerrado',
        fecha_fin: args.fechaMovimiento,
      })
      .eq('id', args.instrumentoId)
    if (errInst) throw new Error(errInst.message)
  }

  // Actualizar movimiento del período (regenerarPeriodosDB usa este movimiento)
  const { error: errPeriodo } = await supabase
    .from('periodos_instrumento')
    .update({ movimiento: signedMov })
    .eq('id', periodo.id)
  if (errPeriodo) throw new Error(errPeriodo.message)

  // Recalcular todos los períodos abiertos (esto recalcula intereses con el nuevo movimiento)
  await regenerarPeriodosDB(supabase, args.instrumentoId)

  revalidatePath('/inversiones')
  revalidatePath(`/inversiones/${inst.inversor_id}`)
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
