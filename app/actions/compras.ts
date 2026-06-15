'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// ============ PROVEEDORES ============

const proveedorSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(['NACIONAL', 'IMPORTACION']),
  contacto: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  telefono: z.string().optional().nullable(),
  pais: z.string().min(1),
  condiciones_pago: z.string().optional().nullable(),
  moneda: z.enum(['ARS', 'USD']),
  notas: z.string().optional().nullable(),
})

export async function createProveedor(prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = Object.fromEntries(formData)
  const result = proveedorSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('proveedores').insert({
    ...result.data,
    email: result.data.email || null,
    contacto: result.data.contacto || null,
    telefono: result.data.telefono || null,
    condiciones_pago: result.data.condiciones_pago || null,
    notas: result.data.notas || null,
    activo: true,
  })
  if (error) return error.message

  revalidatePath('/compras/proveedores')
  return null
}

export async function updateProveedor(id: string, prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = Object.fromEntries(formData)
  const result = proveedorSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('proveedores').update({
    ...result.data,
    email: result.data.email || null,
    contacto: result.data.contacto || null,
    telefono: result.data.telefono || null,
    condiciones_pago: result.data.condiciones_pago || null,
    notas: result.data.notas || null,
  }).eq('id', id)
  if (error) return error.message

  revalidatePath('/compras/proveedores')
  return null
}

// ============ COMPRAS ============

const INSTRUMENTOS_CHEQUE = ['CHEQUE_FISICO', 'ECHEQ']

const compraSchema = z.object({
  proveedor_id: z.string().uuid(),
  fecha: z.string().min(1),
  descripcion: z.string().min(1),
  cantidad: z.coerce.number().positive(),
  precio_unitario: z.coerce.number().min(0),
  monto_total: z.coerce.number().min(0),
  monto_neto: z.coerce.number().min(0),
  iva: z.coerce.number().min(0),
  porcentaje_facturacion: z.coerce.number().min(0).max(100),
  moneda: z.enum(['ARS', 'USD']),
  tipo_cambio: z.coerce.number().optional().nullable(),
  estado: z.enum(['PENDIENTE', 'PAGADO', 'VENCIDO']),
  fecha_pago: z.string().optional().nullable(),
  negocio: z.enum(['BDI', 'ZATTIA', 'STUNNED', 'GENERAL']),
  notas: z.string().optional().nullable(),
})

export async function createCompra(prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = Object.fromEntries(formData)
  const result = compraSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()

  const { data: compra, error: compraError } = await supabase
    .from('compras')
    .insert({
      ...result.data,
      tipo_cambio: result.data.tipo_cambio || null,
      fecha_pago: result.data.fecha_pago || null,
      notas: result.data.notas || null,
      saldo_pendiente: result.data.monto_total,
    })
    .select('id')
    .single()

  if (compraError) return compraError.message

  const registrarPago = formData.get('registrar_pago') === 'true'
  if (!registrarPago) {
    revalidatePath('/compras/lista')
    return null
  }

  const condicion_pago = formData.get('condicion_pago') as string
  const instrumento = formData.get('instrumento') as string
  const fecha_emision = formData.get('fecha_emision_pago') as string
  const fecha_vencimiento = (formData.get('fecha_vencimiento_pago') as string) || null
  const numero_cheque = (formData.get('numero_cheque') as string) || null
  const cuenta_id = (formData.get('cuenta_id') as string) || null
  const cuotasJson = formData.get('cuotas') as string | null

  if (INSTRUMENTOS_CHEQUE.includes(instrumento) && !fecha_vencimiento) {
    revalidatePath('/compras/lista')
    return null
  }

  if (condicion_pago === 'EN_CUOTAS' && cuotasJson) {
    const cuotas = JSON.parse(cuotasJson) as { monto: number; fecha_vencimiento: string; numero_cheque?: string; cuenta_id?: string }[]
    const rows = cuotas.map((c, i) => ({
      compra_id: compra.id,
      origen_id: compra.id,
      tipo_origen: 'COMPRA',
      monto: c.monto,
      moneda: 'ARS',
      fecha_emision,
      fecha_vencimiento: c.fecha_vencimiento,
      condicion_pago,
      instrumento,
      numero_cheque: c.numero_cheque || numero_cheque || null,
      cuenta_id: c.cuenta_id || cuenta_id || null,
      numero_cuota: i + 1,
      total_cuotas: cuotas.length,
    }))
    const { error } = await supabase.from('pagos').insert(rows)
    if (error) return error.message
  } else if (condicion_pago === 'MIXTO' && cuotasJson) {
    const pagos = JSON.parse(cuotasJson) as {
      monto: number
      fecha_vencimiento: string
      instrumento?: string
      numero_cheque?: string
      cuenta_id?: string
    }[]
    const hoy = new Date().toISOString().split('T')[0]
    const rows = pagos
      .filter((p) => p.monto > 0)
      .map((p) => {
        const inst = p.instrumento || 'EFECTIVO'
        const esContado = inst === 'EFECTIVO' || inst === 'TRANSFERENCIA'
        return {
          compra_id: compra.id,
          origen_id: compra.id,
          tipo_origen: 'COMPRA',
          monto: p.monto,
          moneda: 'ARS',
          fecha_emision: esContado ? (p.fecha_vencimiento || hoy) : hoy,
          fecha_vencimiento: esContado ? null : (p.fecha_vencimiento || null),
          condicion_pago: 'MIXTO',
          instrumento: inst,
          numero_cheque: p.numero_cheque || null,
          cuenta_id: p.cuenta_id || null,
        }
      })
    if (rows.length === 0) {
      return null
    }
    const { error } = await supabase.from('pagos').insert(rows)
    if (error) return error.message
  } else {
    const monto = Number(formData.get('monto_pago') || result.data.monto_total)
    const { error } = await supabase.from('pagos').insert({
      compra_id: compra.id,
      origen_id: compra.id,
      tipo_origen: 'COMPRA',
      monto,
      moneda: 'ARS',
      fecha_emision,
      fecha_vencimiento,
      condicion_pago,
      instrumento,
      numero_cheque,
      cuenta_id,
    })
    if (error) return error.message
  }

  revalidatePath('/compras/lista')
  return null
}

export async function updateCompra(id: string, prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = Object.fromEntries(formData)
  const result = compraSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()

  // Recalcular saldo_pendiente: monto_total - SUM(pagos.monto)
  const { data: pagos } = await supabase
    .from('pagos')
    .select('monto')
    .eq('compra_id', id)
  const totalPagado = (pagos ?? []).reduce((s, p) => s + Number(p.monto), 0)
  const saldoPendiente = Math.max(result.data.monto_total - totalPagado, 0)

  const { error } = await supabase.from('compras').update({
    ...result.data,
    tipo_cambio: result.data.tipo_cambio || null,
    fecha_pago: result.data.fecha_pago || null,
    notas: result.data.notas || null,
    saldo_pendiente: saldoPendiente,
    estado: saldoPendiente <= 0 ? 'PAGADO' : (result.data.estado === 'PAGADO' ? 'PENDIENTE' : result.data.estado),
  }).eq('id', id)
  if (error) return error.message

  revalidatePath('/compras/lista')
  revalidatePath('/finanzas/pendientes')
  return null
}

export async function deleteCompra(id: string) {
  await requireUser()
  const supabase = await createClient()

  // Cascade manual: borrar dependencias antes que la compra
  // 1. Cuotas de tarjeta originadas por esta compra
  await supabase.from('cuotas_tarjeta').delete().eq('origen_tipo', 'COMPRA').eq('origen_id', id)
  // 2. Pagos asociados (FK con ON DELETE RESTRICT)
  const { error: errPagos } = await supabase.from('pagos').delete().eq('compra_id', id)
  if (errPagos) throw new Error(`No se pudieron eliminar pagos asociados: ${errPagos.message}`)
  // 3. Costeo de importación (CASCADE en DB pero por seguridad)
  await supabase.from('costeo_importacion').delete().eq('compra_id', id)

  // 4. Finalmente la compra
  const { error } = await supabase.from('compras').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/compras/lista')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/egresos/cheques')
  revalidatePath('/egresos/pagos')
  revalidatePath('/finanzas/tarjetas')
}

// ============ PAGOS ============

export async function createPago(prevState: string | null, formData: FormData) {
  await requireUser()
  const compra_id = formData.get('compra_id') as string
  const fecha_emision = formData.get('fecha_emision') as string
  const condicion_pago = formData.get('condicion_pago') as string
  const instrumento = formData.get('instrumento') as string
  const fecha_vencimiento = (formData.get('fecha_vencimiento') as string) || null
  const numero_cheque = (formData.get('numero_cheque') as string) || null
  const banco_emisor = (formData.get('banco_emisor') as string) || null
  const notas = (formData.get('notas') as string) || null
  const cuotasJson = formData.get('cuotas') as string | null

  if (!compra_id || !fecha_emision || !condicion_pago || !instrumento) {
    return 'Faltan campos obligatorios'
  }

  if (INSTRUMENTOS_CHEQUE.includes(instrumento) && !fecha_vencimiento) {
    return 'El cheque requiere una fecha de cobro/vencimiento obligatoria'
  }

  const supabase = await createClient()

  if (condicion_pago === 'EN_CUOTAS' && cuotasJson) {
    let cuotas: { monto: number; fecha_vencimiento: string; numero_cheque?: string; banco_emisor?: string }[]
    try {
      cuotas = JSON.parse(cuotasJson)
    } catch {
      return 'Error al procesar las cuotas'
    }

    if (!cuotas.length) return 'Debe haber al menos una cuota'
    if (cuotas.some((c) => !c.monto || c.monto <= 0)) return 'Todos los montos de cuotas deben ser positivos'
    if (cuotas.some((c) => !c.fecha_vencimiento)) return 'Todas las cuotas requieren fecha de vencimiento'

    const rows = cuotas.map((c, i) => ({
      compra_id,
      origen_id: compra_id,
      tipo_origen: 'COMPRA',
      monto: c.monto,
      moneda: 'ARS',
      fecha_emision,
      fecha_vencimiento: c.fecha_vencimiento,
      condicion_pago,
      instrumento,
      // Cada cuota tiene su propio número/banco si es cheque; fallback a globales si vinieron
      numero_cheque: c.numero_cheque || numero_cheque || null,
      banco_emisor: c.banco_emisor || banco_emisor || null,
      numero_cuota: i + 1,
      total_cuotas: cuotas.length,
      notas: notas || null,
    }))

    const { error } = await supabase.from('pagos').insert(rows)
    if (error) return error.message
  } else {
    const monto = Number(formData.get('monto'))
    if (!monto || monto <= 0) return 'El monto debe ser mayor a cero'

    const { error } = await supabase.from('pagos').insert({
      compra_id,
      origen_id: compra_id,
      tipo_origen: 'COMPRA',
      monto,
      moneda: 'ARS',
      fecha_emision,
      fecha_vencimiento,
      condicion_pago,
      instrumento,
      numero_cheque,
      banco_emisor,
      notas,
    })
    if (error) return error.message
  }

  revalidatePath('/compras/lista')
  return null
}

// ============ CHEQUES ============

export async function acreditarCheque(pagoId: string, fecha?: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('pagos')
    .update({
      acreditado: true,
      fecha_acreditacion: fecha || new Date().toISOString().split('T')[0],
    })
    .eq('id', pagoId)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/egresos/cheques')
  revalidatePath('/egresos/pagos')
}

// ============ DATOS GN ============

const datosGNSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  marca: z.enum(['BDI', 'ZATTIA', 'STUNNED', 'GENERAL']),
  ventas_brutas: z.coerce.number().min(0),
  devoluciones: z.coerce.number().min(0),
  ventas_netas: z.coerce.number().min(0),
  cmv: z.coerce.number().min(0),
  cantidad_vendida: z.coerce.number().int().min(0),
  comisiones: z.coerce.number().min(0),
})

export async function upsertDatosGN(prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = Object.fromEntries(formData)
  const result = datosGNSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const d = result.data
  const margen_pesos = d.ventas_netas - d.cmv
  const margen_porcentaje = d.ventas_netas > 0 ? (margen_pesos / d.ventas_netas) * 100 : 0

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('datos_ventas_gn').upsert(
    {
      ...d,
      margen_pesos,
      margen_porcentaje,
      fecha_sincronizacion: new Date().toISOString(),
      sincronizado_por: user?.email ?? 'manual',
    },
    { onConflict: 'mes,marca' }
  )
  if (error) return error.message

  revalidatePath('/analisis/ventas')
  revalidatePath('/analisis/pl-marca')
  revalidatePath('/')
  return null
}
