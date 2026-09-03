'use server'

/**
 * Ledger único de salidas: pagos polimórfico.
 * - COMPRA / GASTO / NOMINA / CUOTA / LIBRE
 * - Saldo de cada origen = monto_total − SUM(pagos.monto WHERE tipo_origen y origen_id matchean)
 * - Auto-marcado: cuando saldo ≤ 0, el origen pasa a PAGADO (compra/gasto/nomina) o pagada=true (cuota)
 */

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { optUuid } from '@/lib/zod-helpers'
import type { TipoOrigenPago, InstrumentoPago } from '@/types/database'

import {
  crearPagoEnLedger,
  recomputarOrigen as recomputarOrigenEnLedger,
  type PagoUnifInput,
} from '@/lib/ledger/pagos'

// ⛔ El tipo NO se re-exporta desde acá: en un archivo `'use server'` todo lo exportado se
// registra como server action, y Turbopack corta el build. Quien lo necesite lo importa de
// `@/lib/ledger/pagos`, que es donde vive.

/**
 * `recomputarOrigen` con la conexión del usuario logueado. El cuerpo vive en `lib/ledger/pagos.ts`
 * desde que la puerta de servicio necesita el mismo cálculo sin sesión.
 */
async function recomputarOrigen(tipo: TipoOrigenPago, origenId: string | null) {
  const supabase = await createClient()
  return recomputarOrigenEnLedger(supabase, tipo, origenId)
}

/**
 * Crea un pago contra una deuda (compra/gasto/nomina/cuota) o un pago LIBRE.
 * Valida que no exceda el saldo pendiente del origen.
 *
 * Es la puerta CON SESIÓN: pide usuario, usa su conexión (que respeta RLS) y revalida las
 * pantallas. El cómo se escribe el pago vive en `lib/ledger/pagos.ts`, compartido con la puerta
 * de servicio por la que entra el Monitor.
 */
export async function createPagoUnificado(input: PagoUnifInput) {
  await requireUser()
  const supabase = await createClient()
  await crearPagoEnLedger(supabase, input)

  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/cierre-mes')
  revalidatePath('/finanzas/tarjetas')
  revalidatePath('/finanzas/prestamos')
  revalidatePath('/rrhh/nomina')
  revalidatePath('/compras/lista')
  revalidatePath('/')
}

/**
 * Borra un pago y recomputa el estado del origen.
 * Bloquea si el pago está dentro de un mes cerrado para su cuenta de origen.
 */
export async function deletePagoUnificado(id: string) {
  await requireUser()
  const supabase = await createClient()
  const { data: pago } = await supabase
    .from('pagos')
    .select('tipo_origen, origen_id, fecha_emision, cuenta_id')
    .eq('id', id)
    .single()
  if (!pago) throw new Error('Pago no encontrado')

  // Guard: si la cuenta del pago tiene saldo cerrado en ese mes, no permitir
  if (pago.cuenta_id && pago.fecha_emision) {
    const mesPago = pago.fecha_emision.substring(0, 7)
    const { data: saldo } = await supabase
      .from('saldos_cuentas')
      .select('cerrado')
      .eq('cuenta_id', pago.cuenta_id)
      .eq('mes', mesPago)
      .maybeSingle()
    if (saldo?.cerrado) {
      throw new Error(`No se puede eliminar: el mes ${mesPago} está cerrado para esa cuenta. Reabrí el saldo del mes para poder borrar.`)
    }
  }

  const { error } = await supabase.from('pagos').delete().eq('id', id)
  if (error) throw new Error(error.message)

  if (pago.tipo_origen !== 'COMPRA') {
    await recomputarOrigen(pago.tipo_origen as TipoOrigenPago, pago.origen_id)
  }

  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/cierre-mes')
  revalidatePath('/finanzas/tarjetas')
  revalidatePath('/finanzas/prestamos')
  revalidatePath('/rrhh/nomina')
  revalidatePath('/compras/lista')
  revalidatePath('/')
}

/**
 * Registra un interés / punitorio asociado al pago de una deuda vencida.
 * Crea un gasto categoría "Gasto Financiero" + pago contra él en el ledger,
 * para que quede contabilizado el costo del retraso.
 */
export async function crearGastoIntereses(args: {
  monto: number
  moneda?: 'ARS' | 'USD'
  fecha: string
  descripcion: string
  cuentaId?: string | null
  concepto?: 'INTERES' | 'PUNITORIO' | 'MORA'
  origenDescripcion?: string
}) {
  await requireUser()
  if (args.monto <= 0) throw new Error('El monto del interés debe ser positivo')
  const conceptoLabel = args.concepto === 'PUNITORIO' ? 'Punitorio'
    : args.concepto === 'MORA' ? 'Mora'
    : 'Interés'
  const supabase = await createClient()

  // 1) Crear gasto financiero
  const { data: gasto, error } = await supabase.from('gastos').insert({
    categoria: 'Gasto Financiero',
    concepto: `${conceptoLabel} — ${args.descripcion}`,
    monto: args.monto,
    monto_neto: args.monto,
    iva_incluido: false,
    porcentaje_iva: 0,
    moneda: args.moneda ?? 'ARS',
    negocio: 'GENERAL',
    mes: args.fecha.substring(0, 7),
    fecha: args.fecha,
    estado: 'PENDIENTE',
    medio_pago: 'TRANSFERENCIA',
    cuenta_id: args.cuentaId || null,
    notas: args.origenDescripcion ? `Punitorio/Interés sobre: ${args.origenDescripcion}` : null,
    confirmado: true,
  }).select('id').single()
  if (error) throw new Error(error.message)
  if (!gasto) throw new Error('No se pudo crear el gasto de intereses')

  // 2) Crear pago contra ese gasto (recomputarOrigen lo deja en PAGADO)
  await createPagoUnificado({
    tipo_origen: 'GASTO',
    origen_id: gasto.id,
    monto: args.monto,
    moneda: args.moneda ?? 'ARS',
    fecha_emision: args.fecha,
    instrumento: 'TRANSFERENCIA',
    cuenta_id: args.cuentaId || null,
    notas: `Pago de ${conceptoLabel.toLowerCase()}`,
  })

  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/pagos')
  revalidatePath('/finanzas/cierre-mes')
  return { ok: 1, gastoId: gasto.id }
}

/**
 * Edita un pago existente — sólo campos no estructurales (notas, datos del cheque,
 * fechas). Para cambiar monto / instrumento / cuenta, eliminá y recreá el pago.
 *
 * Bloquea: pagos debitados (excepto LIBRE) y pagos en meses cerrados de su cuenta.
 */
const editPagoSchema = z.object({
  fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD').optional(),
  fecha_vencimiento: z.string().optional().nullable(),
  fecha_debito: z.string().optional().nullable(),
  cuenta_id: z.string().optional().nullable(),
  numero_cheque: z.string().optional().nullable(),
  banco_emisor: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
})

export async function editPago(pagoId: string, input: z.infer<typeof editPagoSchema>) {
  await requireUser()
  const result = editPagoSchema.safeParse(input)
  if (!result.success) throw new Error(result.error.issues[0].message)

  const supabase = await createClient()
  const { data: pago } = await supabase
    .from('pagos')
    .select('id, tipo_origen, origen_id, debitado, monto, fecha_emision, cuenta_id')
    .eq('id', pagoId)
    .single()
  if (!pago) throw new Error('Pago no encontrado')

  // Un pago ya debitado (no LIBRE) sólo permite corregir campos NO estructurales:
  // fecha real del débito, origen de fondos (cuenta) y notas. Nunca monto/instrumento.
  const esDebitadoNoLibre = pago.debitado && pago.tipo_origen !== 'LIBRE'

  // Guard: si la cuenta del pago tiene saldo cerrado en el mes original o
  // en el mes destino (si cambia la fecha), bloquear.
  const mesesAValidar = new Set<string>()
  if (pago.fecha_emision) mesesAValidar.add(pago.fecha_emision.substring(0, 7))
  if (result.data.fecha_emision) mesesAValidar.add(result.data.fecha_emision.substring(0, 7))
  if (result.data.fecha_debito) mesesAValidar.add(result.data.fecha_debito.substring(0, 7))
  const cuentaValidar = result.data.cuenta_id || pago.cuenta_id
  if (cuentaValidar && mesesAValidar.size > 0) {
    const { data: saldosCerrados } = await supabase
      .from('saldos_cuentas')
      .select('mes')
      .eq('cuenta_id', cuentaValidar)
      .in('mes', Array.from(mesesAValidar))
      .eq('cerrado', true)
    if (saldosCerrados && saldosCerrados.length > 0) {
      throw new Error(`No se puede editar: el mes ${saldosCerrados[0].mes} está cerrado para esa cuenta.`)
    }
  }

  const updates: Record<string, unknown> = {}
  // Campos estructurales: solo para pagos NO debitados.
  if (!esDebitadoNoLibre) {
    if (result.data.fecha_emision !== undefined) updates.fecha_emision = result.data.fecha_emision
    if (result.data.fecha_vencimiento !== undefined) updates.fecha_vencimiento = result.data.fecha_vencimiento || null
    if (result.data.numero_cheque !== undefined) updates.numero_cheque = result.data.numero_cheque || null
    if (result.data.banco_emisor !== undefined) updates.banco_emisor = result.data.banco_emisor || null
  }
  // Campos seguros: permitidos siempre (incluso en debitados).
  if (result.data.fecha_debito !== undefined) updates.fecha_debito = result.data.fecha_debito || null
  if (result.data.cuenta_id !== undefined) updates.cuenta_id = result.data.cuenta_id || null
  if (result.data.notas !== undefined) updates.notas = result.data.notas || null

  if (Object.keys(updates).length === 0) return

  const { error } = await supabase.from('pagos').update(updates).eq('id', pagoId)
  if (error) throw new Error(error.message)

  revalidatePath('/finanzas/pagos')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/cierre-mes')
  revalidatePath('/finanzas/tarjetas')
  revalidatePath('/')
}

/**
 * Asigna un pago LIBRE a una deuda existente. Útil para cheques históricos
 * que se cargaron sin destino y después se identifican.
 */
export async function asignarPagoLibre(pagoId: string, tipoOrigen: TipoOrigenPago, origenId: string) {
  await requireUser()
  if (tipoOrigen === 'LIBRE') throw new Error('No se puede asignar a LIBRE')
  const supabase = await createClient()

  const { error } = await supabase
    .from('pagos')
    .update({
      tipo_origen: tipoOrigen,
      origen_id: origenId,
      compra_id: tipoOrigen === 'COMPRA' ? origenId : null,
    })
    .eq('id', pagoId)
  if (error) throw new Error(error.message)

  await recomputarOrigen(tipoOrigen, origenId)

  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/cierre-mes')
}
