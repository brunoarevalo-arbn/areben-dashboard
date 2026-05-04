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
})

export async function createInversor(prevState: string | null, formData: FormData) {
  await requireUser()
  const result = inversorSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message
  const supabase = await createClient()
  const { error } = await supabase.from('inversores').insert({
    ...result.data,
    notas: result.data.notas || null,
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
    ...result.data,
    notas: result.data.notas || null,
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
      args.monto = Number(periodo.saldo_inicio)
    }
    if (args.monto > Number(periodo.saldo_inicio)) {
      throw new Error('El monto supera el saldo disponible')
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
