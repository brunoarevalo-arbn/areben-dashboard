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
  marcas: z.string().optional().nullable(),
})

function parseMarcas(raw: string | null | undefined): string[] | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return null
    const limpio = arr.filter((x) => typeof x === 'string' && x.length > 0)
    return limpio.length > 0 ? limpio : null
  } catch {
    return null
  }
}

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
    marcas: parseMarcas(result.data.marcas),
    activo: true,
  })
  if (error) return error.message

  revalidatePath('/compras/proveedores')
  revalidatePath('/compras/lista')
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
    marcas: parseMarcas(result.data.marcas),
  }).eq('id', id)
  if (error) return error.message

  revalidatePath('/compras/proveedores')
  revalidatePath('/compras/lista')
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
  negocio: z.enum(['BDI', 'ZATTIA', 'STUNNED', 'GENERAL', 'PRODUCCION']),
  // Solo producción: origen del gasto. '' (o ausente) → null para no ensuciar compras normales.
  categoria_produccion: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.enum(['MANO_DE_OBRA', 'INSUMO', 'AVIO', 'OTRO']).nullable(),
  ).optional(),
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
  const cuit_beneficiario = (formData.get('cuit_beneficiario') as string) || null
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
      cuit_beneficiario: instrumento === 'CHEQUE_FISICO' ? cuit_beneficiario : null,
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
    // CONTADO (efectivo/transferencia) = la plata sale al instante → débito ya efectuado en la fecha de pago.
    // A_PLAZO = pago futuro → queda sin debitar hasta que se confirme la salida.
    const esContado = condicion_pago === 'CONTADO'
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
      cuit_beneficiario: instrumento === 'CHEQUE_FISICO' ? cuit_beneficiario : null,
      debitado: esContado,
      fecha_debito: esContado ? fecha_emision : null,
    })
    if (error) return error.message
  }

  revalidatePath('/compras/lista')
  revalidatePath('/compras/produccion')
  revalidatePath('/finanzas/cierre-mes')
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
  revalidatePath('/compras/produccion')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/cierre-mes')
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
  revalidatePath('/compras/produccion')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/cierre-mes')
  revalidatePath('/egresos/cheques')
  revalidatePath('/egresos/pagos')
  revalidatePath('/finanzas/tarjetas')
}

// ============ PRODUCCIÓN ============
// Marcas a cuyo inventario se puede imputar la producción al pasar a stock.
const MARCAS_PASAJE = ['BDI', 'ZATTIA', 'STUNNED'] as const

// Pasaje etapa 1→2: la tanda deja de contar como "Producción en proceso".
// Marca fecha_pasaje Y la marca de imputación; NO crea otra compra ni toca pagos
// (el costo ya está capturado en estas compras). El neto entra a la posición de
// mercadería de esa marca (ver calcularReposicion), así el PN no cambia con el pasaje.
export async function marcarProduccionPasada(ids: string[], fecha: string, marca: string) {
  await requireUser()
  if (!ids?.length) return 'No hay compras seleccionadas'
  if (!fecha) return 'Falta la fecha de pasaje'
  if (!MARCAS_PASAJE.includes(marca as (typeof MARCAS_PASAJE)[number])) return 'Elegí la marca a la que pasa la producción'
  const supabase = await createClient()
  const { error } = await supabase.from('compras').update({ fecha_pasaje: fecha, marca_pasaje: marca }).in('id', ids)
  if (error) return error.message
  revalidatePath('/compras/produccion')
  revalidatePath('/finanzas/cierre-mes')
  return null
}

// Revertir el pasaje: vuelve a "en proceso" (limpia fecha y marca de imputación).
export async function revertirProduccionPasada(ids: string[]) {
  await requireUser()
  if (!ids?.length) return 'No hay compras seleccionadas'
  const supabase = await createClient()
  const { error } = await supabase.from('compras').update({ fecha_pasaje: null, marca_pasaje: null }).in('id', ids)
  if (error) return error.message
  revalidatePath('/compras/produccion')
  revalidatePath('/finanzas/cierre-mes')
  return null
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

export async function debitarCheque(pagoId: string, fecha?: string, cuentaId?: string) {
  await requireUser()
  const supabase = await createClient()
  const update: { debitado: boolean; fecha_debito: string; cuenta_id?: string } = {
    debitado: true,
    fecha_debito: fecha || new Date().toISOString().split('T')[0],
  }
  if (cuentaId) update.cuenta_id = cuentaId // origen de fondos (editable al debitar)
  const { error } = await supabase
    .from('pagos')
    .update(update)
    .eq('id', pagoId)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/egresos/cheques')
  revalidatePath('/egresos/pagos')
}

// Pago parcial (o total) contra una obligación a cuenta corriente.
// Modelo "split": la fila de obligación (debitado=false, monto = lo que resta) se va
// achicando y cada abono se inserta como fila debitada propia (con su fecha y nota).
// El trigger actualizar_saldo_compra (migración 039) recalcula el saldo de la compra solo,
// porque suma solo los pagos debitados. Pensado para CC ligadas a una COMPRA.
export async function pagarCtaCteParcial(
  pagoId: string,
  input: { monto: number; fecha: string; cuenta_id?: string | null; notas?: string | null }
) {
  await requireUser()
  const supabase = await createClient()

  const { data: pago, error: errPago } = await supabase
    .from('pagos')
    .select('id, compra_id, origen_id, tipo_origen, monto, moneda, fecha_vencimiento, cuenta_id, notas')
    .eq('id', pagoId)
    .single()
  if (errPago || !pago) throw new Error(errPago?.message || 'No se encontró el pago')

  const restante = Number(pago.monto)
  const abono = Number(input.monto)
  if (!abono || abono <= 0) throw new Error('El monto debe ser mayor a cero')
  const fecha = input.fecha || new Date().toISOString().split('T')[0]

  if (abono >= restante - 0.01) {
    // Pago total: debitar la obligación completa (+ datos opcionales)
    const { error } = await supabase
      .from('pagos')
      .update({
        debitado: true,
        fecha_debito: fecha,
        cuenta_id: input.cuenta_id ?? pago.cuenta_id ?? null,
        notas: input.notas ?? pago.notas ?? null,
      })
      .eq('id', pagoId)
    if (error) throw new Error(error.message)
  } else {
    // Pago parcial: 1) achicar la obligación, 2) registrar el abono debitado
    const { error: errUpd } = await supabase
      .from('pagos')
      .update({ monto: restante - abono })
      .eq('id', pagoId)
    if (errUpd) throw new Error(errUpd.message)

    const { error: errIns } = await supabase.from('pagos').insert({
      compra_id: pago.compra_id,
      origen_id: pago.origen_id,
      tipo_origen: pago.tipo_origen,
      monto: abono,
      moneda: pago.moneda,
      fecha_emision: fecha,
      fecha_vencimiento: null,
      condicion_pago: 'CONTADO',
      instrumento: 'CUENTA_CORRIENTE',
      cuenta_id: input.cuenta_id ?? null,
      debitado: true,
      fecha_debito: fecha,
      notas: input.notas ?? null,
    })
    if (errIns) throw new Error(errIns.message)
  }

  revalidatePath('/finanzas/pendientes')
  revalidatePath('/compras/lista')
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
