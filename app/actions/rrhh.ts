'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// ============ EMPLEADOS ============

const empleadoSchema = z.object({
  nombre: z.string().min(1),
  apellido: z.string().min(1),
  dni: z.string().min(1),
  email: z.string().email().optional().nullable().or(z.literal('')),
  telefono: z.string().optional().nullable(),
  tipo_empleado: z.enum(['BLANCO', 'NEGRO']),
  sueldo_basico: z.coerce.number().min(0),
  valor_hora: z.coerce.number().min(0),
  cbu: z.string().optional().nullable(),
  banco: z.string().optional().nullable(),
  metodo_pago: z.enum(['EFECTIVO', 'TRANSFERENCIA']).optional().nullable(),
  fecha_ingreso: z.string().min(1),
  fecha_nacimiento: z.string().optional().nullable(),
})

export async function createEmpleado(prevState: string | null, formData: FormData) {
  const raw = Object.fromEntries(formData)
  const result = empleadoSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('empleados')
    .select('id')
    .eq('dni', result.data.dni)
    .maybeSingle()
  if (existing) return 'Ya existe un empleado con ese DNI.'

  const { error } = await supabase.from('empleados').insert({
    ...result.data,
    email: result.data.email || null,
    telefono: result.data.telefono || null,
    cbu: result.data.cbu || null,
    banco: result.data.banco || null,
    metodo_pago: result.data.metodo_pago || null,
    fecha_nacimiento: result.data.fecha_nacimiento || null,
    activo: true,
  })
  if (error) return error.message

  revalidatePath('/rrhh/empleados')
  revalidatePath('/')
  return null
}

export async function updateEmpleado(id: string, prevState: string | null, formData: FormData) {
  const raw = Object.fromEntries(formData)
  const result = empleadoSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('empleados').update({
    ...result.data,
    email: result.data.email || null,
    telefono: result.data.telefono || null,
    cbu: result.data.cbu || null,
    banco: result.data.banco || null,
    metodo_pago: result.data.metodo_pago || null,
    fecha_nacimiento: result.data.fecha_nacimiento || null,
  }).eq('id', id)
  if (error) return error.message

  revalidatePath('/rrhh/empleados')
  return null
}

export async function toggleEmpleadoActivo(id: string, activo: boolean) {
  const supabase = await createClient()
  const updates: { activo: boolean; fecha_egreso?: string | null } = { activo }
  if (!activo) updates.fecha_egreso = new Date().toISOString().split('T')[0]
  else updates.fecha_egreso = null

  const { error } = await supabase.from('empleados').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/rrhh/empleados')
}

// ============ NÓMINA ============

export async function calcularNomina(empleadoId: string, mes: string) {
  const supabase = await createClient()

  const { data: empleado } = await supabase
    .from('empleados')
    .select('*')
    .eq('id', empleadoId)
    .single()

  const { data: aportes } = await supabase
    .from('configuracion_aportes')
    .select('*')
    .eq('activo', true)
    .or(`aplicable_a.eq.AMBOS,aplicable_a.eq.${empleado?.tipo_empleado ?? 'NEGRO'}`)
    .order('orden')

  return { empleado, aportes: aportes ?? [] }
}

const nominaSchema = z.object({
  empleado_id: z.string().uuid(),
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  sueldo_basico: z.coerce.number().min(0),
  horas_trabajadas: z.coerce.number().min(0),
  valor_hora: z.coerce.number().min(0),
  horas_extras: z.coerce.number().min(0),
  comida: z.coerce.number().min(0),
  aguinaldo: z.coerce.number().min(0),
  notas: z.string().optional().nullable(),
})

export async function createNomina(prevState: string | null, formData: FormData) {
  const raw = Object.fromEntries(formData)
  const result = nominaSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('nomina_mensual')
    .select('id')
    .eq('empleado_id', result.data.empleado_id)
    .eq('mes', result.data.mes)
    .maybeSingle()
  if (existing) return 'Ya existe nómina para este empleado en este mes.'

  const { data: empleado } = await supabase
    .from('empleados')
    .select('tipo_empleado')
    .eq('id', result.data.empleado_id)
    .single()

  const { data: aportes } = await supabase
    .from('configuracion_aportes')
    .select('*')
    .eq('activo', true)
    .or(`aplicable_a.eq.AMBOS,aplicable_a.eq.${empleado?.tipo_empleado ?? 'NEGRO'}`)

  const d = result.data
  const sueldo_horas = d.horas_trabajadas * d.valor_hora
  const horas_extras_monto = d.horas_extras * d.valor_hora * 1.5
  const subtotal = d.sueldo_basico + sueldo_horas + horas_extras_monto + d.comida + d.aguinaldo

  let aportes_empleado = 0
  let aportes_patronales = 0

  for (const aporte of aportes ?? []) {
    const monto = aporte.tipo === 'PORCENTAJE' ? (subtotal * aporte.valor) / 100 : aporte.valor
    if (aporte.es_patronal) aportes_patronales += monto
    else aportes_empleado += monto
  }

  const neto = subtotal - aportes_empleado
  const costo_empresa = subtotal + aportes_patronales

  const { error } = await supabase.from('nomina_mensual').insert({
    empleado_id: d.empleado_id,
    mes: d.mes,
    sueldo_basico: d.sueldo_basico,
    horas_trabajadas: d.horas_trabajadas,
    valor_hora: d.valor_hora,
    horas_extras: d.horas_extras,
    comida: d.comida,
    aguinaldo: d.aguinaldo,
    aportes_empleado: Math.round(aportes_empleado * 100) / 100,
    aportes_patronales: Math.round(aportes_patronales * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    neto: Math.round(neto * 100) / 100,
    costo_empresa: Math.round(costo_empresa * 100) / 100,
    estado: 'PENDIENTE',
    notas: d.notas || null,
  })
  if (error) return error.message

  revalidatePath('/rrhh/nomina')
  revalidatePath('/')
  return null
}

export async function marcarNominaPagada(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('nomina_mensual')
    .update({ estado: 'PAGADO' })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/rrhh/nomina')
  revalidatePath('/')
}

export async function deleteNomina(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('nomina_mensual').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/rrhh/nomina')
  revalidatePath('/')
}

// ============ VACACIONES ============

export async function upsertVacaciones(
  empleadoId: string,
  ano: number,
  diasDisponibles: number,
  periodos: { fecha_inicio: string; fecha_fin: string; dias: number; notas?: string }[]
) {
  const diasTomados = periodos.reduce((s, p) => s + p.dias, 0)
  const supabase = await createClient()

  const { error } = await supabase.from('vacaciones_empleados').upsert(
    {
      empleado_id: empleadoId,
      ano,
      dias_disponibles: diasDisponibles,
      dias_tomados: diasTomados,
      dias_restantes: diasDisponibles - diasTomados,
      periodos,
    },
    { onConflict: 'empleado_id,ano' }
  )
  if (error) throw new Error(error.message)
  revalidatePath('/rrhh/vacaciones')
}

// ============ CONFIGURACIÓN APORTES ============

const aporteSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(['PORCENTAJE', 'MONTO_FIJO']),
  valor: z.coerce.number().positive(),
  aplicable_a: z.enum(['BLANCO', 'NEGRO', 'AMBOS']),
  es_patronal: z.coerce.boolean(),
  activo: z.coerce.boolean(),
  orden: z.coerce.number().int().min(0),
})

export async function createAporte(prevState: string | null, formData: FormData) {
  const raw = {
    ...Object.fromEntries(formData),
    es_patronal: formData.get('es_patronal') === 'true',
    activo: formData.get('activo') === 'true',
  }
  const result = aporteSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('configuracion_aportes').insert(result.data)
  if (error) return error.message

  revalidatePath('/settings/aportes')
  return null
}

export async function updateAporte(id: string, prevState: string | null, formData: FormData) {
  const raw = {
    ...Object.fromEntries(formData),
    es_patronal: formData.get('es_patronal') === 'true',
    activo: formData.get('activo') === 'true',
  }
  const result = aporteSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('configuracion_aportes').update(result.data).eq('id', id)
  if (error) return error.message

  revalidatePath('/settings/aportes')
  revalidatePath('/rrhh/nomina')
  return null
}

export async function deleteAporte(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('configuracion_aportes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/settings/aportes')
}
