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

const TIPO_ORIGEN: TipoOrigenPago[] = ['COMPRA', 'GASTO', 'NOMINA', 'CUOTA', 'LIBRE', 'PRESTAMO']
const INSTRUMENTOS: InstrumentoPago[] = ['EFECTIVO', 'TRANSFERENCIA', 'CUENTA_CORRIENTE', 'CHEQUE_FISICO', 'ECHEQ', 'TARJETA']

const pagoUnifSchema = z.object({
  tipo_origen: z.enum(TIPO_ORIGEN as [TipoOrigenPago, ...TipoOrigenPago[]]),
  origen_id: optUuid,
  monto: z.coerce.number().positive('El monto debe ser positivo'),
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
  fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD'),
  fecha_vencimiento: z.string().optional().nullable(),
  instrumento: z.enum(INSTRUMENTOS as [InstrumentoPago, ...InstrumentoPago[]]),
  cuenta_id: optUuid,
  numero_cheque: z.string().optional().nullable(),
  banco_emisor: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
})

export type PagoUnifInput = z.infer<typeof pagoUnifSchema>

/**
 * Recalcula el estado del origen del pago: marca PAGADO/pagada=true si total pagado >= total deuda;
 * revierte a PENDIENTE si se borró un pago y ya no está completamente paga.
 */
async function recomputarOrigen(tipo: TipoOrigenPago, origenId: string | null) {
  if (!origenId || tipo === 'LIBRE' || tipo === 'COMPRA') {
    // COMPRA tiene su propio trigger SQL (actualizar_saldo_compra). LIBRE no tiene origen.
    return
  }

  const supabase = await createClient()

  // Sum total pagado para este origen (sólo pagos debitados o sin marca de no-debitado)
  const { data: pagosRel } = await supabase
    .from('pagos')
    .select('monto, fecha_emision')
    .eq('tipo_origen', tipo)
    .eq('origen_id', origenId)
  const totalPagado = (pagosRel ?? []).reduce((s, p) => s + Number(p.monto), 0)
  // Fecha real en que quedó saldado = la del último pago cargado (no "hoy"). Así el cierre
  // (que netea por fecha) refleja cuándo se pagó de verdad, no cuándo se tocó el sistema.
  const fechaUltimoPago =
    (pagosRel ?? [])
      .map((p) => p.fecha_emision)
      .filter((f): f is string => !!f)
      .sort()
      .at(-1) ?? new Date().toISOString().split('T')[0]

  if (tipo === 'GASTO') {
    const { data: g } = await supabase
      .from('gastos')
      .select('monto, estado')
      .eq('id', origenId)
      .single()
    if (!g) return
    const total = Number(g.monto)
    const completo = totalPagado + 0.01 >= total
    if (completo && g.estado !== 'PAGADO') {
      await supabase
        .from('gastos')
        .update({ estado: 'PAGADO', fecha_pago: fechaUltimoPago })
        .eq('id', origenId)
    } else if (!completo && g.estado === 'PAGADO') {
      await supabase
        .from('gastos')
        .update({ estado: 'PENDIENTE', fecha_pago: null })
        .eq('id', origenId)
    }
    return
  }

  if (tipo === 'NOMINA') {
    const { data: n } = await supabase
      .from('nomina_mensual')
      .select('neto, estado, gasto_pendiente_id')
      .eq('id', origenId)
      .single()
    if (!n) return
    const total = Number(n.neto)
    const completo = totalPagado + 0.01 >= total
    if (completo && n.estado !== 'PAGADO') {
      await supabase.from('nomina_mensual').update({ estado: 'PAGADO' }).eq('id', origenId)
      if (n.gasto_pendiente_id) {
        await supabase.from('gastos')
          .update({ estado: 'PAGADO', fecha_pago: fechaUltimoPago })
          .eq('id', n.gasto_pendiente_id)
      }
    } else if (!completo && n.estado === 'PAGADO') {
      await supabase.from('nomina_mensual').update({ estado: 'PENDIENTE' }).eq('id', origenId)
      if (n.gasto_pendiente_id) {
        await supabase.from('gastos')
          .update({ estado: 'PENDIENTE', fecha_pago: null })
          .eq('id', n.gasto_pendiente_id)
      }
    }
    return
  }

  if (tipo === 'CUOTA') {
    const { data: c } = await supabase
      .from('cuotas_tarjeta')
      .select('monto_cuota, pagada')
      .eq('id', origenId)
      .single()
    if (!c) return
    const total = Number(c.monto_cuota)
    const completo = totalPagado + 0.01 >= total
    if (completo && !c.pagada) {
      await supabase
        .from('cuotas_tarjeta')
        .update({ pagada: true, fecha_pago: fechaUltimoPago })
        .eq('id', origenId)
    } else if (!completo && c.pagada) {
      await supabase
        .from('cuotas_tarjeta')
        .update({ pagada: false, fecha_pago: null })
        .eq('id', origenId)
    }
    return
  }

  if (tipo === 'PRESTAMO') {
    const { data: c } = await supabase
      .from('prestamo_cuotas')
      .select('monto_total, pagada, prestamo_id, fecha_vencimiento')
      .eq('id', origenId)
      .single()
    if (!c) return
    const total = Number(c.monto_total)
    const completo = totalPagado + 0.01 >= total
    if (completo && !c.pagada) {
      await supabase
        .from('prestamo_cuotas')
        .update({ pagada: true, fecha_pago: fechaUltimoPago })
        .eq('id', origenId)
      // Marcar el gasto financiero (interés) de ese mes como PAGADO
      await supabase
        .from('gastos')
        .update({ estado: 'PAGADO', fecha_pago: fechaUltimoPago })
        .eq('prestamo_id', c.prestamo_id)
        .eq('mes', c.fecha_vencimiento.substring(0, 7))
        .eq('categoria', 'Gastos Financieros')
    } else if (!completo && c.pagada) {
      await supabase
        .from('prestamo_cuotas')
        .update({ pagada: false, fecha_pago: null })
        .eq('id', origenId)
      await supabase
        .from('gastos')
        .update({ estado: 'PENDIENTE', fecha_pago: c.fecha_vencimiento })
        .eq('prestamo_id', c.prestamo_id)
        .eq('mes', c.fecha_vencimiento.substring(0, 7))
        .eq('categoria', 'Gastos Financieros')
    }
    return
  }
}

/**
 * Crea un pago contra una deuda (compra/gasto/nomina/cuota) o un pago LIBRE.
 * Valida que no exceda el saldo pendiente del origen.
 */
export async function createPagoUnificado(input: PagoUnifInput) {
  await requireUser()
  const result = pagoUnifSchema.safeParse(input)
  if (!result.success) throw new Error(result.error.issues[0].message)
  const d = result.data

  // Validar origen y saldo (excepto LIBRE)
  if (d.tipo_origen !== 'LIBRE') {
    if (!d.origen_id) throw new Error('Se requiere origen_id para este tipo')
    const supabase = await createClient()

    let totalDeuda = 0
    if (d.tipo_origen === 'COMPRA') {
      const { data } = await supabase.from('compras').select('saldo_pendiente, monto_total').eq('id', d.origen_id).single()
      totalDeuda = Number(data?.saldo_pendiente ?? data?.monto_total ?? 0)
    } else if (d.tipo_origen === 'GASTO') {
      const { data } = await supabase.from('gastos').select('monto').eq('id', d.origen_id).single()
      totalDeuda = Number(data?.monto ?? 0)
    } else if (d.tipo_origen === 'NOMINA') {
      const { data } = await supabase.from('nomina_mensual').select('neto').eq('id', d.origen_id).single()
      totalDeuda = Number(data?.neto ?? 0)
    } else if (d.tipo_origen === 'CUOTA') {
      const { data } = await supabase.from('cuotas_tarjeta').select('monto_cuota').eq('id', d.origen_id).single()
      totalDeuda = Number(data?.monto_cuota ?? 0)
    } else if (d.tipo_origen === 'PRESTAMO') {
      const { data } = await supabase.from('prestamo_cuotas').select('monto_total').eq('id', d.origen_id).single()
      totalDeuda = Number(data?.monto_total ?? 0)
    }

    // Para gastos/nomina/cuota: comparar contra suma ya pagada (compra usa saldo_pendiente)
    if (d.tipo_origen !== 'COMPRA') {
      const { data: prev } = await supabase
        .from('pagos')
        .select('monto')
        .eq('tipo_origen', d.tipo_origen)
        .eq('origen_id', d.origen_id)
      const yaPagado = (prev ?? []).reduce((s, p) => s + Number(p.monto), 0)
      if (yaPagado + d.monto > totalDeuda + 0.01) {
        const restante = Math.max(0, totalDeuda - yaPagado)
        throw new Error(`Excede el saldo pendiente. Quedan $${restante.toFixed(2)}.`)
      }
    } else {
      // COMPRA: validar contra saldo_pendiente (que ya descontó pagos previos)
      if (d.monto > totalDeuda + 0.01) {
        throw new Error(`Excede el saldo pendiente. Quedan $${totalDeuda.toFixed(2)}.`)
      }
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('pagos').insert({
    tipo_origen: d.tipo_origen,
    origen_id: d.origen_id || null,
    compra_id: d.tipo_origen === 'COMPRA' ? d.origen_id : null,
    monto: d.monto,
    moneda: d.moneda,
    fecha_emision: d.fecha_emision,
    fecha_vencimiento: d.fecha_vencimiento || null,
    condicion_pago: 'CONTADO',
    instrumento: d.instrumento,
    numero_cheque: d.numero_cheque || null,
    banco_emisor: d.banco_emisor || null,
    cuenta_id: d.cuenta_id || null,
    notas: d.notas || null,
    debitado: ['EFECTIVO', 'TRANSFERENCIA'].includes(d.instrumento),
    fecha_debito: ['EFECTIVO', 'TRANSFERENCIA'].includes(d.instrumento) ? d.fecha_emision : null,
  })
  if (error) throw new Error(error.message)

  if (d.tipo_origen !== 'COMPRA') {
    await recomputarOrigen(d.tipo_origen, d.origen_id ?? null)
  }
  // COMPRA: el trigger SQL (actualizar_saldo_compra) ya recomputa saldo_pendiente y estado

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

  if (pago.debitado && pago.tipo_origen !== 'LIBRE') {
    throw new Error('No se puede editar un pago ya debitado. Borralo y volvé a cargar.')
  }

  // Guard: si la cuenta del pago tiene saldo cerrado en el mes original o
  // en el mes destino (si cambia la fecha), bloquear.
  const mesesAValidar = new Set<string>()
  if (pago.fecha_emision) mesesAValidar.add(pago.fecha_emision.substring(0, 7))
  if (result.data.fecha_emision) mesesAValidar.add(result.data.fecha_emision.substring(0, 7))
  if (pago.cuenta_id && mesesAValidar.size > 0) {
    const { data: saldosCerrados } = await supabase
      .from('saldos_cuentas')
      .select('mes')
      .eq('cuenta_id', pago.cuenta_id)
      .in('mes', Array.from(mesesAValidar))
      .eq('cerrado', true)
    if (saldosCerrados && saldosCerrados.length > 0) {
      throw new Error(`No se puede editar: el mes ${saldosCerrados[0].mes} está cerrado para esa cuenta.`)
    }
  }

  const updates: Record<string, unknown> = {}
  if (result.data.fecha_emision !== undefined) updates.fecha_emision = result.data.fecha_emision
  if (result.data.fecha_vencimiento !== undefined) updates.fecha_vencimiento = result.data.fecha_vencimiento || null
  if (result.data.numero_cheque !== undefined) updates.numero_cheque = result.data.numero_cheque || null
  if (result.data.banco_emisor !== undefined) updates.banco_emisor = result.data.banco_emisor || null
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
