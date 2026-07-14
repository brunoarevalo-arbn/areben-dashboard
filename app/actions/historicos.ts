'use server'

/**
 * Server actions para cargar pasivos históricos (mes 0):
 * - Cuotas de tarjeta ya en circulación sin compra original
 * - Cuentas corrientes con proveedor (deudas a plazo)
 * - Gastos pendientes que vienen del pasado
 *
 * El flujo normal (compras, gastos, retiros nuevos) genera sus pasivos automáticamente;
 * estos actions son sólo para arrancar con saldos preexistentes.
 */

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createPagoUnificado } from './pagos'

// ─── Cuotas históricas ────────────────────────────────────────────────────────

const cuotaHistoricaSchema = z.object({
  tarjeta_id: z.string().uuid('Seleccioná una tarjeta'),
  concepto: z.string().min(1, 'Concepto obligatorio'),
  monto_cuota: z.coerce.number().positive('Monto debe ser positivo'),
  cuotas_restantes: z.coerce.number().int().min(1).max(60),
  cuota_actual: z.coerce.number().int().min(1).default(1), // n° de la primera cuota a cargar (ej: 3 si ya pagó 2)
  cuotas_total_original: z.coerce.number().int().min(1).default(1),
  primer_mes_vencimiento: z.string().regex(/^\d{4}-\d{2}$/, 'Formato YYYY-MM'),
})

/**
 * Carga N cuotas restantes en cuotas_tarjeta sin generar la compra.
 * Cada cuota va a `origen_tipo='MANUAL'`, `origen_id=NULL` con concepto descriptivo.
 */
export async function crearCuotasHistoricas(input: z.infer<typeof cuotaHistoricaSchema>) {
  await requireUser()
  const result = cuotaHistoricaSchema.safeParse(input)
  if (!result.success) throw new Error(result.error.issues[0].message)
  const d = result.data

  const supabase = await createClient()
  const [y, m] = d.primer_mes_vencimiento.split('-').map(Number)

  const rows = Array.from({ length: d.cuotas_restantes }, (_, i) => {
    const mesV = new Date(y, m - 1 + i, 1)
    const mesC = new Date(y, m - 2 + i, 1) // mes de cierre = mes anterior al vencimiento
    const cuotaNumero = d.cuota_actual + i
    return {
      tarjeta_id: d.tarjeta_id,
      origen_tipo: 'MANUAL',
      origen_id: null,
      concepto: `${d.concepto} (cuota ${cuotaNumero}/${d.cuotas_total_original}) [HISTÓRICO]`,
      monto_total: d.monto_cuota * d.cuotas_restantes,
      cuotas_total: d.cuotas_total_original,
      cuota_numero: cuotaNumero,
      monto_cuota: d.monto_cuota,
      mes_cierre: `${mesC.getFullYear()}-${String(mesC.getMonth() + 1).padStart(2, '0')}`,
      mes_vencimiento: `${mesV.getFullYear()}-${String(mesV.getMonth() + 1).padStart(2, '0')}`,
      pagada: false,
    }
  })

  const { error } = await supabase.from('cuotas_tarjeta').insert(rows)
  if (error) throw new Error(error.message)

  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/tarjetas')
  revalidatePath('/finanzas/cierre-mes')
  return { ok: rows.length }
}

/**
 * Edita una cuota histórica (origen_tipo=MANUAL). No editable si ya está pagada.
 */
const editCuotaSchema = z.object({
  concepto: z.string().min(1).optional(),
  monto_cuota: z.coerce.number().positive('Debe ser positivo').optional(),
  mes_vencimiento: z.string().regex(/^\d{4}-\d{2}$/, 'Formato YYYY-MM').optional(),
})

export async function editCuotaHistorica(cuotaId: string, input: z.infer<typeof editCuotaSchema>) {
  await requireUser()
  const result = editCuotaSchema.safeParse(input)
  if (!result.success) throw new Error(result.error.issues[0].message)

  const supabase = await createClient()
  const { data: c } = await supabase
    .from('cuotas_tarjeta')
    .select('id, origen_tipo, pagada')
    .eq('id', cuotaId)
    .single()
  if (!c) throw new Error('Cuota no encontrada')
  if (c.origen_tipo !== 'MANUAL') {
    throw new Error('Sólo se pueden editar cuotas históricas (origen MANUAL).')
  }
  if (c.pagada) {
    throw new Error('La cuota ya está pagada. Borrá el pago primero.')
  }

  const updates: Record<string, unknown> = {}
  if (result.data.concepto !== undefined) updates.concepto = result.data.concepto
  if (result.data.monto_cuota !== undefined) updates.monto_cuota = result.data.monto_cuota
  if (result.data.mes_vencimiento !== undefined) {
    updates.mes_vencimiento = result.data.mes_vencimiento
    // Recalcular mes_cierre como mes anterior al vencimiento
    const [y, m] = result.data.mes_vencimiento.split('-').map(Number)
    const mc = new Date(y, m - 2, 1)
    updates.mes_cierre = `${mc.getFullYear()}-${String(mc.getMonth() + 1).padStart(2, '0')}`
  }

  const { error } = await supabase.from('cuotas_tarjeta').update(updates).eq('id', cuotaId)
  if (error) throw new Error(error.message)

  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/tarjetas')
  revalidatePath('/finanzas/cierre-mes')
}

// ─── Cuenta corriente histórica ───────────────────────────────────────────────

const ctaCteHistoricaSchema = z.object({
  proveedor_id: z.string().uuid('Seleccioná un proveedor'),
  monto: z.coerce.number().positive('Monto debe ser positivo'),
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
  fecha_origen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD'),
  fecha_vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD'),
  notas: z.string().optional().nullable(),
})

/**
 * Carga una deuda en cuenta corriente con proveedor sin compra detallada.
 * Crea: una compra histórica + un pago cta cte pendiente. Cuando se debite el pago,
 * el flujo normal cierra la compra.
 */
export async function crearCtaCteHistorica(input: z.infer<typeof ctaCteHistoricaSchema>) {
  await requireUser()
  const result = ctaCteHistoricaSchema.safeParse(input)
  if (!result.success) throw new Error(result.error.issues[0].message)
  const d = result.data

  const supabase = await createClient()

  // 1) Crear compra histórica (sin desglose IVA, marcada como histórica)
  const { data: compra, error: errCompra } = await supabase
    .from('compras')
    .insert({
      proveedor_id: d.proveedor_id,
      descripcion: `Saldo histórico${d.notas ? ` — ${d.notas}` : ''}`,
      fecha: d.fecha_origen,
      negocio: 'GENERAL',
      moneda: d.moneda,
      cantidad: 1,
      precio_unitario: d.monto,
      monto_total: d.monto,
      monto_neto: d.monto,
      iva: 0,
      porcentaje_facturacion: 0,
      saldo_pendiente: d.monto,
      estado: 'PENDIENTE',
      notas: '[HISTÓRICO]',
    })
    .select('id')
    .single()
  if (errCompra) throw new Error(errCompra.message)
  if (!compra) throw new Error('No se pudo crear la compra histórica')

  // 2) Crear el pago cta cte pendiente (no debitado, con vencimiento)
  const { error: errPago } = await supabase.from('pagos').insert({
    tipo_origen: 'COMPRA',
    origen_id: compra.id,
    compra_id: compra.id,
    monto: d.monto,
    moneda: d.moneda,
    fecha_emision: d.fecha_origen,
    fecha_vencimiento: d.fecha_vencimiento,
    condicion_pago: 'A_PLAZO',
    instrumento: 'CUENTA_CORRIENTE',
    notas: `[HISTÓRICO]${d.notas ? ` ${d.notas}` : ''}`,
    debitado: false,
  })
  if (errPago) {
    // Rollback manual: borrar la compra que quedó huérfana
    await supabase.from('compras').delete().eq('id', compra.id)
    throw new Error(errPago.message)
  }

  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/cierre-mes')
  revalidatePath('/compras/lista')
  return { ok: 1, compraId: compra.id }
}

// ─── Gasto pendiente histórico ────────────────────────────────────────────────

const gastoHistoricoSchema = z.object({
  concepto: z.string().min(1, 'Concepto obligatorio'),
  categoria: z.string().min(1, 'Categoría obligatoria'),
  monto: z.coerce.number().positive('Monto debe ser positivo'),
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
  iva_incluido: z.coerce.boolean().default(false),
  porcentaje_iva: z.coerce.number().min(0).max(100).default(21),
  negocio: z.enum(['BDI', 'ZATTIA', 'STUNNED', 'GENERAL']).default('GENERAL'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD'),
  fecha_pago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD'),
  notas: z.string().optional().nullable(),
})

/**
 * Carga un gasto pendiente que vino del pasado (sin pago todavía).
 * Crea una fila en `gastos` con estado PENDIENTE y nota "[HISTÓRICO]".
 */
export async function crearGastoHistorico(input: z.infer<typeof gastoHistoricoSchema>) {
  await requireUser()
  const result = gastoHistoricoSchema.safeParse(input)
  if (!result.success) throw new Error(result.error.issues[0].message)
  const d = result.data

  const monto_neto = d.iva_incluido && d.porcentaje_iva > 0
    ? Math.round((d.monto / (1 + d.porcentaje_iva / 100)) * 100) / 100
    : d.monto

  const supabase = await createClient()
  const { error } = await supabase.from('gastos').insert({
    categoria: d.categoria,
    concepto: d.concepto,
    monto: d.monto,
    monto_neto,
    iva_incluido: d.iva_incluido,
    porcentaje_iva: d.porcentaje_iva,
    moneda: d.moneda,
    negocio: d.negocio,
    mes: d.fecha.substring(0, 7),
    fecha: d.fecha,
    estado: 'PENDIENTE',
    fecha_pago: d.fecha_pago,
    medio_pago: 'TRANSFERENCIA',
    notas: `[HISTÓRICO]${d.notas ? ` ${d.notas}` : ''}`,
    confirmado: true,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/cierre-mes')
  return { ok: 1 }
}

// ─── Imports masivos desde Excel ──────────────────────────────────────────────

interface ChequeImport {
  numero?: string
  banco?: string
  tipo?: string // CHEQUE_FISICO o ECHEQ
  monto?: number
  moneda?: string
  fecha_emision?: string
  fecha_vencimiento?: string
  notas?: string
}

export async function importChequesHistoricos(rows: ChequeImport[]) {
  await requireUser()
  if (!rows.length) return { ok: 0, errors: ['No hay filas para importar'] }
  const errors: string[] = []
  let ok = 0
  for (const [i, row] of rows.entries()) {
    const linea = i + 2
    if (!row.monto || row.monto <= 0) { errors.push(`Fila ${linea}: monto requerido`); continue }
    if (!row.fecha_emision) { errors.push(`Fila ${linea}: fecha emisión requerida`); continue }
    if (!row.fecha_vencimiento) { errors.push(`Fila ${linea}: fecha vencimiento requerida`); continue }
    try {
      const tipo = row.tipo === 'ECHEQ' ? 'ECHEQ' : 'CHEQUE_FISICO'
      await createPagoUnificado({
        tipo_origen: 'LIBRE',
        origen_id: null,
        monto: Number(row.monto),
        moneda: row.moneda === 'USD' ? 'USD' : 'ARS',
        fecha_emision: String(row.fecha_emision),
        fecha_vencimiento: String(row.fecha_vencimiento),
        instrumento: tipo,
        numero_cheque: row.numero ? String(row.numero) : null,
        banco_emisor: row.banco ? String(row.banco) : null,
        notas: row.notas ? `${row.notas} (HISTÓRICO)` : 'Cheque histórico — sin asignar',
      })
      ok++
    } catch (e) {
      errors.push(`Fila ${linea}: ${(e as Error).message}`)
    }
  }
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/cierre-mes')
  return { ok, errors }
}

interface CuotaHistImport {
  tarjeta_nombre?: string
  concepto?: string
  monto_cuota?: number
  cuotas_restantes?: number
  cuota_actual?: number
  cuotas_total?: number
  primer_mes_vencimiento?: string // YYYY-MM
}

export async function importCuotasHistoricas(rows: CuotaHistImport[]) {
  await requireUser()
  if (!rows.length) return { ok: 0, errors: ['No hay filas para importar'] }
  const supabase = await createClient()
  const { data: tarjetas } = await supabase.from('tarjetas_credito').select('id, nombre').eq('activo', true)
  const tarjetaByNombre = new Map<string, string>()
  for (const t of tarjetas ?? []) tarjetaByNombre.set(String(t.nombre).trim().toLowerCase(), t.id)

  const errors: string[] = []
  let ok = 0
  for (const [i, row] of rows.entries()) {
    const linea = i + 2
    if (!row.tarjeta_nombre) { errors.push(`Fila ${linea}: tarjeta_nombre requerido`); continue }
    const tarjetaId = tarjetaByNombre.get(String(row.tarjeta_nombre).trim().toLowerCase())
    if (!tarjetaId) { errors.push(`Fila ${linea}: tarjeta "${row.tarjeta_nombre}" no encontrada`); continue }
    if (!row.concepto?.trim()) { errors.push(`Fila ${linea}: concepto requerido`); continue }
    if (!row.monto_cuota || row.monto_cuota <= 0) { errors.push(`Fila ${linea}: monto_cuota requerido`); continue }
    if (!row.cuotas_restantes || row.cuotas_restantes < 1) { errors.push(`Fila ${linea}: cuotas_restantes requerido`); continue }
    if (!row.primer_mes_vencimiento || !/^\d{4}-\d{2}$/.test(String(row.primer_mes_vencimiento))) {
      errors.push(`Fila ${linea}: primer_mes_vencimiento formato YYYY-MM requerido`); continue
    }
    try {
      await crearCuotasHistoricas({
        tarjeta_id: tarjetaId,
        concepto: String(row.concepto),
        monto_cuota: Number(row.monto_cuota),
        cuotas_restantes: Number(row.cuotas_restantes),
        cuota_actual: Number(row.cuota_actual ?? 1),
        cuotas_total_original: Number(row.cuotas_total ?? row.cuotas_restantes),
        primer_mes_vencimiento: String(row.primer_mes_vencimiento),
      })
      ok++
    } catch (e) {
      errors.push(`Fila ${linea}: ${(e as Error).message}`)
    }
  }
  return { ok, errors }
}

interface CtaCteHistImport {
  proveedor_nombre?: string
  monto?: number
  moneda?: string
  fecha_origen?: string
  fecha_vencimiento?: string
  notas?: string
}

export async function importCtaCteHistoricas(rows: CtaCteHistImport[]) {
  await requireUser()
  if (!rows.length) return { ok: 0, errors: ['No hay filas para importar'] }
  const supabase = await createClient()
  const { data: provs } = await supabase.from('proveedores').select('id, nombre').eq('activo', true)
  const provByNombre = new Map<string, string>()
  for (const p of provs ?? []) provByNombre.set(String(p.nombre).trim().toLowerCase(), p.id)

  const errors: string[] = []
  let ok = 0
  for (const [i, row] of rows.entries()) {
    const linea = i + 2
    if (!row.proveedor_nombre) { errors.push(`Fila ${linea}: proveedor_nombre requerido`); continue }
    const proveedorId = provByNombre.get(String(row.proveedor_nombre).trim().toLowerCase())
    if (!proveedorId) { errors.push(`Fila ${linea}: proveedor "${row.proveedor_nombre}" no encontrado`); continue }
    if (!row.monto || row.monto <= 0) { errors.push(`Fila ${linea}: monto requerido`); continue }
    if (!row.fecha_origen) { errors.push(`Fila ${linea}: fecha_origen requerida`); continue }
    if (!row.fecha_vencimiento) { errors.push(`Fila ${linea}: fecha_vencimiento requerida`); continue }
    try {
      await crearCtaCteHistorica({
        proveedor_id: proveedorId,
        monto: Number(row.monto),
        moneda: row.moneda === 'USD' ? 'USD' : 'ARS',
        fecha_origen: String(row.fecha_origen),
        fecha_vencimiento: String(row.fecha_vencimiento),
        notas: row.notas ?? null,
      })
      ok++
    } catch (e) {
      errors.push(`Fila ${linea}: ${(e as Error).message}`)
    }
  }
  return { ok, errors }
}

interface GastoHistImport {
  concepto?: string
  categoria?: string
  monto?: number
  moneda?: string
  iva_incluido?: boolean | string
  porcentaje_iva?: number
  negocio?: string
  fecha?: string
  fecha_pago?: string
  notas?: string
}

export async function importGastosHistoricos(rows: GastoHistImport[]) {
  await requireUser()
  if (!rows.length) return { ok: 0, errors: ['No hay filas para importar'] }
  const errors: string[] = []
  let ok = 0
  const NEGOCIOS = ['BDI', 'ZATTIA', 'STUNNED', 'GENERAL'] as const
  for (const [i, row] of rows.entries()) {
    const linea = i + 2
    if (!row.concepto?.trim()) { errors.push(`Fila ${linea}: concepto requerido`); continue }
    if (!row.categoria?.trim()) { errors.push(`Fila ${linea}: categoría requerida`); continue }
    if (!row.monto || row.monto <= 0) { errors.push(`Fila ${linea}: monto requerido`); continue }
    if (!row.fecha) { errors.push(`Fila ${linea}: fecha requerida`); continue }
    if (!row.fecha_pago) { errors.push(`Fila ${linea}: fecha_pago requerida`); continue }
    try {
      await crearGastoHistorico({
        concepto: String(row.concepto),
        categoria: String(row.categoria),
        monto: Number(row.monto),
        moneda: row.moneda === 'USD' ? 'USD' : 'ARS',
        iva_incluido: row.iva_incluido === true || row.iva_incluido === 'true' || row.iva_incluido === 'SI',
        porcentaje_iva: Number(row.porcentaje_iva ?? 21),
        negocio: NEGOCIOS.includes(row.negocio as typeof NEGOCIOS[number]) ? row.negocio as typeof NEGOCIOS[number] : 'GENERAL',
        fecha: String(row.fecha),
        fecha_pago: String(row.fecha_pago),
        notas: row.notas ?? null,
      })
      ok++
    } catch (e) {
      errors.push(`Fila ${linea}: ${(e as Error).message}`)
    }
  }
  return { ok, errors }
}
