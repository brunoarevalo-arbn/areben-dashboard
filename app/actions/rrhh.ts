'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { optUuid } from '@/lib/zod-helpers'
import { calcularNomina as calcNominaPuro, type AporteConfig } from '@/lib/calc/nomina'

// ============ EMPLEADOS ============

const empleadoSchema = z.object({
  nombre: z.string().min(1, 'Nombre es obligatorio'),
  apellido: z.string().min(1, 'Apellido es obligatorio'),
  dni: z.string().optional().nullable().or(z.literal('')),
  email: z.string().email().optional().nullable().or(z.literal('')),
  telefono: z.string().optional().nullable(),
  tipo_empleado: z.enum(['BLANCO', 'NEGRO']),
  sueldo_basico: z.coerce.number().min(0),
  valor_hora: z.coerce.number().min(0),
  horas_mensuales: z.coerce.number().int().positive(),
  corresponde_aguinaldo: z.coerce.boolean(),
  porcentaje_aguinaldo: z.coerce.number().min(0).max(100),
  monto_comidas: z.coerce.number().min(0).default(0),
  presentismo_pct: z.coerce.number().min(0).max(100).default(0),
  horas_acuerdo_negro: z.coerce.number().min(0).default(0),
  plus_negro_tipo: z.preprocess(
    (v) => (v === '' || v === 'NONE' ? null : v),
    z.enum(['MONTO', 'PORCENTAJE']).nullable(),
  ).optional(),
  plus_negro_valor: z.coerce.number().min(0).default(0),
  cbu: z.string().optional().nullable(),
  banco: z.string().optional().nullable(),
  metodo_pago: z.enum(['EFECTIVO', 'TRANSFERENCIA']).optional().nullable(),
  fecha_ingreso: z.string().optional().nullable().or(z.literal('')),
  fecha_nacimiento: z.string().optional().nullable(),
})

export async function createEmpleado(prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = {
    ...Object.fromEntries(formData),
    corresponde_aguinaldo: formData.get('corresponde_aguinaldo') === 'true' || formData.get('corresponde_aguinaldo') === 'on',
  }
  const result = empleadoSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()

  // Solo verificar DNI duplicado si se cargó uno
  if (result.data.dni) {
    const { data: existing } = await supabase
      .from('empleados')
      .select('id')
      .eq('dni', result.data.dni)
      .maybeSingle()
    if (existing) return 'Ya existe un empleado con ese DNI.'
  }

  const { error } = await supabase.from('empleados').insert({
    ...result.data,
    dni: result.data.dni || null,
    email: result.data.email || null,
    telefono: result.data.telefono || null,
    cbu: result.data.cbu || null,
    banco: result.data.banco || null,
    metodo_pago: result.data.metodo_pago || null,
    fecha_ingreso: result.data.fecha_ingreso || null,
    fecha_nacimiento: result.data.fecha_nacimiento || null,
    activo: true,
  })
  if (error) return error.message

  revalidatePath('/rrhh/empleados')
  revalidatePath('/')
  return null
}

export async function updateEmpleado(id: string, prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = {
    ...Object.fromEntries(formData),
    corresponde_aguinaldo: formData.get('corresponde_aguinaldo') === 'true' || formData.get('corresponde_aguinaldo') === 'on',
  }
  const result = empleadoSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('empleados').update({
    ...result.data,
    dni: result.data.dni || null,
    email: result.data.email || null,
    telefono: result.data.telefono || null,
    cbu: result.data.cbu || null,
    banco: result.data.banco || null,
    metodo_pago: result.data.metodo_pago || null,
    fecha_ingreso: result.data.fecha_ingreso || null,
    fecha_nacimiento: result.data.fecha_nacimiento || null,
  }).eq('id', id)
  if (error) return error.message

  revalidatePath('/rrhh/empleados')
  return null
}

// ============ HORAS EXTRAS ============

const horaExtraSchema = z.object({
  empleado_id: z.string().uuid(),
  fecha: z.string().min(1),
  cantidad: z.coerce.number().positive(),
  porcentaje: z.coerce.number().min(0).max(200).default(50),
  notas: z.string().optional().nullable(),
})

export async function createHoraExtra(prevState: string | null, formData: FormData) {
  await requireUser()
  const result = horaExtraSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('horas_extras_registros').insert({
    ...result.data,
    notas: result.data.notas || null,
  })
  if (error) return error.message
  revalidatePath('/rrhh/empleados')
  revalidatePath('/rrhh/nomina')
  return null
}

export async function deleteHoraExtra(id: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('horas_extras_registros').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/rrhh/empleados')
  revalidatePath('/rrhh/nomina')
}

// ============ AUSENCIAS / FALTAS ============

const ausenciaSchema = z.object({
  empleado_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD'),
  dias: z.coerce.number().positive().max(31),
  tipo: z.enum(['FALTA', 'LICENCIA_NO_PAGA', 'SIN_AVISO', 'JUSTIFICADA', 'OTRO']).default('FALTA'),
  justificada: z.coerce.boolean().default(false),
  notas: z.string().optional().nullable(),
})

/**
 * Calcula el monto del descuento por ausencia.
 * Convención: 1 día = 8 horas × valor_hora del empleado.
 * Si el empleado no tiene valor_hora pero sí sueldo_basico, divide /22 (días laborales).
 */
function calcularDescuentoAusencia(dias: number, empleado: { valor_hora?: number; sueldo_basico?: number }): number {
  const valorHora = Number(empleado.valor_hora ?? 0)
  if (valorHora > 0) {
    return Math.round(dias * 8 * valorHora * 100) / 100
  }
  const basico = Number(empleado.sueldo_basico ?? 0)
  return Math.round((dias * basico / 22) * 100) / 100
}

export async function createAusencia(prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = {
    ...Object.fromEntries(formData),
    justificada: formData.get('justificada') === 'true' || formData.get('justificada') === 'on',
  }
  const result = ausenciaSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { data: emp } = await supabase
    .from('empleados')
    .select('valor_hora, sueldo_basico')
    .eq('id', result.data.empleado_id)
    .single()
  if (!emp) return 'Empleado no encontrado'

  const monto_descuento = calcularDescuentoAusencia(result.data.dias, emp)

  const { error } = await supabase.from('ausencias_registros').insert({
    empleado_id: result.data.empleado_id,
    fecha: result.data.fecha,
    dias: result.data.dias,
    tipo: result.data.tipo,
    justificada: result.data.justificada,
    monto_descuento,
    notas: result.data.notas || null,
  })
  if (error) return error.message

  revalidatePath('/rrhh/empleados')
  revalidatePath('/rrhh/nomina')
  return null
}

export async function deleteAusencia(id: string) {
  await requireUser()
  const supabase = await createClient()
  // No permitir borrar si ya fue incluida en una nómina (preserva auditoría)
  const { data: a } = await supabase
    .from('ausencias_registros')
    .select('incluido_en_nomina_id')
    .eq('id', id)
    .single()
  if (a?.incluido_en_nomina_id) {
    throw new Error('No se puede borrar: ya fue aplicada en una nómina. Borrá primero la nómina.')
  }
  const { error } = await supabase.from('ausencias_registros').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/rrhh/empleados')
  revalidatePath('/rrhh/nomina')
}

// ============ EVENTOS / INCIDENCIAS / AJUSTES ============

const eventoSchema = z.object({
  empleado_id: z.string().uuid(),
  tipo: z.enum(['INCIDENCIA', 'AJUSTE_SALARIAL', 'LICENCIA', 'PREMIO', 'AMONESTACION', 'OTRO']),
  fecha: z.string().min(1),
  titulo: z.string().min(1),
  descripcion: z.string().optional().nullable(),
})

export async function createEvento(prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = Object.fromEntries(formData)
  const result = eventoSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('eventos_empleado').insert({
    ...result.data,
    descripcion: result.data.descripcion || null,
  })
  if (error) return error.message

  revalidatePath('/rrhh/empleados')
  return null
}

const ajusteSchema = z.object({
  empleado_id: z.string().uuid(),
  fecha: z.string().min(1),
  sueldo_nuevo: z.coerce.number().positive(),
  descripcion: z.string().optional().nullable(),
})

export async function createAjusteSalarial(prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = Object.fromEntries(formData)
  const result = ajusteSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()

  const { data: emp } = await supabase
    .from('empleados')
    .select('sueldo_basico, horas_mensuales')
    .eq('id', result.data.empleado_id)
    .single()
  if (!emp) return 'Empleado no encontrado'

  const sueldoAnterior = emp.sueldo_basico
  const horasMensuales = emp.horas_mensuales || 160
  const nuevoValorHora = result.data.sueldo_nuevo / horasMensuales

  const { error: ev } = await supabase.from('eventos_empleado').insert({
    empleado_id: result.data.empleado_id,
    tipo: 'AJUSTE_SALARIAL',
    fecha: result.data.fecha,
    titulo: `Ajuste salarial: ${formatPesos(sueldoAnterior)} → ${formatPesos(result.data.sueldo_nuevo)}`,
    descripcion: result.data.descripcion || null,
    sueldo_anterior: sueldoAnterior,
    sueldo_nuevo: result.data.sueldo_nuevo,
  })
  if (ev) return ev.message

  const { error: up } = await supabase
    .from('empleados')
    .update({
      sueldo_basico: result.data.sueldo_nuevo,
      valor_hora: Math.round(nuevoValorHora * 100) / 100,
    })
    .eq('id', result.data.empleado_id)
  if (up) return up.message

  revalidatePath('/rrhh/empleados')
  return null
}

export async function deleteEvento(id: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('eventos_empleado').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/rrhh/empleados')
}

function formatPesos(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

// Lleva el sueldo base de una nómina a la ficha del empleado: registra un evento
// AJUSTE_SALARIAL (historial) y actualiza sueldo_basico + valor_hora. Solo actúa si
// el monto difiere del de la ficha. Mismo mecanismo que createAjusteSalarial.
async function aplicarSueldoAFicha(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empleado: { id: string; sueldo_basico: number; horas_mensuales: number },
  nuevoBase: number,
  mes: string,
) {
  if (!nuevoBase || Math.abs(nuevoBase - empleado.sueldo_basico) <= 0.5) return false
  const horasMensuales = empleado.horas_mensuales || 160
  const nuevoValorHora = Math.round((nuevoBase / horasMensuales) * 100) / 100
  const hoy = new Date().toISOString().split('T')[0]
  await supabase.from('eventos_empleado').insert({
    empleado_id: empleado.id,
    tipo: 'AJUSTE_SALARIAL',
    fecha: hoy,
    titulo: `Ajuste salarial: ${formatPesos(empleado.sueldo_basico)} → ${formatPesos(nuevoBase)}`,
    descripcion: `Actualizado desde la nómina de ${mes}`,
    sueldo_anterior: empleado.sueldo_basico,
    sueldo_nuevo: nuevoBase,
  })
  await supabase
    .from('empleados')
    .update({ sueldo_basico: nuevoBase, valor_hora: nuevoValorHora })
    .eq('id', empleado.id)
  return true
}

export async function toggleEmpleadoActivo(id: string, activo: boolean) {
  await requireUser()
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
  await requireUser()
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
  porcentaje_extras: z.coerce.number().min(0).max(200).default(50),
  // JSON con las líneas de horas extras [{id, cantidad, porcentaje}] para reconciliar los registros
  extras_lineas: z.string().optional(),
  comida: z.coerce.number().min(0),
  aguinaldo: z.coerce.number().min(0),
  asistencia_completa: z.coerce.boolean().default(false),
  presentismo_monto: z.coerce.number().min(0).default(0),
  aguinaldo_directo: z.coerce.number().min(0).default(0),
  monto_recibo_oficial: z.coerce.number().min(0).default(0),
  adicional_no_registrado: z.coerce.number().min(0).default(0),
  aguinaldo_pagado_de_caja: z.coerce.number().min(0).default(0),
  ausencias_horas: z.coerce.number().min(0).default(0),
  ausencias_motivo: z.string().optional().nullable(),
  bono_monto: z.coerce.number().min(0).default(0),
  bono_concepto: z.preprocess(
    (v) => (v === '' ? null : v),
    z.enum(['BONO', 'PREMIO', 'COMISION', 'OTRO']).nullable(),
  ).optional(),
  bono_descripcion: z.string().optional().nullable(),
  descuento_otro_monto: z.coerce.number().min(0).default(0),
  descuento_otro_concepto: z.preprocess(
    (v) => (v === '' ? null : v),
    z.enum(['MULTA', 'DEVOLUCION_ADELANTO', 'OTRO']).nullable(),
  ).optional(),
  descuento_otro_descripcion: z.string().optional().nullable(),
  fecha_programada_pago: z.string().min(1, 'La fecha programada de pago es obligatoria'),
  notas: z.string().optional().nullable(),
})

/**
 * Vencimiento típico para aportes patronales (AFIP): día 15 del mes siguiente.
 */
function fechaVencimientoAportes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m, 15) // m está 0-indexed → m+1 = mes siguiente, día 15
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`
}

/**
 * Sincroniza el gasto pendiente de "Cargas Sociales" (aportes patronales) vinculado a una nómina.
 * - Si aportes_patronales > 0 y no hay gasto: crea uno
 * - Si hay gasto y los aportes cambiaron: actualiza monto/fecha
 * - Si aportes pasan a 0 y hay gasto: lo borra
 */
async function syncGastoAportesPatronales(nominaId: string) {
  const supabase = await createClient()
  const { data: n } = await supabase
    .from('nomina_mensual')
    .select(`
      id, mes, aportes_patronales, gasto_aportes_patronales_id,
      empleado:empleados(nombre, apellido)
    `)
    .eq('id', nominaId)
    .single()
  if (!n) return

  const aportes = Number(n.aportes_patronales ?? 0)
  const empleado = Array.isArray(n.empleado) ? n.empleado[0] : n.empleado
  const empleadoLabel = empleado ? `${empleado.nombre} ${empleado.apellido}` : 'empleado'

  if (aportes <= 0) {
    // No corresponden aportes — borrar el gasto si existe
    if (n.gasto_aportes_patronales_id) {
      await supabase.from('gastos').delete().eq('id', n.gasto_aportes_patronales_id)
      await supabase.from('nomina_mensual').update({ gasto_aportes_patronales_id: null }).eq('id', nominaId)
    }
    return
  }

  const fechaVenc = fechaVencimientoAportes(n.mes)
  const gastoData = {
    categoria: 'Cargas Sociales',
    concepto: `Aportes patronales — ${empleadoLabel} — ${n.mes}`,
    monto: aportes,
    monto_neto: aportes,
    iva_incluido: false,
    porcentaje_iva: 0,
    moneda: 'ARS',
    negocio: 'GENERAL',
    mes: n.mes,
    fecha: `${n.mes}-01`,
    estado: 'PENDIENTE',
    fecha_pago: fechaVenc,
    medio_pago: 'TRANSFERENCIA',
    notas: 'Aportes/contribuciones patronales — generado automáticamente desde la nómina',
    confirmado: true,
  }

  if (n.gasto_aportes_patronales_id) {
    // Actualizar el existente — pero solo si NO está pagado
    const { data: g } = await supabase
      .from('gastos')
      .select('estado')
      .eq('id', n.gasto_aportes_patronales_id)
      .single()
    if (g?.estado !== 'PAGADO') {
      await supabase.from('gastos').update(gastoData).eq('id', n.gasto_aportes_patronales_id)
    }
  } else {
    // Crear nuevo
    const { data: nuevo } = await supabase.from('gastos').insert(gastoData).select('id').single()
    if (nuevo) {
      await supabase.from('nomina_mensual').update({ gasto_aportes_patronales_id: nuevo.id }).eq('id', nominaId)
    }
  }
}

// La provisión de aguinaldo arranca en julio-2026. Mayo/junio no generan provisión.
const PROVISION_AGUINALDO_DESDE = '2026-07'

/**
 * Sincroniza el gasto DEVENGADO de "Provisión Aguinaldo" vinculado a una nómina.
 * Es un costo del mes SIN salida de caja (estado DEVENGADO → no entra a pasivos del cierre;
 * el pasivo lo aporta la cuenta patrimonial "Provisión aguinaldo", sintetizada desde nómina).
 * - mes < cutoff o aguinaldo_provisionado <= 0 → borra el gasto si existe.
 * - si no → crea/actualiza el gasto devengado.
 */
async function syncGastoProvisionAguinaldo(nominaId: string) {
  const supabase = await createClient()
  const { data: n } = await supabase
    .from('nomina_mensual')
    .select(`
      id, mes, aguinaldo_provisionado, gasto_provision_aguinaldo_id,
      empleado:empleados(nombre, apellido)
    `)
    .eq('id', nominaId)
    .single()
  if (!n) return

  const provision = Number(n.aguinaldo_provisionado ?? 0)
  const empleado = Array.isArray(n.empleado) ? n.empleado[0] : n.empleado
  const empleadoLabel = empleado ? `${empleado.nombre} ${empleado.apellido}` : 'empleado'

  const borrar = async () => {
    if (n.gasto_provision_aguinaldo_id) {
      await supabase.from('gastos').delete().eq('id', n.gasto_provision_aguinaldo_id)
      await supabase.from('nomina_mensual').update({ gasto_provision_aguinaldo_id: null }).eq('id', nominaId)
    }
  }

  if (n.mes < PROVISION_AGUINALDO_DESDE || provision <= 0) {
    await borrar()
    return
  }

  const gastoData = {
    categoria: 'Provisión Aguinaldo',
    concepto: `Provisión aguinaldo — ${empleadoLabel} — ${n.mes}`,
    monto: provision,
    monto_neto: provision,
    iva_incluido: false,
    porcentaje_iva: 0,
    moneda: 'ARS',
    negocio: 'GENERAL',
    mes: n.mes,
    fecha: `${n.mes}-01`,
    estado: 'DEVENGADO',
    fecha_pago: null,
    medio_pago: 'TRANSFERENCIA',
    notas: 'Provisión de aguinaldo (SAC) — costo devengado del mes, sin salida de caja. Generado desde la nómina.',
    confirmado: true,
  }

  if (n.gasto_provision_aguinaldo_id) {
    await supabase.from('gastos').update(gastoData).eq('id', n.gasto_provision_aguinaldo_id)
  } else {
    const { data: nuevo } = await supabase.from('gastos').insert(gastoData).select('id').single()
    if (nuevo) {
      await supabase.from('nomina_mensual').update({ gasto_provision_aguinaldo_id: nuevo.id }).eq('id', nominaId)
    }
  }
}

// Reconcilia los registros de horas extras del empleado/mes contra las líneas cargadas en la
// liquidación. Actualiza por id, da de alta las nuevas y borra las que se quitaron. Devuelve el
// agregado (total de horas + promedio ponderado) que guarda la nómina.
async function reconciliarHorasExtras(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empleadoId: string,
  nominaId: string,
  mes: string,
  extrasLineasRaw: string | undefined,
): Promise<{ total: number; porcentaje: number }> {
  let lineas: { id: string | null; cantidad: number; porcentaje: number }[] = []
  try {
    const parsed = extrasLineasRaw ? JSON.parse(extrasLineasRaw) : []
    if (Array.isArray(parsed)) {
      lineas = parsed
        .map((l) => ({ id: (l?.id as string) ?? null, cantidad: Number(l?.cantidad) || 0, porcentaje: Number(l?.porcentaje) || 0 }))
        .filter((l) => l.cantidad > 0 && l.porcentaje >= 0 && l.porcentaje <= 200)
    }
  } catch { lineas = [] }

  const desdeMes = `${mes}-01`
  const fIni = new Date(desdeMes + 'T00:00:00')
  const ultimoDia = new Date(fIni.getFullYear(), fIni.getMonth() + 1, 0).toISOString().split('T')[0]

  // Candidatos: registros del empleado/mes ya vinculados a esta nómina + los aún sin vincular.
  const { data: actuales } = await supabase
    .from('horas_extras_registros')
    .select('id')
    .eq('empleado_id', empleadoId)
    .gte('fecha', desdeMes)
    .lte('fecha', ultimoDia)
    .or(`incluido_en_nomina_id.eq.${nominaId},incluido_en_nomina_id.is.null`)

  const idsActuales = new Set((actuales ?? []).map((r) => r.id as string))
  const idsEnLineas = new Set(lineas.map((l) => l.id).filter((id): id is string => !!id))

  const aBorrar = [...idsActuales].filter((id) => !idsEnLineas.has(id))
  if (aBorrar.length) await supabase.from('horas_extras_registros').delete().in('id', aBorrar)

  for (const l of lineas) {
    if (l.id && idsActuales.has(l.id)) {
      await supabase.from('horas_extras_registros')
        .update({ cantidad: l.cantidad, porcentaje: l.porcentaje, incluido_en_nomina_id: nominaId })
        .eq('id', l.id)
    } else {
      await supabase.from('horas_extras_registros').insert({
        empleado_id: empleadoId, fecha: ultimoDia, cantidad: l.cantidad, porcentaje: l.porcentaje,
        incluido_en_nomina_id: nominaId, notas: 'Cargada en liquidación',
      })
    }
  }

  const total = lineas.reduce((s, l) => s + l.cantidad, 0)
  const porcentaje = total > 0
    ? Math.round((lineas.reduce((s, l) => s + l.cantidad * l.porcentaje, 0) / total) * 100) / 100
    : 0
  return { total, porcentaje }
}

export async function createNomina(prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = {
    ...Object.fromEntries(formData),
    asistencia_completa: formData.get('asistencia_completa') === 'true' || formData.get('asistencia_completa') === 'on',
  }
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
    .select('*')
    .eq('id', result.data.empleado_id)
    .single()
  if (!empleado) return 'Empleado no encontrado'

  const { data: aportes } = await supabase
    .from('configuracion_aportes')
    .select('*')
    .eq('activo', true)
    .or(`aplicable_a.eq.AMBOS,aplicable_a.eq.${empleado.tipo_empleado}`)

  const d = result.data
  const esBlanco = empleado.tipo_empleado === 'BLANCO'

  // Cálculo con el motor único (lib/calc/nomina.ts): mismo resultado que la liquidación masiva.
  // Respeta aplicable_a de los aportes (empleado en negro → 0 cargas patronales).
  const calc = calcNominaPuro({
    esBlanco,
    sueldoBasico: d.sueldo_basico,
    montoReciboOficial: d.monto_recibo_oficial,
    horasTrabajadas: d.horas_trabajadas,
    valorHora: d.valor_hora,
    horasExtras: d.horas_extras,
    porcentajeExtras: d.porcentaje_extras,
    comida: d.comida,
    asistenciaCompleta: d.asistencia_completa,
    presentismoPctEmpleado: empleado.presentismo_pct ?? 0,
    aguinaldoPagadoDeCaja: d.aguinaldo_pagado_de_caja,
    aguinaldoDirecto: d.aguinaldo_directo,
    adicionalNoRegistrado: d.adicional_no_registrado,
    ausenciasHoras: d.ausencias_horas,
    bonoMonto: d.bono_monto,
    descuentoOtroMonto: d.descuento_otro_monto,
    correspondeAguinaldo: empleado.corresponde_aguinaldo,
    porcentajeAguinaldo: empleado.porcentaje_aguinaldo ?? 0,
    aportes: (aportes ?? []).map((a) => ({ tipo: a.tipo, valor: Number(a.valor), aplicable_a: a.aplicable_a, es_patronal: a.es_patronal })) as AporteConfig[],
  })
  const basicoEfectivo = calc.basicoEfectivo
  const aguinaldoProvisionado = calc.aguinaldoProvisionado
  const presentismo = calc.presentismo
  const ausenciasDescuento = calc.ausenciasDescuento
  const ausenciasHoras = d.ausencias_horas
  const aportes_patronales = calc.aportesPatronales
  const subtotal = calc.subtotal
  const neto = calc.neto
  const costo_empresa = calc.costoEmpresa
  const valor_hora_real = calc.valorHoraReal
  const netoFinal = calc.neto

  const { data: nominaInserted, error } = await supabase.from('nomina_mensual').insert({
    empleado_id: d.empleado_id,
    mes: d.mes,
    sueldo_basico: basicoEfectivo,
    horas_trabajadas: d.horas_trabajadas,
    valor_hora: d.valor_hora,
    valor_hora_real: Math.round(valor_hora_real * 100) / 100,
    horas_extras: d.horas_extras,
    porcentaje_extras: d.porcentaje_extras,
    comida: d.comida,
    aguinaldo: d.aguinaldo_pagado_de_caja,
    aguinaldo_pagado_de_caja: d.aguinaldo_pagado_de_caja,
    aguinaldo_directo: d.aguinaldo_directo,
    aguinaldo_provisionado: aguinaldoProvisionado,
    asistencia_completa: d.asistencia_completa,
    presentismo_monto: Math.round(presentismo * 100) / 100,
    monto_recibo_oficial: d.monto_recibo_oficial,
    adicional_no_registrado: d.adicional_no_registrado,
    aportes_empleado: 0,
    aportes_patronales: Math.round(aportes_patronales * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    neto: netoFinal,
    costo_empresa: Math.round(costo_empresa * 100) / 100,
    estado: 'PENDIENTE',
    fecha_programada_pago: d.fecha_programada_pago,
    notas: d.notas || null,
    ausencias_descuento: ausenciasDescuento,
    ausencias_horas: ausenciasHoras,
    ausencias_motivo: d.ausencias_motivo || null,
    bono_monto: d.bono_monto || 0,
    bono_concepto: d.bono_concepto || null,
    bono_descripcion: d.bono_descripcion || null,
    descuento_otro_monto: d.descuento_otro_monto || 0,
    descuento_otro_concepto: d.descuento_otro_concepto || null,
    descuento_otro_descripcion: d.descuento_otro_descripcion || null,
  }).select('id').single()
  if (error) return error.message

  // Reconciliar los registros de horas extras contra las líneas cargadas en la liquidación
  // (crea/actualiza/borra según corresponda y las vincula a esta nómina).
  if (nominaInserted) {
    await reconciliarHorasExtras(supabase, d.empleado_id, nominaInserted.id, d.mes, d.extras_lineas)
  }

  // Crear gasto pendiente vinculado para que aparezca en /finanzas/pendientes y en el cierre
  if (nominaInserted) {
    const concepto = `Pago Nómina - ${empleado.nombre} ${empleado.apellido} - ${d.mes}`
    const { data: gastoInserted } = await supabase.from('gastos').insert({
      categoria: 'Sueldos',
      concepto,
      monto: netoFinal,
      monto_neto: netoFinal,
      iva_incluido: false,
      porcentaje_iva: 0,
      moneda: 'ARS',
      negocio: 'GENERAL',
      mes: d.mes,
      estado: 'PENDIENTE',
      fecha_pago: d.fecha_programada_pago,
      medio_pago: 'TRANSFERENCIA',
      notas: `Nómina vinculada · empleado ${empleado.tipo_empleado}`,
      confirmado: true,
    }).select('id').single()

    if (gastoInserted) {
      await supabase
        .from('nomina_mensual')
        .update({ gasto_pendiente_id: gastoInserted.id })
        .eq('id', nominaInserted.id)
    }
  }

  // Sincronizar el gasto de aportes patronales (si aportes_patronales > 0)
  if (nominaInserted) {
    await syncGastoAportesPatronales(nominaInserted.id)
    await syncGastoProvisionAguinaldo(nominaInserted.id)
  }

  // Si se confirmó, llevar este sueldo a la ficha del empleado (registra ajuste salarial)
  if (formData.get('actualizar_sueldo_ficha') === 'true') {
    await aplicarSueldoAFicha(supabase, empleado, basicoEfectivo, d.mes)
  }

  revalidatePath('/rrhh/nomina')
  revalidatePath('/rrhh/empleados')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/cierre-mes')
  revalidatePath('/')
  return null
}

export async function marcarNominaPagada(id: string) {
  await requireUser()
  const supabase = await createClient()

  // Buscar la nómina y su gasto vinculado para marcar ambos como pagados
  const { data: nomina } = await supabase
    .from('nomina_mensual')
    .select('id, gasto_pendiente_id, fecha_programada_pago')
    .eq('id', id)
    .single()
  if (!nomina) throw new Error('Nómina no encontrada')

  const fechaPago = new Date().toISOString().split('T')[0]

  const { error } = await supabase
    .from('nomina_mensual')
    .update({ estado: 'PAGADO' })
    .eq('id', id)
  if (error) throw new Error(error.message)

  // Sincronizar el gasto vinculado
  if (nomina.gasto_pendiente_id) {
    await supabase
      .from('gastos')
      .update({ estado: 'PAGADO', fecha_pago: fechaPago })
      .eq('id', nomina.gasto_pendiente_id)
  }

  revalidatePath('/rrhh/nomina')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/cierre-mes')
  revalidatePath('/')
}

/**
 * Edita una nómina existente. Aplica 3 guardas para evitar inconsistencias:
 *  1. Si la nómina está PAGADA → solo permite editar `notas`
 *  2. Si tiene pagos parciales → exige que el nuevo neto sea ≥ total ya pagado
 *  3. Sin pagos → edit libre, recalcula y sincroniza el gasto vinculado
 */
export async function updateNomina(id: string, prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = {
    ...Object.fromEntries(formData),
    asistencia_completa: formData.get('asistencia_completa') === 'true' || formData.get('asistencia_completa') === 'on',
  }
  const result = nominaSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()

  // Cargar la nómina actual + pagos parciales
  const { data: nominaActual } = await supabase
    .from('nomina_mensual')
    .select('id, neto, estado, gasto_pendiente_id, mes')
    .eq('id', id)
    .single()
  if (!nominaActual) return 'Nómina no encontrada'

  const { data: pagosPrev } = await supabase
    .from('pagos')
    .select('monto')
    .eq('tipo_origen', 'NOMINA')
    .eq('origen_id', id)
  const totalPagado = (pagosPrev ?? []).reduce((s, p) => s + Number(p.monto), 0)

  // GUARDA 1: nómina ya totalmente pagada
  if (nominaActual.estado === 'PAGADO') {
    // Sólo permitir cambio de notas
    const { error } = await supabase
      .from('nomina_mensual')
      .update({ notas: result.data.notas || null })
      .eq('id', id)
    if (error) return error.message
    revalidatePath('/rrhh/nomina')
    return null
  }

  // Re-cargar empleado y aportes para recalcular
  const { data: empleado } = await supabase
    .from('empleados')
    .select('*')
    .eq('id', result.data.empleado_id)
    .single()
  if (!empleado) return 'Empleado no encontrado'

  const { data: aportes } = await supabase
    .from('configuracion_aportes')
    .select('*')
    .eq('activo', true)
    .or(`aplicable_a.eq.AMBOS,aplicable_a.eq.${empleado.tipo_empleado}`)

  const d = result.data
  const esBlanco = empleado.tipo_empleado === 'BLANCO'
  const basicoEfectivo = esBlanco && d.monto_recibo_oficial > 0 ? d.monto_recibo_oficial : d.sueldo_basico
  const horas_extras_monto = d.horas_extras * d.valor_hora * (1 + d.porcentaje_extras / 100)
  const presentismo = !esBlanco && d.asistencia_completa
    ? Math.round(basicoEfectivo * (empleado.presentismo_pct ?? 0)) / 100
    : 0
  const ausenciasDescuento = Math.round(d.ausencias_horas * d.valor_hora * 100) / 100

  // Aguinaldo sobre el sueldo FIJO mensual (oficial + acuerdo fijo en negro)
  const baseAguinaldo = basicoEfectivo + d.adicional_no_registrado
  const aguinaldoProvisionado = empleado.corresponde_aguinaldo
    ? Math.round(baseAguinaldo * (empleado.porcentaje_aguinaldo ?? 0)) / 100
    : 0

  const subtotal = basicoEfectivo + horas_extras_monto + d.comida + presentismo
    + d.aguinaldo_pagado_de_caja + d.aguinaldo_directo + d.adicional_no_registrado - ausenciasDescuento
    + d.bono_monto - d.descuento_otro_monto

  // Aportes patronales sobre el bruto del recibo oficial (BLANCO) o el básico negro
  const baseAportesPatronales = esBlanco && d.monto_recibo_oficial > 0
    ? d.monto_recibo_oficial
    : basicoEfectivo
  let aportes_patronales = 0
  for (const aporte of aportes ?? []) {
    if (!aporte.es_patronal) continue
    const monto = aporte.tipo === 'PORCENTAJE' ? (baseAportesPatronales * aporte.valor) / 100 : aporte.valor
    aportes_patronales += monto
  }
  // Neto = subtotal (lo que se paga al empleado, sin aplicar aportes empleado).
  const neto = Math.round(subtotal * 100) / 100
  const costo_empresa = neto + aportes_patronales + aguinaldoProvisionado

  // GUARDA 2: si tiene pagos parciales, no permitir bajar el neto debajo de lo ya pagado
  if (totalPagado > 0 && neto + 0.01 < totalPagado) {
    return `El nuevo neto ($${neto.toFixed(2)}) es menor a lo ya pagado a cuenta ($${totalPagado.toFixed(2)}). Borrá pagos parciales primero.`
  }

  const valor_hora_real = d.horas_trabajadas > 0 && d.monto_recibo_oficial > 0
    ? d.monto_recibo_oficial / d.horas_trabajadas
    : d.valor_hora

  const { error } = await supabase.from('nomina_mensual').update({
    sueldo_basico: basicoEfectivo,
    horas_trabajadas: d.horas_trabajadas,
    valor_hora: d.valor_hora,
    valor_hora_real: Math.round(valor_hora_real * 100) / 100,
    horas_extras: d.horas_extras,
    porcentaje_extras: d.porcentaje_extras,
    comida: d.comida,
    aguinaldo: d.aguinaldo_pagado_de_caja,
    aguinaldo_pagado_de_caja: d.aguinaldo_pagado_de_caja,
    aguinaldo_directo: d.aguinaldo_directo,
    aguinaldo_provisionado: aguinaldoProvisionado,
    asistencia_completa: d.asistencia_completa,
    presentismo_monto: Math.round(presentismo * 100) / 100,
    monto_recibo_oficial: d.monto_recibo_oficial,
    adicional_no_registrado: d.adicional_no_registrado,
    aportes_empleado: 0,
    aportes_patronales: Math.round(aportes_patronales * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    neto,
    costo_empresa: Math.round(costo_empresa * 100) / 100,
    fecha_programada_pago: d.fecha_programada_pago,
    notas: d.notas || null,
    ausencias_descuento: ausenciasDescuento,
    ausencias_horas: d.ausencias_horas,
    ausencias_motivo: d.ausencias_motivo || null,
    bono_monto: d.bono_monto || 0,
    bono_concepto: d.bono_concepto || null,
    bono_descripcion: d.bono_descripcion || null,
    descuento_otro_monto: d.descuento_otro_monto || 0,
    descuento_otro_concepto: d.descuento_otro_concepto || null,
    descuento_otro_descripcion: d.descuento_otro_descripcion || null,
  }).eq('id', id)
  if (error) return error.message

  // Reconciliar los registros de horas extras contra las líneas de la liquidación
  await reconciliarHorasExtras(supabase, d.empleado_id, id, d.mes, d.extras_lineas)

  // Sincronizar el gasto vinculado con el nuevo neto
  if (nominaActual.gasto_pendiente_id) {
    await supabase
      .from('gastos')
      .update({
        monto: neto,
        monto_neto: neto,
        fecha_pago: d.fecha_programada_pago,
      })
      .eq('id', nominaActual.gasto_pendiente_id)
  }

  // Sincronizar el gasto de aportes patronales con el nuevo monto
  await syncGastoAportesPatronales(id)
  await syncGastoProvisionAguinaldo(id)

  // Si se confirmó, llevar este sueldo a la ficha del empleado (registra ajuste salarial)
  if (formData.get('actualizar_sueldo_ficha') === 'true') {
    await aplicarSueldoAFicha(supabase, empleado, basicoEfectivo, d.mes)
  }

  revalidatePath('/rrhh/nomina')
  revalidatePath('/rrhh/empleados')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/cierre-mes')
  revalidatePath('/finanzas/pagos')
  revalidatePath('/')
  return null
}

export async function deleteNomina(id: string) {
  await requireUser()
  const supabase = await createClient()

  // Liberar las horas extras vinculadas (ausencias ya no se vinculan)
  await supabase
    .from('horas_extras_registros')
    .update({ incluido_en_nomina_id: null })
    .eq('incluido_en_nomina_id', id)

  // Buscar y eliminar los gastos vinculados (sueldo + aportes patronales + provisión aguinaldo)
  const { data: nomina } = await supabase
    .from('nomina_mensual')
    .select('gasto_pendiente_id, gasto_aportes_patronales_id, gasto_provision_aguinaldo_id')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('nomina_mensual').delete().eq('id', id)
  if (error) throw new Error(error.message)

  if (nomina?.gasto_pendiente_id) {
    await supabase.from('gastos').delete().eq('id', nomina.gasto_pendiente_id)
  }
  if (nomina?.gasto_aportes_patronales_id) {
    await supabase.from('gastos').delete().eq('id', nomina.gasto_aportes_patronales_id)
  }
  if (nomina?.gasto_provision_aguinaldo_id) {
    await supabase.from('gastos').delete().eq('id', nomina.gasto_provision_aguinaldo_id)
  }

  revalidatePath('/rrhh/nomina')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/cierre-mes')
  revalidatePath('/')
}

// ============ LIQUIDACIÓN MASIVA DE NÓMINAS ============

/**
 * Genera nóminas en lote para múltiples empleados de un mes. Toma los defaults de ficha
 * (básico, horas, valor hora, comida) y admite conceptos por empleado (horas extras, bono,
 * descuento) vía `conceptos`. Usa el MISMO motor que la individual (`calcularNomina` de
 * lib/calc/nomina) → netos/aguinaldo/aportes idénticos a una liquidación individual.
 * Saltea los que ya tienen nómina ese mes.
 */
export async function liquidacionMasiva(args: {
  empleadoIds: string[]
  mes: string
  fechaProgramadaPago: string
  conceptos?: Record<string, {
    horasExtras?: number
    porcentajeExtras?: number
    bonoMonto?: number
    bonoConcepto?: string
    descuentoOtroMonto?: number
    descuentoOtroConcepto?: string
  }>
}) {
  await requireUser()
  if (!args.empleadoIds.length) return { ok: 0, errors: [] as string[] }
  const supabase = await createClient()

  // Saltear los que ya tienen nómina del mes
  const { data: existentes } = await supabase
    .from('nomina_mensual')
    .select('empleado_id')
    .eq('mes', args.mes)
    .in('empleado_id', args.empleadoIds)
  const yaLiquidados = new Set((existentes ?? []).map((n) => n.empleado_id))

  // Empleados con sus configs
  const { data: empleados } = await supabase
    .from('empleados')
    .select('*')
    .in('id', args.empleadoIds)
  const { data: aportes } = await supabase
    .from('configuracion_aportes')
    .select('*')
    .eq('activo', true)

  const errors: string[] = []
  let ok = 0

  // 1) Filtrar empleados elegibles (no ya liquidados) y construir todas las filas en memoria
  const empleadosElegibles = (empleados ?? []).filter((emp) => {
    if (yaLiquidados.has(emp.id)) {
      errors.push(`${emp.nombre} ${emp.apellido}: ya tenía nómina del ${args.mes}`)
      return false
    }
    return true
  })

  if (empleadosElegibles.length === 0) {
    return { ok, errors }
  }

  // 2) Calcular las filas de nómina y gasto vinculado para cada uno
  type CalcRow = { empleado: typeof empleadosElegibles[number]; nomina: Record<string, unknown>; gasto: Record<string, unknown>; netoFinal: number }
  const filas: CalcRow[] = empleadosElegibles.map((empleado) => {
    const esBlanco = empleado.tipo_empleado === 'BLANCO'
    const c = args.conceptos?.[empleado.id] ?? {}
    const horasExtras = Number(c.horasExtras ?? 0)
    const porcentajeExtras = Number(c.porcentajeExtras ?? 50)
    const bonoMonto = Number(c.bonoMonto ?? 0)
    const descuentoOtroMonto = Number(c.descuentoOtroMonto ?? 0)
    const basicoEfectivo = Number(empleado.sueldo_basico ?? 0)
    const horasTrabajadas = Number(empleado.horas_mensuales ?? 0)
    const valorHora = Number(empleado.valor_hora ?? 0)
    const comida = Number(empleado.monto_comidas ?? 0)

    // Mismo motor que la individual: neto=subtotal, aportes filtrados por aplicable_a.
    const calc = calcNominaPuro({
      esBlanco,
      sueldoBasico: basicoEfectivo,
      montoReciboOficial: esBlanco ? basicoEfectivo : 0,
      horasTrabajadas,
      valorHora,
      horasExtras,
      porcentajeExtras,
      comida,
      asistenciaCompleta: false,
      presentismoPctEmpleado: Number(empleado.presentismo_pct ?? 0),
      aguinaldoPagadoDeCaja: 0,
      aguinaldoDirecto: 0,
      adicionalNoRegistrado: 0,
      ausenciasHoras: 0,
      bonoMonto,
      descuentoOtroMonto,
      correspondeAguinaldo: empleado.corresponde_aguinaldo,
      porcentajeAguinaldo: Number(empleado.porcentaje_aguinaldo ?? 0),
      aportes: (aportes ?? []).map((a) => ({ tipo: a.tipo, valor: Number(a.valor), aplicable_a: a.aplicable_a, es_patronal: a.es_patronal })) as AporteConfig[],
    })
    const netoFinal = calc.neto
    return {
      empleado,
      netoFinal,
      nomina: {
        empleado_id: empleado.id,
        mes: args.mes,
        sueldo_basico: calc.basicoEfectivo,
        horas_trabajadas: horasTrabajadas,
        valor_hora: valorHora,
        valor_hora_real: calc.valorHoraReal,
        horas_extras: horasExtras,
        porcentaje_extras: porcentajeExtras,
        comida,
        aguinaldo: 0,
        aguinaldo_pagado_de_caja: 0,
        aguinaldo_directo: 0,
        aguinaldo_provisionado: calc.aguinaldoProvisionado,
        asistencia_completa: false,
        presentismo_monto: calc.presentismo,
        monto_recibo_oficial: esBlanco ? basicoEfectivo : 0,
        adicional_no_registrado: 0,
        aportes_empleado: 0,
        aportes_patronales: calc.aportesPatronales,
        subtotal: calc.subtotal,
        neto: netoFinal,
        costo_empresa: calc.costoEmpresa,
        bono_monto: bonoMonto || 0,
        bono_concepto: c.bonoConcepto || null,
        descuento_otro_monto: descuentoOtroMonto || 0,
        descuento_otro_concepto: c.descuentoOtroConcepto || null,
        estado: 'PENDIENTE',
        fecha_programada_pago: args.fechaProgramadaPago,
        notas: 'Generada por liquidación masiva',
      },
      gasto: {
        categoria: 'Sueldos',
        concepto: `Pago Nómina - ${empleado.nombre} ${empleado.apellido} - ${args.mes}`,
        monto: netoFinal,
        monto_neto: netoFinal,
        iva_incluido: false,
        porcentaje_iva: 0,
        moneda: 'ARS',
        negocio: 'GENERAL',
        mes: args.mes,
        fecha: args.fechaProgramadaPago,
        estado: 'PENDIENTE',
        fecha_pago: args.fechaProgramadaPago,
        medio_pago: 'TRANSFERENCIA',
        notas: `Nómina vinculada · ${empleado.tipo_empleado} (liq. masiva)`,
        confirmado: true,
      },
    }
  })

  // 3) Bulk insert de nóminas (1 query). El orden de retorno coincide con el orden de inserción.
  const { data: nominasInsertadas, error: errNomina } = await supabase
    .from('nomina_mensual')
    .insert(filas.map((f) => f.nomina))
    .select('id, empleado_id')
  if (errNomina) {
    errors.push(`Error insertando nóminas: ${errNomina.message}`)
    return { ok, errors }
  }

  // Map empleado_id → nomina.id
  const nominaByEmpleado = new Map<string, string>()
  for (const n of nominasInsertadas ?? []) nominaByEmpleado.set(n.empleado_id, n.id)

  // 4) Bulk insert de gastos vinculados (1 query)
  const { data: gastosInsertados, error: errGasto } = await supabase
    .from('gastos')
    .insert(filas.map((f) => f.gasto))
    .select('id, concepto')

  // 5) Vincular gastos a nóminas correspondientes (matcheamos por concepto, contiene apellido y mes)
  if (gastosInsertados && !errGasto) {
    const updates = filas
      .map((f) => {
        const nominaId = nominaByEmpleado.get(f.empleado.id)
        const gasto = gastosInsertados.find((g) => g.concepto === f.gasto.concepto)
        if (!nominaId || !gasto) return null
        return supabase
          .from('nomina_mensual')
          .update({ gasto_pendiente_id: gasto.id })
          .eq('id', nominaId)
      })
      .filter((u): u is NonNullable<typeof u> => u !== null)
    await Promise.all(updates)
  }

  ok = nominasInsertadas?.length ?? 0

  // Sincronizar gastos de aportes patronales para todas las nóminas insertadas
  if (nominasInsertadas?.length) {
    await Promise.all(nominasInsertadas.map((n) => syncGastoAportesPatronales(n.id)))
    await Promise.all(nominasInsertadas.map((n) => syncGastoProvisionAguinaldo(n.id)))
  }

  revalidatePath('/rrhh/nomina')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/cierre-mes')
  revalidatePath('/')

  return { ok, errors }
}

// ============ PAGOS PARCIALES NOMINA ============
// Wrappers que delegan al ledger unificado (`pagos`) — escriben tipo_origen=NOMINA.

import { createPagoUnificado, deletePagoUnificado } from './pagos'

const pagoParcialSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD'),
  monto: z.coerce.number().positive('El monto debe ser positivo'),
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
  medio_pago: z.string().min(1, 'Requerido'),
  cuenta_id: optUuid,
  notas: z.string().optional().nullable(),
})

function medioToInstrumento(medio: string): 'TRANSFERENCIA' | 'EFECTIVO' | 'CUENTA_CORRIENTE' | 'CHEQUE_FISICO' {
  if (medio === 'EFECTIVO') return 'EFECTIVO'
  if (medio === 'CTA_CORRIENTE') return 'CUENTA_CORRIENTE'
  if (medio === 'CHEQUE') return 'CHEQUE_FISICO'
  return 'TRANSFERENCIA'
}

export async function createPagoParcialNomina(
  nominaId: string,
  prevState: string | null,
  formData: FormData,
) {
  await requireUser()
  const raw = Object.fromEntries(formData)
  const result = pagoParcialSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  try {
    await createPagoUnificado({
      tipo_origen: 'NOMINA',
      origen_id: nominaId,
      monto: result.data.monto,
      moneda: result.data.moneda,
      fecha_emision: result.data.fecha,
      instrumento: medioToInstrumento(result.data.medio_pago),
      cuenta_id: result.data.cuenta_id || null,
      notas: result.data.notas || null,
    })
    return null
  } catch (e) {
    return (e as Error).message
  }
}

export async function deletePagoParcialNomina(id: string) {
  await requireUser()
  await deletePagoUnificado(id)
}

// ============ VACACIONES ============

export async function upsertVacaciones(
  empleadoId: string,
  ano: number,
  diasDisponibles: number,
  periodos: { fecha_inicio: string; fecha_fin: string; dias: number; notas?: string }[]
) {
  await requireUser()
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
  await requireUser()
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
  await requireUser()
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
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('configuracion_aportes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/settings/aportes')
}
