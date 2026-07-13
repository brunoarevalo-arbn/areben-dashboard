'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { optUuid, optInt } from '@/lib/zod-helpers'
import { createPagoUnificado } from './pagos'
import { calcularMesesTarjeta as calcMesesTarjetaPure, calcularMontosCuota } from '@/lib/calc/tarjeta'
import { calcularMontoNeto } from '@/lib/calc/gasto'

// ============ GASTOS ============

const MARCAS = ['BDI', 'ZATTIA', 'STUNNED', 'GENERAL'] as const
type Marca = typeof MARCAS[number]

function parseProrrateo(raw: FormDataEntryValue | null): Record<string, number> | null {
  if (!raw || typeof raw !== 'string' || raw === '') return null
  try {
    const obj = JSON.parse(raw)
    if (typeof obj !== 'object' || obj === null) return null
    const total = Object.values(obj as Record<string, unknown>)
      .reduce((s: number, v) => s + (typeof v === 'number' ? v : 0), 0)
    if (Math.abs(total - 100) > 0.5) return null
    return obj as Record<string, number>
  } catch {
    return null
  }
}

const gastoSchema = z.object({
  categoria: z.string().min(1, 'Requerido'),
  concepto: z.string().min(1, 'Requerido'),
  monto: z.coerce.number().positive('Debe ser positivo'),
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
  monto_secundario: z.coerce.number().optional().nullable(),
  moneda_secundaria: z.enum(['ARS', 'USD']).optional().nullable(),
  iva_incluido: z.coerce.boolean().optional().default(false),
  porcentaje_iva: z.coerce.number().min(0).max(100).optional().default(21),
  negocio: z.enum(['BDI', 'ZATTIA', 'STUNNED', 'GENERAL']),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  estado: z.enum(['PENDIENTE', 'PAGADO', 'VENCIDO', 'DEVENGADO']),
  fecha_pago: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
  medio_pago: z.string().optional().nullable(),
  cuenta_id: optUuid,
  cuenta_origen_pago_id: optUuid,
  tarjeta_id: optUuid,
  cuotas_total: optInt({ min: 1 }),
  recurrente_id: optUuid,
  tiene_intereses: z.coerce.boolean().optional().default(false),
  interes_tipo: z.preprocess(
    (v) => (v === '' ? null : v),
    z.enum(['MONTO', 'PORCENTAJE']).nullable(),
  ).optional(),
  interes_valor: z.coerce.number().min(0).optional().default(0),
}).superRefine((val, ctx) => {
  const medio = val.medio_pago
  // La forma de pago es obligatoria en todo gasto.
  if (!medio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['medio_pago'],
      message: 'La forma de pago es obligatoria.',
    })
  }
  // Todo gasto se crea con fecha de pago (= fecha real o vencimiento estimado),
  // salvo dos casos que no la necesitan mientras siguen PENDIENTE: cuenta corriente
  // del proveedor (se paga al saldar la cuenta) y TARJETA (el server la completa = fecha).
  // Pero si el gasto ya se marca PAGADO, la fecha es obligatoria SIEMPRE (sin ella el
  // cierre no puede saber si al corte estaba pago) — el estado manda sobre el medio.
  const exentoPorMedio = medio === 'CTA_CORRIENTE' || medio === 'CUENTA_CORRIENTE' || medio === 'TARJETA'
  const exento = exentoPorMedio && val.estado !== 'PAGADO'
  if (!exento && !val.fecha_pago) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fecha_pago'],
      message: val.estado === 'PAGADO'
        ? 'La fecha de pago es obligatoria si el gasto está PAGADO.'
        : 'La fecha de pago es obligatoria (salvo cuenta corriente).',
    })
  }
})

/**
 * Medios cuyo pago NO pasa por el ledger de `pagos`:
 * - TARJETA: al proveedor ya le pagaste con la TC; el pasivo vive en cuotas_tarjeta.
 * - CTA_CORRIENTE / CUENTA_CORRIENTE: se salda al pagar la cuenta del proveedor.
 * Para el resto (EFECTIVO/TRANSFERENCIA/CHEQUE/ECHEQ), marcar PAGADO crea una fila en `pagos`.
 */
function esMedioExentoDeLedger(medio: string | null | undefined): boolean {
  return medio === 'TARJETA' || medio === 'CTA_CORRIENTE' || medio === 'CUENTA_CORRIENTE'
}

/**
 * Calcula el monto del interés según tipo y valor.
 * MONTO → es el valor en pesos directo. PORCENTAJE → se aplica sobre el monto base (con IVA).
 */
function calcularInteresMonto(montoBase: number, tipo: string | null | undefined, valor: number | null | undefined): number {
  if (!tipo || !valor || valor <= 0) return 0
  if (tipo === 'MONTO') return Math.round(valor * 100) / 100
  if (tipo === 'PORCENTAJE') return Math.round((montoBase * valor / 100) * 100) / 100
  return 0
}

function buildGastoData(parsed: z.infer<typeof gastoSchema>, prorrateo: Record<string, number> | null) {
  const monto_neto = calcularMontoNeto(parsed.monto, parsed.iva_incluido, parsed.porcentaje_iva)
  const aplicaInteres = !!parsed.tiene_intereses && (parsed.cuotas_total ?? 1) > 1 && parsed.medio_pago === 'TARJETA'
  const interes_monto = aplicaInteres
    ? calcularInteresMonto(parsed.monto, parsed.interes_tipo, parsed.interes_valor)
    : 0
  return {
    ...parsed,
    mes: parsed.fecha.substring(0, 7),
    monto_neto,
    monto_secundario: parsed.monto_secundario || null,
    moneda_secundaria: parsed.moneda_secundaria || null,
    fecha_pago: parsed.fecha_pago || null,
    notas: parsed.notas || null,
    medio_pago: parsed.medio_pago || null,
    cuenta_id: parsed.cuenta_id || null,
    cuenta_origen_pago_id: parsed.cuenta_origen_pago_id || null,
    tarjeta_id: parsed.tarjeta_id || null,
    cuotas_total: parsed.cuotas_total || 1,
    recurrente_id: parsed.recurrente_id || null,
    tiene_intereses: aplicaInteres,
    interes_tipo: aplicaInteres ? parsed.interes_tipo ?? null : null,
    interes_valor: aplicaInteres ? parsed.interes_valor ?? null : null,
    interes_monto: aplicaInteres ? interes_monto : null,
    prorrateo,
    confirmado: true,
  }
}

/**
 * Sincroniza el gasto-intereses auto-generado con el principal.
 * - Si el principal pasó a tener intereses → crea el gasto secundario y vincula
 * - Si los datos cambiaron → recrea/actualiza el secundario
 * - Si dejó de tener intereses → borra el secundario
 */
async function syncGastoIntereses(principalId: string) {
  const supabase = await createClient()
  const { data: p } = await supabase
    .from('gastos')
    .select('id, concepto, categoria, monto, moneda, negocio, mes, fecha, fecha_pago, medio_pago, tarjeta_id, cuotas_total, prorrateo, detalles, tiene_intereses, interes_monto, gasto_intereses_id')
    .eq('id', principalId)
    .single()
  if (!p) return

  const aplicaInteres = !!p.tiene_intereses && (p.interes_monto ?? 0) > 0

  // CASO 1: ya no aplica → borrar secundario si existe
  if (!aplicaInteres) {
    if (p.gasto_intereses_id) {
      // Borrar cuotas del secundario primero, luego el gasto
      await supabase.from('cuotas_tarjeta').delete().eq('origen_tipo', 'GASTO').eq('origen_id', p.gasto_intereses_id).eq('pagada', false)
      await supabase.from('gastos').delete().eq('id', p.gasto_intereses_id)
      await supabase.from('gastos').update({ gasto_intereses_id: null }).eq('id', principalId)
    }
    return
  }

  // CASO 2: aplica intereses
  const datosIntereses = {
    categoria: 'Gasto Financiero',
    concepto: `Intereses — ${p.concepto}`,
    monto: p.interes_monto!,
    monto_neto: p.interes_monto!,
    iva_incluido: false,
    porcentaje_iva: 0,
    moneda: p.moneda ?? 'ARS',
    negocio: p.negocio,
    mes: p.mes,
    fecha: p.fecha,
    fecha_pago: p.fecha_pago,
    estado: 'PENDIENTE',
    medio_pago: p.medio_pago,
    tarjeta_id: p.tarjeta_id,
    cuotas_total: p.cuotas_total,
    prorrateo: p.prorrateo,
    detalles: p.detalles,
    confirmado: true,
    gasto_padre_id: principalId,
  }

  if (p.gasto_intereses_id) {
    // CASO 2a: actualizar el existente
    await supabase.from('gastos').update(datosIntereses).eq('id', p.gasto_intereses_id)
    // Regenerar cuotas no pagadas
    await supabase.from('cuotas_tarjeta').delete().eq('origen_tipo', 'GASTO').eq('origen_id', p.gasto_intereses_id).eq('pagada', false)
    if (p.tarjeta_id && (p.cuotas_total ?? 1) >= 1) {
      const fechaCompra = p.fecha_pago || `${p.mes}-01`
      await generarCuotasTarjeta({
        tarjetaId: p.tarjeta_id,
        origenTipo: 'GASTO',
        origenId: p.gasto_intereses_id,
        concepto: datosIntereses.concepto,
        montoTotal: Number(p.interes_monto),
        cuotasTotal: p.cuotas_total ?? 1,
        fechaCompra,
      })
    }
  } else {
    // CASO 2b: crear nuevo
    const { data: nuevo } = await supabase.from('gastos').insert(datosIntereses).select('id').single()
    if (nuevo) {
      await supabase.from('gastos').update({ gasto_intereses_id: nuevo.id }).eq('id', principalId)
      if (p.tarjeta_id && (p.cuotas_total ?? 1) >= 1) {
        const fechaCompra = p.fecha_pago || `${p.mes}-01`
        await generarCuotasTarjeta({
          tarjetaId: p.tarjeta_id,
          origenTipo: 'GASTO',
          origenId: nuevo.id,
          concepto: datosIntereses.concepto,
          montoTotal: Number(p.interes_monto),
          cuotasTotal: p.cuotas_total ?? 1,
          fechaCompra,
        })
      }
    }
  }
}

/**
 * Regenera las cuotas de tarjeta asociadas a un gasto.
 * Borra las existentes (no pagadas) y crea nuevas según los datos del gasto.
 * Las cuotas ya pagadas no se tocan.
 */
async function regenerarCuotasGasto(gastoId: string) {
  const supabase = await createClient()
  const { data: g } = await supabase
    .from('gastos')
    .select('id, concepto, monto, tarjeta_id, cuotas_total, fecha_pago, mes')
    .eq('id', gastoId)
    .single()
  if (!g || !g.tarjeta_id) return

  const cuotasTotal = g.cuotas_total ?? 1
  if (cuotasTotal < 1) return

  // Borrar cuotas no pagadas asociadas a este gasto (las pagadas las preservamos)
  await supabase
    .from('cuotas_tarjeta')
    .delete()
    .eq('origen_tipo', 'GASTO')
    .eq('origen_id', gastoId)
    .eq('pagada', false)

  // Si ya hay cuotas pagadas, no regenerar (sería complejo merging)
  const { count } = await supabase
    .from('cuotas_tarjeta')
    .select('*', { count: 'exact', head: true })
    .eq('origen_tipo', 'GASTO')
    .eq('origen_id', gastoId)
  if ((count ?? 0) > 0) return

  const fechaCompra = g.fecha_pago || `${g.mes}-01`
  await generarCuotasTarjeta({
    tarjetaId: g.tarjeta_id,
    origenTipo: 'GASTO',
    origenId: g.id,
    concepto: g.concepto,
    montoTotal: Number(g.monto),
    cuotasTotal,
    fechaCompra,
  })
}

/**
 * Paid-on-commit: cuando un gasto se paga con un instrumento que desplaza el
 * compromiso (tarjeta, cheque, cta. corriente del proveedor), contra el
 * proveedor el gasto está saldado al momento de la operación. El compromiso
 * real es la cuota / el cheque / el saldo en cta. cte. Por eso creamos un
 * pago en el ledger por el total del gasto con ese instrumento, y el trigger
 * `recomputarOrigen` marca el gasto como PAGADO.
 *
 * Para TARJETA/CHEQUE el pago no afecta tesorería (acreditado=false): el dinero
 * sale recién cuando se paga la cuota o se acredita el cheque.
 */
async function marcarGastoPagadoOnCommit(gastoId: string) {
  const supabase = await createClient()
  const { data: g } = await supabase
    .from('gastos')
    .select('id, monto, moneda, fecha, fecha_pago, medio_pago, cuenta_id, estado')
    .eq('id', gastoId)
    .single()
  if (!g || g.estado === 'PAGADO') return

  const medio = g.medio_pago
  const aplicaCommit =
    medio === 'TARJETA' ||
    medio === 'CUENTA_CORRIENTE' ||
    medio === 'CHEQUE_FISICO' ||
    medio === 'ECHEQ'
  if (!aplicaCommit) return

  // Evitar duplicar el pago si ya hay alguno asociado (ej. al editar un gasto existente)
  const { data: prev } = await supabase
    .from('pagos')
    .select('monto')
    .eq('tipo_origen', 'GASTO')
    .eq('origen_id', gastoId)
  const yaPagado = (prev ?? []).reduce((s, p) => s + Number(p.monto), 0)
  const restante = Math.max(0, Number(g.monto) - yaPagado)
  if (restante <= 0.01) return

  // Compromisos con vencimiento futuro (cheque y cta. cte.) deben aparecer en
  // pendientes hasta que se acrediten/paguen. Para tarjeta el compromiso son
  // las cuotas — el pago contra el gasto es virtual y no debe aparecer.
  const fechaVenc = medio === 'TARJETA' ? null : (g.fecha_pago || g.fecha || null)

  await createPagoUnificado({
    tipo_origen: 'GASTO',
    origen_id: gastoId,
    monto: restante,
    moneda: (g.moneda as 'ARS' | 'USD') || 'ARS',
    fecha_emision: g.fecha_pago || g.fecha || new Date().toISOString().split('T')[0],
    fecha_vencimiento: fechaVenc,
    instrumento: medio as 'TARJETA' | 'CUENTA_CORRIENTE' | 'CHEQUE_FISICO' | 'ECHEQ',
    cuenta_id: g.cuenta_id || null,
    notas: 'Auto-saldo: compromiso desplazado al instrumento de pago',
  })
}

export async function createGasto(prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = {
    ...Object.fromEntries(formData),
    iva_incluido: formData.get('iva_incluido') === 'true' || formData.get('iva_incluido') === 'on',
  }
  const result = gastoSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const prorrateo = parseProrrateo(formData.get('prorrateo'))

  // Si el form marca PAGADO a mano con un medio "real" (no tarjeta ni cta corriente),
  // el gasto se paga por el ledger: se inserta PENDIENTE y luego marcarGastoPagado
  // crea la fila en `pagos` con la fecha. Así ningún PAGADO queda sin rastro/fecha.
  const pagarPorLedger =
    result.data.estado === 'PAGADO' && !esMedioExentoDeLedger(result.data.medio_pago)

  const gastoData = buildGastoData(result.data, prorrateo)
  if (pagarPorLedger) gastoData.estado = 'PENDIENTE'

  const supabase = await createClient()
  const { data: gasto, error } = await supabase
    .from('gastos')
    .insert(gastoData)
    .select('id')
    .single()
  if (error) return error.message

  // Si es con tarjeta, generar cuotas desde el inicio (compromisos futuros)
  if (gasto && result.data.tarjeta_id && (result.data.cuotas_total ?? 1) >= 1) {
    await regenerarCuotasGasto(gasto.id)
  }

  // Si tiene intereses, crear el gasto-intereses vinculado y sus cuotas
  if (gasto && result.data.tiene_intereses && (result.data.cuotas_total ?? 1) > 1) {
    await syncGastoIntereses(gasto.id)
  }

  // Pago por ledger: crea la fila en `pagos` y deja el gasto PAGADO con la fecha real.
  if (gasto && pagarPorLedger) {
    await marcarGastoPagado(gasto.id, result.data.cuenta_origen_pago_id ?? null, result.data.fecha_pago ?? undefined)
  }

  // Si el medio de pago es TARJETA, el gasto queda PAGADO automáticamente.
  // Contablemente: al proveedor ya le pagaste con la TC (saldada esa operación);
  // el pasivo nuevo son las cuotas que viven en cuotas_tarjeta y se ven
  // como resumen de TC en pendientes / tarjetas.
  if (gasto && result.data.medio_pago === 'TARJETA') {
    await supabase
      .from('gastos')
      .update({
        estado: 'PAGADO',
        fecha_pago: result.data.fecha ?? new Date().toISOString().split('T')[0],
      })
      .eq('id', gasto.id)
  }

  // Para otros medios (EFECTIVO/TRANSFERENCIA/CHEQUE/CTA_CTE), el gasto queda
  // PENDIENTE hasta que se marque pagado manualmente (paid-on-commit deshabilitado
  // por pedido del usuario).

  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/tarjetas')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/')
  return null
}

export async function updateGasto(id: string, prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = {
    ...Object.fromEntries(formData),
    iva_incluido: formData.get('iva_incluido') === 'true' || formData.get('iva_incluido') === 'on',
  }
  const result = gastoSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const prorrateo = parseProrrateo(formData.get('prorrateo'))
  const supabase = await createClient()

  // Detectar la transición no-PAGADO → PAGADO con medio "real": en ese caso el pago
  // pasa por el ledger (marcarGastoPagado más abajo), así que dejamos el gasto PENDIENTE
  // en este update. Editar un gasto que YA estaba PAGADO no reabre el ledger (evita
  // reescribir la fecha real o duplicar filas en `pagos`).
  const { data: prevGasto } = await supabase
    .from('gastos')
    .select('estado')
    .eq('id', id)
    .single()
  const transicionAPagado =
    prevGasto?.estado !== 'PAGADO' &&
    result.data.estado === 'PAGADO' &&
    !esMedioExentoDeLedger(result.data.medio_pago)

  const gastoData = buildGastoData(result.data, prorrateo)
  if (transicionAPagado) gastoData.estado = 'PENDIENTE'

  const { error } = await supabase
    .from('gastos')
    .update(gastoData)
    .eq('id', id)
  if (error) return error.message

  // Re-generar cuotas si hay tarjeta (preserva las pagadas)
  if (result.data.tarjeta_id && (result.data.cuotas_total ?? 1) >= 1) {
    await regenerarCuotasGasto(id)
  } else {
    // Si se cambió a sin tarjeta, borrar cuotas no pagadas
    await supabase
      .from('cuotas_tarjeta')
      .delete()
      .eq('origen_tipo', 'GASTO')
      .eq('origen_id', id)
      .eq('pagada', false)
  }

  // Sincronizar el gasto-intereses (crea, actualiza o borra según corresponda)
  await syncGastoIntereses(id)

  // Transición a PAGADO con medio "real": pago por el ledger (crea fila en `pagos`
  // con la fecha) y deja el gasto PAGADO con la fecha real.
  if (transicionAPagado) {
    await marcarGastoPagado(id, result.data.cuenta_origen_pago_id ?? null, result.data.fecha_pago ?? undefined)
  }

  // Si el medio de pago es TARJETA y el gasto está PENDIENTE, marcarlo PAGADO
  // (al proveedor ya le pagaste con TC). Si Bruno lo dejó PENDIENTE explícito
  // y querés respetarlo, remové este bloque.
  if (result.data.medio_pago === 'TARJETA') {
    const { data: g } = await supabase
      .from('gastos')
      .select('estado, fecha, fecha_pago')
      .eq('id', id)
      .single()
    if (g && g.estado === 'PENDIENTE') {
      await supabase
        .from('gastos')
        .update({
          estado: 'PAGADO',
          fecha_pago: g.fecha_pago ?? g.fecha ?? new Date().toISOString().split('T')[0],
        })
        .eq('id', id)
    }
  }

  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/tarjetas')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/')
  return null
}

export async function deleteGasto(id: string) {
  await requireUser()
  const supabase = await createClient()
  // Si tiene un gasto-intereses vinculado, borrarlo en cascada
  const { data: g } = await supabase
    .from('gastos')
    .select('gasto_intereses_id')
    .eq('id', id)
    .single()
  if (g?.gasto_intereses_id) {
    await supabase
      .from('cuotas_tarjeta')
      .delete()
      .eq('origen_tipo', 'GASTO')
      .eq('origen_id', g.gasto_intereses_id)
      .eq('pagada', false)
    await supabase.from('gastos').delete().eq('id', g.gasto_intereses_id)
  }
  // Limpiar cuotas no pagadas del gasto principal
  await supabase
    .from('cuotas_tarjeta')
    .delete()
    .eq('origen_tipo', 'GASTO')
    .eq('origen_id', id)
    .eq('pagada', false)
  const { error } = await supabase.from('gastos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/tarjetas')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/')
}

/**
 * Marca un gasto como pagado total. Delega al ledger unificado: crea un pago
 * por el saldo restante (monto - SUM(pagos previos)) con tipo_origen=GASTO.
 * El trigger de recomputarOrigen marca el gasto como PAGADO automáticamente.
 */
export async function marcarGastoPagado(id: string, cuentaOrigenId: string | null, fechaPago?: string) {
  await requireUser()
  const supabase = await createClient()

  const { data: g } = await supabase
    .from('gastos')
    .select('id, concepto, monto, moneda, tarjeta_id, cuotas_total, fecha_pago, mes')
    .eq('id', id)
    .single()
  if (!g) throw new Error('Gasto no encontrado')

  // Saldo restante = monto - SUM(pagos previos al ledger)
  const { data: prev } = await supabase
    .from('pagos')
    .select('monto')
    .eq('tipo_origen', 'GASTO')
    .eq('origen_id', id)
  const yaPagado = (prev ?? []).reduce((s, p) => s + Number(p.monto), 0)
  const restante = Math.max(0, Number(g.monto) - yaPagado)
  const fechaEmision = fechaPago || new Date().toISOString().split('T')[0]

  if (restante > 0.01) {
    await createPagoUnificado({
      tipo_origen: 'GASTO',
      origen_id: id,
      monto: restante,
      moneda: (g.moneda as 'ARS' | 'USD') || 'ARS',
      fecha_emision: fechaEmision,
      instrumento: 'TRANSFERENCIA',
      cuenta_id: cuentaOrigenId,
      notas: 'Marcado pagado (saldo total)',
    })
  } else {
    // Ya estaba 100% pagado por adelantos, sólo asegurar estado PAGADO
    await supabase
      .from('gastos')
      .update({ estado: 'PAGADO', fecha_pago: fechaEmision, cuenta_origen_pago_id: cuentaOrigenId })
      .eq('id', id)
  }

  // Persistir cuenta_origen_pago_id en el gasto (compatibilidad con UI existente)
  if (cuentaOrigenId) {
    await supabase
      .from('gastos')
      .update({ cuenta_origen_pago_id: cuentaOrigenId })
      .eq('id', id)
  }

  // Generar cuotas de tarjeta si aplica y aún no fueron generadas
  if (g.tarjeta_id && (g.cuotas_total || 1) >= 1) {
    const { data: existeCuota } = await supabase
      .from('cuotas_tarjeta')
      .select('id')
      .eq('origen_tipo', 'GASTO')
      .eq('origen_id', id)
      .maybeSingle()
    if (!existeCuota) {
      const fechaCompra = g.fecha_pago || `${g.mes}-01`
      await generarCuotasTarjeta({
        tarjetaId: g.tarjeta_id,
        origenTipo: 'GASTO',
        origenId: id,
        concepto: g.concepto,
        montoTotal: g.monto,
        cuotasTotal: g.cuotas_total || 1,
        fechaCompra,
      })
    }
  }

  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/tarjetas')
  revalidatePath('/finanzas/pagos')
  revalidatePath('/rrhh/nomina')
  revalidatePath('/')
}

// ============ GASTOS RECURRENTES ============

const recurrenteSchema = z.object({
  concepto: z.string().min(1),
  categoria: z.string().min(1),
  monto_estimado: z.coerce.number().positive(),
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
  monto_secundario: z.coerce.number().optional().nullable(),
  moneda_secundaria: z.enum(['ARS', 'USD']).optional().nullable(),
  iva_incluido: z.coerce.boolean(),
  porcentaje_iva: z.coerce.number().min(0).max(100).default(21),
  medio_pago: z.string().min(1),
  cuenta_id: optUuid,
  tarjeta_id: optUuid,
  dia_vencimiento: optInt({ min: 1, max: 31 }),
  tipo_mes: z.enum(['CORRIENTE', 'VENCIDO']),
  notas: z.string().optional().nullable(),
})

export async function createRecurrente(prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = {
    ...Object.fromEntries(formData),
    iva_incluido: formData.get('iva_incluido') === 'true' || formData.get('iva_incluido') === 'on',
  }
  const result = recurrenteSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const prorrateo = parseProrrateo(formData.get('prorrateo'))
  const detallesRaw = formData.get('detalles') as string | null
  let detalles: Record<string, unknown> | null = null
  if (detallesRaw) {
    try { detalles = JSON.parse(detallesRaw) } catch {}
  }

  const supabase = await createClient()
  const { error } = await supabase.from('gastos_recurrentes').insert({
    ...result.data,
    monto_secundario: result.data.monto_secundario || null,
    moneda_secundaria: result.data.moneda_secundaria || null,
    cuenta_id: result.data.cuenta_id || null,
    tarjeta_id: result.data.tarjeta_id || null,
    dia_vencimiento: result.data.dia_vencimiento || null,
    notas: result.data.notas?.trim() || null,
    prorrateo,
    detalles,
    activo: true,
  })
  if (error) return error.message

  revalidatePath('/finanzas/recurrentes')
  return null
}

export async function updateRecurrente(id: string, prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = {
    ...Object.fromEntries(formData),
    iva_incluido: formData.get('iva_incluido') === 'true' || formData.get('iva_incluido') === 'on',
  }
  const result = recurrenteSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const prorrateo = parseProrrateo(formData.get('prorrateo'))
  const detallesRaw = formData.get('detalles') as string | null
  let detalles: Record<string, unknown> | null = null
  if (detallesRaw) {
    try { detalles = JSON.parse(detallesRaw) } catch {}
  }

  const supabase = await createClient()
  const { error } = await supabase.from('gastos_recurrentes').update({
    ...result.data,
    monto_secundario: result.data.monto_secundario || null,
    moneda_secundaria: result.data.moneda_secundaria || null,
    cuenta_id: result.data.cuenta_id || null,
    tarjeta_id: result.data.tarjeta_id || null,
    dia_vencimiento: result.data.dia_vencimiento || null,
    notas: result.data.notas?.trim() || null,
    prorrateo,
    detalles,
  }).eq('id', id)
  if (error) return error.message

  revalidatePath('/finanzas/recurrentes')
  return null
}

export async function deleteRecurrente(id: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('gastos_recurrentes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/gastos-recurrentes')
}

/**
 * Registra un PAGO/devolución de un socio a la empresa. Se inserta como un
 * movimiento de retiros_socios con monto NEGATIVO, lo que reduce el saldo
 * deudor del socio. Mantiene la compatibilidad con el resto de la app porque
 * algebraicamente SUM(monto_pesos) sigue dando el "neto retirado".
 */
export async function registrarPagoSocio(args: {
  socioId: string
  fecha: string
  montoArs: number  // siempre positivo, se convierte a negativo internamente
  montoUsd: number  // siempre positivo, se convierte a negativo internamente
  tipoCambio: number
  categoriaId?: string
  notas?: string
}) {
  await requireUser()
  if (args.montoArs <= 0 && args.montoUsd <= 0) {
    throw new Error('Ingresá al menos un monto (ARS o USD).')
  }
  const supabase = await createClient()
  const { data: socio, error: errSocio } = await supabase
    .from('socios')
    .select('nombre')
    .eq('id', args.socioId)
    .single()
  if (errSocio || !socio) throw new Error('Socio no encontrado')

  const mes = args.fecha.substring(0, 7)
  const notaFinal = args.notas
    ? `[Pago/devolución] ${args.notas}`
    : '[Pago/devolución del socio]'

  const { error } = await supabase.from('retiros_socios').insert({
    socio: socio.nombre, // legacy compat — sigue llenándose
    socio_id: args.socioId,
    fecha: args.fecha,
    mes,
    monto_pesos: -Math.abs(args.montoArs),
    monto_usd: -Math.abs(args.montoUsd),
    tipo_cambio: args.tipoCambio,
    categoria_id: args.categoriaId || null,
    notas: notaFinal,
    medio_pago: 'TRANSFERENCIA',
  })
  if (error) throw new Error(error.message)

  revalidatePath('/finanzas/cuenta-socios')
  revalidatePath('/finanzas/retiros')
  revalidatePath('/finanzas/cierre-mes')
}

/**
 * Revierte un gasto PAGADO a PENDIENTE: borra todos los pagos asociados en
 * el ledger y limpia fecha_pago + cuenta_origen_pago_id.
 *
 * Útil cuando un gasto se marcó pagado por error o cuando se borraba
 * automáticamente por paid-on-commit (lógica vieja). El user invoca esto
 * desde un botón en la tabla de gastos.
 */
export async function revertirPagoGasto(gastoId: string) {
  await requireUser()
  const supabase = await createClient()

  const { data: gasto, error: errGet } = await supabase
    .from('gastos')
    .select('id, estado, auto_generado, gasto_padre_id')
    .eq('id', gastoId)
    .single()
  if (errGet || !gasto) throw new Error('Gasto no encontrado')
  if (gasto.estado !== 'PAGADO') {
    throw new Error('El gasto no está en estado PAGADO — nada para revertir')
  }
  if (gasto.auto_generado || gasto.gasto_padre_id) {
    throw new Error('Es un gasto auto-generado — revertí el gasto principal en su lugar')
  }

  // Borrar todos los pagos asociados al gasto (tipo_origen=GASTO).
  // Incluye tanto pagos virtuales (acreditado=false) como reales.
  const { error: errDel } = await supabase
    .from('pagos')
    .delete()
    .eq('tipo_origen', 'GASTO')
    .eq('origen_id', gastoId)
  if (errDel) throw new Error(errDel.message)

  // Volver el gasto a PENDIENTE y limpiar la fecha de pago efectivo.
  const { error: errUpd } = await supabase
    .from('gastos')
    .update({
      estado: 'PENDIENTE',
      fecha_pago: null,
      cuenta_origen_pago_id: null,
    })
    .eq('id', gastoId)
  if (errUpd) throw new Error(errUpd.message)

  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/pagos')
  revalidatePath('/finanzas/cierre-mes')
}

/**
 * Update quirúrgico solo del monto de un gasto — usado por la edición inline
 * en la tabla de gastos. Recalcula monto_neto según IVA del propio gasto.
 *
 * No permite editar:
 * - Gastos PAGADOS (rompería la conciliación con los pagos del ledger).
 * - Gastos con cuotas múltiples (las cuotas ya generadas no se recalculan acá;
 *   para esos casos usar el modal full que maneja la regeneración).
 * - Gastos auto-generados (intereses, aportes patronales, gastos de inversión),
 *   que dependen del gasto padre.
 */
export async function updateMontoGasto(id: string, monto: number) {
  await requireUser()
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error('El monto debe ser un número positivo')
  }
  const supabase = await createClient()
  const { data: gasto, error: errGet } = await supabase
    .from('gastos')
    .select('id, estado, auto_generado, gasto_padre_id, cuotas_total, iva_incluido, porcentaje_iva')
    .eq('id', id)
    .single()
  if (errGet || !gasto) throw new Error('Gasto no encontrado')

  if (gasto.estado === 'PAGADO') {
    throw new Error('El gasto está pagado — editá el monto desde el modal o registrá el ajuste como otro gasto')
  }
  if (gasto.auto_generado || gasto.gasto_padre_id) {
    throw new Error('Es un gasto auto-generado, no se puede editar directamente — modificá el gasto principal')
  }
  if ((gasto.cuotas_total ?? 1) > 1) {
    throw new Error('Tiene cuotas — editalo desde el modal para regenerar las cuotas correctamente')
  }

  const montoFinal = Math.round(monto * 100) / 100
  const montoNeto = calcularMontoNeto(montoFinal, gasto.iva_incluido, Number(gasto.porcentaje_iva ?? 21))

  const { error: errUpd } = await supabase
    .from('gastos')
    .update({ monto: montoFinal, monto_neto: montoNeto })
    .eq('id', id)
  if (errUpd) throw new Error(errUpd.message)

  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/cierre-mes')
}

/**
 * Update quirúrgico solo del monto_estimado — usado por la edición inline
 * en la tabla de recurrentes.
 */
export async function updateMontoRecurrente(id: string, monto: number) {
  await requireUser()
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error('El monto debe ser un número positivo')
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('gastos_recurrentes')
    .update({ monto_estimado: Math.round(monto * 100) / 100 })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/recurrentes')
}

// ============================================================
// Bulk edit de recurrentes (edición masiva)
// ============================================================

const bulkPatchSchema = z.object({
  categoria: z.string().min(1).optional(),
  monto_estimado: z.coerce.number().positive().optional(),
  iva_incluido: z.coerce.boolean().optional(),
  porcentaje_iva: z.coerce.number().min(0).max(100).optional(),
  medio_pago: z.string().min(1).optional(),
  dia_vencimiento: z.coerce.number().int().min(1).max(31).nullable().optional(),
  tipo_mes: z.enum(['CORRIENTE', 'VENCIDO']).optional(),
})

export type BulkRecurrentePatch = z.infer<typeof bulkPatchSchema>

/**
 * Aplica el mismo set parcial de cambios a múltiples recurrentes.
 * Solo los campos presentes en el patch se modifican; el resto queda igual en cada uno.
 */
export async function bulkUpdateRecurrentes(
  ids: string[],
  patch: BulkRecurrentePatch,
): Promise<{ updated: number; error?: string }> {
  await requireUser()
  if (!ids.length) return { updated: 0 }

  const parsed = bulkPatchSchema.safeParse(patch)
  if (!parsed.success) return { updated: 0, error: parsed.error.issues[0].message }

  // Limpiar undefined: solo enviamos a Supabase lo explícitamente definido.
  const updateData: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) updateData[k] = v
  }
  if (Object.keys(updateData).length === 0) {
    return { updated: 0, error: 'No hay ningún campo seleccionado para actualizar' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('gastos_recurrentes')
    .update(updateData)
    .in('id', ids)
  if (error) return { updated: 0, error: error.message }

  revalidatePath('/finanzas/recurrentes')
  return { updated: ids.length }
}

export async function bulkToggleRecurrentesActivo(
  ids: string[],
  activo: boolean,
): Promise<{ updated: number; error?: string }> {
  await requireUser()
  if (!ids.length) return { updated: 0 }
  const supabase = await createClient()
  const { error } = await supabase
    .from('gastos_recurrentes')
    .update({ activo })
    .in('id', ids)
  if (error) return { updated: 0, error: error.message }
  revalidatePath('/finanzas/recurrentes')
  return { updated: ids.length }
}

/**
 * Multiplica el monto_estimado de cada recurrente seleccionado por (1 + porcentaje/100).
 * Soporta porcentajes positivos (aumento) y negativos (descuento).
 */
export async function bulkAjustarMontosRecurrentes(
  ids: string[],
  porcentaje: number,
): Promise<{ updated: number; errors: string[] }> {
  await requireUser()
  if (!ids.length) return { updated: 0, errors: [] }
  if (!Number.isFinite(porcentaje) || porcentaje === 0) {
    return { updated: 0, errors: ['El porcentaje debe ser distinto de 0'] }
  }
  const supabase = await createClient()
  const { data: actuales, error: errLoad } = await supabase
    .from('gastos_recurrentes')
    .select('id, monto_estimado')
    .in('id', ids)
  if (errLoad) return { updated: 0, errors: [errLoad.message] }

  const factor = 1 + porcentaje / 100
  const errors: string[] = []
  let updated = 0
  for (const r of actuales ?? []) {
    const nuevoMonto = Math.round(Number(r.monto_estimado) * factor * 100) / 100
    if (nuevoMonto <= 0) {
      errors.push(`Recurrente ${r.id.substring(0, 8)}: el monto resultante (${nuevoMonto}) no es válido`)
      continue
    }
    const { error } = await supabase
      .from('gastos_recurrentes')
      .update({ monto_estimado: nuevoMonto })
      .eq('id', r.id)
    if (error) errors.push(`Recurrente ${r.id.substring(0, 8)}: ${error.message}`)
    else updated++
  }
  revalidatePath('/finanzas/recurrentes')
  return { updated, errors }
}

/**
 * Confirma masivamente varios recurrentes para un mes — usa el monto_estimado.
 * Para montos personalizados, usar confirmarRecurrente uno por uno.
 */
export async function confirmarRecurrentesMasivo(recurrenteIds: string[], mes: string) {
  await requireUser()
  if (!recurrenteIds.length) return { ok: 0, errors: [] as string[] }
  const supabase = await createClient()

  // Filtrar los que ya tienen gasto del mes
  const { data: gastosExistentes } = await supabase
    .from('gastos')
    .select('recurrente_id')
    .eq('mes', mes)
    .in('recurrente_id', recurrenteIds)
  const yaConfirmados = new Set((gastosExistentes ?? []).map((g) => g.recurrente_id))

  const errors: string[] = []
  let ok = 0
  for (const recId of recurrenteIds) {
    if (yaConfirmados.has(recId)) {
      errors.push(`Recurrente ${recId.slice(0, 8)}…: ya confirmado para ${mes}`)
      continue
    }
    try {
      const { data: rec } = await supabase
        .from('gastos_recurrentes')
        .select('*')
        .eq('id', recId)
        .single()
      if (!rec) {
        errors.push(`Recurrente ${recId.slice(0, 8)}…: no encontrado`)
        continue
      }

      const tieneSec = !!rec.monto_secundario && rec.monto_secundario > 0 && !!rec.moneda_secundaria
      const monedaP = (rec.moneda || 'ARS') as 'ARS' | 'USD'
      const fechaPagoMasivo = calcularFechaPagoRecurrente(mes, rec.dia_vencimiento, rec.tipo_mes)
      const fechaDevengoMasivo = `${mes}-01`

      function buildGastoMasivo(monto: number, moneda: 'ARS' | 'USD', sufijo?: string) {
        const monto_neto = rec.iva_incluido
          ? Math.round((monto / (1 + Number(rec.porcentaje_iva) / 100)) * 100) / 100
          : monto
        return {
          categoria: rec.categoria,
          concepto: sufijo ? `${rec.concepto} (${sufijo})` : rec.concepto,
          monto,
          monto_neto,
          iva_incluido: rec.iva_incluido,
          porcentaje_iva: rec.porcentaje_iva,
          moneda,
          negocio: 'GENERAL',
          mes,
          fecha: fechaDevengoMasivo,
          fecha_pago: fechaPagoMasivo,
          estado: 'PENDIENTE',
          medio_pago: rec.medio_pago,
          cuenta_id: rec.cuenta_id,
          tarjeta_id: rec.tarjeta_id,
          cuotas_total: rec.cuotas_total ?? null,
          prorrateo: rec.prorrateo,
          detalles: rec.detalles,
          recurrente_id: rec.id,
          confirmado: true,
        }
      }

      // Masivo: si tiene secundario, crea 2 gastos (modo DUAL).
      // Para conversión a una sola moneda, confirmar individual.
      const rows = tieneSec
        ? [
            buildGastoMasivo(Number(rec.monto_estimado), monedaP, monedaP),
            buildGastoMasivo(Number(rec.monto_secundario), rec.moneda_secundaria as 'ARS' | 'USD', rec.moneda_secundaria),
          ]
        : [buildGastoMasivo(Number(rec.monto_estimado), monedaP)]

      const { data: insertadosMasivo, error } = await supabase.from('gastos').insert(rows).select('id, monto, concepto, tarjeta_id, cuotas_total, fecha')
      if (error) {
        errors.push(`${rec.concepto}: ${error.message}`)
      } else {
        ok++
        if (rec.medio_pago === 'TARJETA' && rec.tarjeta_id) {
          for (const g of insertadosMasivo ?? []) {
            const cuotas = Math.max(1, Number(g.cuotas_total ?? rec.cuotas_total ?? 1))
            try {
              await generarCuotasTarjeta({
                tarjetaId: rec.tarjeta_id,
                origenTipo: 'GASTO',
                origenId: g.id,
                concepto: g.concepto,
                montoTotal: Number(g.monto),
                cuotasTotal: cuotas,
                fechaCompra: g.fecha,
              })
            } catch (e) {
              errors.push(`${rec.concepto}: cuotas — ${(e as Error).message}`)
            }
          }
        }
        // NOTA: Paid-on-commit deshabilitado — los gastos generados desde
        // recurrentes quedan PENDIENTE para que el usuario los marque pagados
        // manualmente.
        // for (const g of insertadosMasivo ?? []) {
        //   try { await marcarGastoPagadoOnCommit(g.id) } catch (e) {
        //     errors.push(`${rec.concepto}: auto-saldo — ${(e as Error).message}`)
        //   }
        // }
      }
    } catch (e) {
      errors.push(`Recurrente ${recId.slice(0, 8)}…: ${(e as Error).message}`)
    }
  }

  revalidatePath('/finanzas/gastos-recurrentes')
  revalidatePath('/finanzas/recurrentes')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/cierre-mes')
  return { ok, errors }
}

/**
 * Calcula la fecha tope de pago de un gasto generado desde un recurrente,
 * según el día de vencimiento y el tipo (CORRIENTE = mes mismo, VENCIDO = mes siguiente).
 */
function calcularFechaPagoRecurrente(
  mes: string,
  diaVenc: number | null | undefined,
  tipoMes: 'CORRIENTE' | 'VENCIDO' | string | null | undefined,
): string {
  const dia = Math.max(1, Math.min(31, Number(diaVenc) || 15))
  const [y, m] = mes.split('-').map(Number)
  const offset = tipoMes === 'VENCIDO' ? 1 : 0
  const refY = m + offset > 12 ? y + 1 : y
  const refM = ((m - 1 + offset) % 12) + 1
  const ultimoDia = new Date(refY, refM, 0).getDate()
  const diaFinal = Math.min(dia, ultimoDia)
  return `${refY}-${String(refM).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`
}

/**
 * Confirma un recurrente para un mes. Soporta 3 modos cuando hay parte secundaria:
 *
 * - 'PRINCIPAL_SOLO': crea 1 gasto sólo con el principal (default si no tiene secundario)
 * - 'DUAL': crea 2 gastos separados, uno por cada moneda
 * - 'CONVERTIR': convierte el secundario a la moneda principal con un TC y crea 1 gasto unificado
 */
export async function confirmarRecurrente(args: {
  recurrenteId: string
  mes: string
  montoPrincipal: number
  monedaPrincipal: 'ARS' | 'USD'
  montoSecundario?: number
  monedaSecundaria?: 'ARS' | 'USD' | null
  modo?: 'PRINCIPAL_SOLO' | 'DUAL' | 'CONVERTIR'
  tipoCambio?: number // requerido si modo=CONVERTIR
}) {
  await requireUser()
  const supabase = await createClient()

  const { data: rec } = await supabase
    .from('gastos_recurrentes')
    .select('*')
    .eq('id', args.recurrenteId)
    .single()
  if (!rec) throw new Error('Recurrente no encontrado')

  // Anti-duplicación: si ya hay gasto para este recurrente y mes, no crear otro.
  const { data: existente } = await supabase
    .from('gastos')
    .select('id')
    .eq('recurrente_id', args.recurrenteId)
    .eq('mes', args.mes)
    .limit(1)
  if (existente && existente.length > 0) {
    throw new Error(`El recurrente "${rec.concepto}" ya está confirmado para ${args.mes}`)
  }

  const modo = args.modo ?? 'PRINCIPAL_SOLO'
  const fechaPago = calcularFechaPagoRecurrente(args.mes, rec.dia_vencimiento, rec.tipo_mes)
  const fechaDevengo = `${args.mes}-01`

  function buildGasto(monto: number, moneda: 'ARS' | 'USD', sufijo?: string) {
    const monto_neto = rec.iva_incluido
      ? Math.round((monto / (1 + Number(rec.porcentaje_iva) / 100)) * 100) / 100
      : monto
    return {
      categoria: rec.categoria,
      concepto: sufijo ? `${rec.concepto} (${sufijo})` : rec.concepto,
      monto,
      monto_neto,
      iva_incluido: rec.iva_incluido,
      porcentaje_iva: rec.porcentaje_iva,
      moneda,
      negocio: 'GENERAL' as const,
      mes: args.mes,
      fecha: fechaDevengo,
      fecha_pago: fechaPago,
      estado: 'PENDIENTE' as const,
      medio_pago: rec.medio_pago,
      cuenta_id: rec.cuenta_id,
      tarjeta_id: rec.tarjeta_id,
      cuotas_total: rec.cuotas_total ?? null,
      prorrateo: rec.prorrateo,
      detalles: rec.detalles,
      recurrente_id: rec.id,
      confirmado: true,
    }
  }

  const tieneSecundario = (args.montoSecundario ?? 0) > 0 && !!args.monedaSecundaria

  let inserts: ReturnType<typeof buildGasto>[] = []

  if (modo === 'PRINCIPAL_SOLO' || !tieneSecundario) {
    inserts = [buildGasto(args.montoPrincipal, args.monedaPrincipal)]
  } else if (modo === 'DUAL') {
    inserts = [
      buildGasto(args.montoPrincipal, args.monedaPrincipal, args.monedaPrincipal),
      buildGasto(args.montoSecundario!, args.monedaSecundaria!, args.monedaSecundaria!),
    ]
  } else if (modo === 'CONVERTIR') {
    if (!args.tipoCambio || args.tipoCambio <= 0) {
      throw new Error('Tipo de cambio es obligatorio para conversión')
    }
    // Convertir el secundario al destino (moneda principal)
    let secundarioConvertido = args.montoSecundario!
    if (args.monedaSecundaria !== args.monedaPrincipal) {
      // USD -> ARS: multiplica por TC. ARS -> USD: divide.
      if (args.monedaSecundaria === 'USD' && args.monedaPrincipal === 'ARS') {
        secundarioConvertido = args.montoSecundario! * args.tipoCambio
      } else if (args.monedaSecundaria === 'ARS' && args.monedaPrincipal === 'USD') {
        secundarioConvertido = args.montoSecundario! / args.tipoCambio
      }
    }
    const total = args.montoPrincipal + secundarioConvertido
    inserts = [buildGasto(Math.round(total * 100) / 100, args.monedaPrincipal)]
  }

  const { data: insertados, error } = await supabase.from('gastos').insert(inserts).select('id, monto, concepto, tarjeta_id, cuotas_total, fecha')
  if (error) throw new Error(error.message)

  // Si el recurrente se paga con tarjeta, generar las cuotas en cuotas_tarjeta.
  // Una cuota incluso para el caso "1 cuota" — así queda registrada en la proyección de la tarjeta.
  if (rec.medio_pago === 'TARJETA' && rec.tarjeta_id) {
    for (const g of insertados ?? []) {
      const cuotas = Math.max(1, Number(g.cuotas_total ?? rec.cuotas_total ?? 1))
      await generarCuotasTarjeta({
        tarjetaId: rec.tarjeta_id,
        origenTipo: 'GASTO',
        origenId: g.id,
        concepto: g.concepto,
        montoTotal: Number(g.monto),
        cuotasTotal: cuotas,
        fechaCompra: g.fecha,
      })
    }
  }

  // NOTA: Paid-on-commit deshabilitado (ver createGasto).
  // for (const g of insertados ?? []) { await marcarGastoPagadoOnCommit(g.id) }

  revalidatePath('/finanzas/gastos-recurrentes')
  revalidatePath('/finanzas/recurrentes')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/tarjetas')
  return { ok: inserts.length }
}

// ============ SALDOS / TESORERÍA ============

const cuentaTitularSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(['EMPRESA', 'SOCIO', 'OTRO']),
})

export async function createTitular(prevState: string | null, formData: FormData) {
  await requireUser()
  const result = cuentaTitularSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message
  const supabase = await createClient()
  const { error } = await supabase.from('cuentas_titulares').insert({ ...result.data, activo: true })
  if (error) return error.message
  revalidatePath('/finanzas/saldos')
  return null
}

const cuentaSchema = z.object({
  titular_id: z.string().uuid(),
  nombre: z.string().min(1),
  banco: z.string().min(1),
  tipo: z.enum(['BANCO', 'BILLETERA', 'CAJA', 'CTA_CORRIENTE']),
  permite_dual: z.coerce.boolean(),
  notas: z.string().optional().nullable(),
})

export async function createCuenta(prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = {
    ...Object.fromEntries(formData),
    permite_dual: formData.get('permite_dual') === 'true' || formData.get('permite_dual') === 'on',
  }
  const result = cuentaSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('cuentas_bancarias').insert({
    ...result.data,
    notas: result.data.notas || null,
    activo: true,
  })
  if (error) return error.message
  revalidatePath('/finanzas/saldos')
  return null
}

export async function updateCuenta(id: string, prevState: string | null, formData: FormData) {
  await requireUser()
  const raw = {
    ...Object.fromEntries(formData),
    permite_dual: formData.get('permite_dual') === 'true' || formData.get('permite_dual') === 'on',
  }
  const result = cuentaSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('cuentas_bancarias').update({
    ...result.data,
    notas: result.data.notas || null,
  }).eq('id', id)
  if (error) return error.message
  revalidatePath('/finanzas/saldos')
  return null
}

export async function toggleCuentaActiva(id: string, activo: boolean) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('cuentas_bancarias').update({ activo }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/saldos')
}

export async function upsertSaldoCuenta(
  cuentaId: string,
  mes: string,
  saldoArs: number,
  saldoUsd: number,
  notas?: string | null,
) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('saldos_cuentas').upsert(
    {
      cuenta_id: cuentaId,
      mes,
      saldo_ars: saldoArs,
      saldo_usd: saldoUsd,
      notas: notas || null,
    },
    { onConflict: 'cuenta_id,mes' }
  )
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/saldos')
}

/**
 * Upsert masivo de saldos para varias cuentas en un mes (modo carga rápida).
 * Permite editar todas las cuentas en una sola pasada.
 */
export async function bulkUpsertSaldosCuentas(
  mes: string,
  items: Array<{ cuenta_id: string; saldo_ars: number; saldo_usd: number }>,
) {
  await requireUser()
  if (!items.length) return { ok: 0 }
  const supabase = await createClient()
  const rows = items.map((i) => ({
    cuenta_id: i.cuenta_id,
    mes,
    saldo_ars: Number(i.saldo_ars) || 0,
    saldo_usd: Number(i.saldo_usd) || 0,
  }))
  const { error } = await supabase
    .from('saldos_cuentas')
    .upsert(rows, { onConflict: 'cuenta_id,mes' })
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/saldos')
  return { ok: items.length }
}

export async function cerrarSaldoMes(cuentaId: string, mes: string, cerrar: boolean) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('saldos_cuentas').update({
    cerrado: cerrar,
    fecha_cierre: cerrar ? new Date().toISOString() : null,
  }).eq('cuenta_id', cuentaId).eq('mes', mes)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/saldos')
}

export async function upsertTipoCambioMes(mes: string, tipoCambio: number, fuente?: string | null) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('tipos_cambio_mes').upsert(
    { mes, tipo_cambio: tipoCambio, fuente: fuente || null },
    { onConflict: 'mes' }
  )
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/saldos')
  revalidatePath('/finanzas/retiros')
}

// ============ TARJETAS ============

const tarjetaSchema = z.object({
  titular_id: optUuid,
  nombre: z.string().min(1),
  banco: z.string().min(1),
  tipo: z.enum(['CREDITO', 'DEBITO']),
  ultimos_4: z.string().optional().nullable(),
  dia_cierre: z.coerce.number().int().min(1).max(31),
  dia_vencimiento: z.coerce.number().int().min(1).max(31),
  limite_ars: z.coerce.number().optional().nullable(),
  notas: z.string().optional().nullable(),
})

export async function createTarjeta(prevState: string | null, formData: FormData) {
  await requireUser()
  const result = tarjetaSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('tarjetas_credito').insert({
    ...result.data,
    titular_id: result.data.titular_id || null,
    ultimos_4: result.data.ultimos_4 || null,
    limite_ars: result.data.limite_ars || null,
    notas: result.data.notas || null,
    activo: true,
  })
  if (error) return error.message
  revalidatePath('/finanzas/tarjetas')
  return null
}

export async function updateTarjeta(id: string, prevState: string | null, formData: FormData) {
  await requireUser()
  const result = tarjetaSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('tarjetas_credito').update({
    ...result.data,
    titular_id: result.data.titular_id || null,
    ultimos_4: result.data.ultimos_4 || null,
    limite_ars: result.data.limite_ars || null,
    notas: result.data.notas || null,
  }).eq('id', id)
  if (error) return error.message
  revalidatePath('/finanzas/tarjetas')
  return null
}

export async function toggleTarjetaActiva(id: string, activo: boolean) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('tarjetas_credito').update({ activo }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/tarjetas')
}

// Re-export para compatibilidad interna (la implementación pura está en lib/calc/tarjeta.ts)
const calcularMesesTarjeta = calcMesesTarjetaPure

export async function generarCuotasTarjeta(args: {
  tarjetaId: string
  origenTipo: 'COMPRA' | 'GASTO' | 'MANUAL'
  origenId?: string | null
  concepto: string
  montoTotal: number
  cuotasTotal: number
  fechaCompra: string
}) {
  await requireUser()
  const supabase = await createClient()
  const { data: tarjeta } = await supabase
    .from('tarjetas_credito')
    .select('dia_cierre, dia_vencimiento')
    .eq('id', args.tarjetaId)
    .single()
  if (!tarjeta) throw new Error('Tarjeta no encontrada')

  const montos = calcularMontosCuota(args.montoTotal, args.cuotasTotal)
  const { mesCierre } = calcularMesesTarjeta(args.fechaCompra, tarjeta.dia_cierre)

  const rows = Array.from({ length: args.cuotasTotal }, (_, i) => {
    const mesC = new Date(mesCierre + '-01T00:00:00')
    mesC.setMonth(mesC.getMonth() + i)
    const mesV = new Date(mesC.getFullYear(), mesC.getMonth() + 1, 1)
    // Fecha exacta de vencimiento: día_vencimiento de la tarjeta, acotado al último día del mes
    const ultimoDiaMesV = new Date(mesV.getFullYear(), mesV.getMonth() + 1, 0).getDate()
    const diaV = Math.min(Math.max(1, tarjeta.dia_vencimiento || 10), ultimoDiaMesV)
    const fechaVenc = `${mesV.getFullYear()}-${String(mesV.getMonth() + 1).padStart(2, '0')}-${String(diaV).padStart(2, '0')}`
    return {
      tarjeta_id: args.tarjetaId,
      origen_tipo: args.origenTipo,
      origen_id: args.origenId || null,
      concepto: args.cuotasTotal > 1 ? `${args.concepto} (cuota ${i + 1}/${args.cuotasTotal})` : args.concepto,
      monto_total: args.montoTotal,
      cuotas_total: args.cuotasTotal,
      cuota_numero: i + 1,
      monto_cuota: montos[i],
      mes_cierre: `${mesC.getFullYear()}-${String(mesC.getMonth() + 1).padStart(2, '0')}`,
      mes_vencimiento: `${mesV.getFullYear()}-${String(mesV.getMonth() + 1).padStart(2, '0')}`,
      fecha_vencimiento: fechaVenc,
      pagada: false,
    }
  })

  const { error } = await supabase.from('cuotas_tarjeta').insert(rows)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/tarjetas')
}

/**
 * Marca una cuota de tarjeta como pagada/no pagada. Pagar delega al ledger
 * unificado (crea pago tipo_origen=CUOTA por el saldo restante). Despagar
 * solo invierte el flag (no se borran pagos automáticamente para preservar
 * el historial; si querés borrarlos individualmente, usá deletePagoUnificado).
 */
export async function marcarCuotaPagada(id: string, pagada: boolean, fechaPago?: string) {
  await requireUser()
  const supabase = await createClient()
  const fecha = fechaPago ?? new Date().toISOString().split('T')[0]

  if (!pagada) {
    const { error } = await supabase
      .from('cuotas_tarjeta')
      .update({ pagada: false, fecha_pago: null })
      .eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath('/finanzas/tarjetas')
    revalidatePath('/finanzas/pendientes')
    revalidatePath('/finanzas/pagos')
    return
  }

  const { data: c } = await supabase
    .from('cuotas_tarjeta')
    .select('monto_cuota')
    .eq('id', id)
    .single()
  if (!c) throw new Error('Cuota no encontrada')

  const { data: prev } = await supabase
    .from('pagos')
    .select('monto')
    .eq('tipo_origen', 'CUOTA')
    .eq('origen_id', id)
  const yaPagado = (prev ?? []).reduce((s, p) => s + Number(p.monto), 0)
  const restante = Math.max(0, Number(c.monto_cuota) - yaPagado)

  if (restante > 0.01) {
    await createPagoUnificado({
      tipo_origen: 'CUOTA',
      origen_id: id,
      monto: restante,
      moneda: 'ARS',
      fecha_emision: fecha,
      instrumento: 'TRANSFERENCIA',
      notas: 'Marcado pagado (saldo total)',
    })
  } else {
    await supabase
      .from('cuotas_tarjeta')
      .update({ pagada: true, fecha_pago: fecha })
      .eq('id', id)
  }

  // Asegurar que la cuota quede marcada con la fecha indicada (recomputarOrigen usa hoy por default)
  await supabase
    .from('cuotas_tarjeta')
    .update({ pagada: true, fecha_pago: fecha })
    .eq('id', id)

  revalidatePath('/finanzas/tarjetas')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/pagos')
}

/**
 * Liquida en una sola operación todas las cuotas pendientes de una tarjeta con
 * fecha_vencimiento <= hastaMes (formato YYYY-MM). Genera un pago en el ledger
 * por cada cuota desde la cuenta elegida — todos con la misma fecha_emision,
 * representando el débito único del banco al emisor de la tarjeta.
 */
export async function pagarResumenTarjeta(args: {
  tarjetaId: string
  hastaMes: string // YYYY-MM
  cuentaOrigenId: string
  fechaPago: string // YYYY-MM-DD
}) {
  await requireUser()
  if (!/^\d{4}-\d{2}$/.test(args.hastaMes)) throw new Error('Mes inválido (formato YYYY-MM)')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.fechaPago)) throw new Error('Fecha inválida')
  if (!args.cuentaOrigenId) throw new Error('Seleccioná la cuenta de origen')

  const supabase = await createClient()
  const { data: cuotasPend } = await supabase
    .from('cuotas_tarjeta')
    .select('id, monto_cuota')
    .eq('tarjeta_id', args.tarjetaId)
    .eq('pagada', false)
    .lte('mes_vencimiento', args.hastaMes)
  if (!cuotasPend || cuotasPend.length === 0) {
    return { ok: 0, total: 0, errors: [] as string[] }
  }

  // Pagos previos por cuota (para no duplicar saldos cubiertos parcialmente)
  const ids = cuotasPend.map((c) => c.id)
  const { data: prevPagos } = await supabase
    .from('pagos')
    .select('origen_id, monto')
    .eq('tipo_origen', 'CUOTA')
    .in('origen_id', ids)
  const pagadoPorCuota = new Map<string, number>()
  for (const p of prevPagos ?? []) {
    if (!p.origen_id) continue
    pagadoPorCuota.set(p.origen_id, (pagadoPorCuota.get(p.origen_id) ?? 0) + Number(p.monto))
  }

  const errors: string[] = []
  let ok = 0
  let total = 0
  for (const c of cuotasPend) {
    const yaPagado = pagadoPorCuota.get(c.id) ?? 0
    const restante = Math.max(0, Number(c.monto_cuota) - yaPagado)
    if (restante <= 0.01) continue
    try {
      await createPagoUnificado({
        tipo_origen: 'CUOTA',
        origen_id: c.id,
        monto: restante,
        moneda: 'ARS',
        fecha_emision: args.fechaPago,
        instrumento: 'TRANSFERENCIA',
        cuenta_id: args.cuentaOrigenId,
        notas: `Pago resumen tarjeta — hasta ${args.hastaMes}`,
      })
      ok++
      total += restante
    } catch (e) {
      errors.push(`Cuota ${c.id.slice(0, 8)}…: ${(e as Error).message}`)
    }
  }

  revalidatePath('/finanzas/tarjetas')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/pagos')
  return { ok, total, errors }
}

// ============ RETIROS (con categorías y USD master) ============

const retiroSchema = z.object({
  socio: z.string().min(1, 'Requerido'),
  fecha: z.string().min(1, 'Requerido'),
  monto_usd: z.coerce.number().min(0),
  monto_pesos: z.coerce.number().min(0),
  tipo_cambio: z.coerce.number().min(0).default(0),
  categoria_id: optUuid,
  notas: z.string().optional().nullable(),
  medio_pago: z.enum(['TRANSFERENCIA', 'EFECTIVO', 'TARJETA']).default('TRANSFERENCIA'),
  tarjeta_id: optUuid,
  cuotas_total: optInt({ min: 1 }),
})

export async function createRetiro(prevState: string | null, formData: FormData) {
  await requireUser()
  const result = retiroSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message

  const d = result.data
  const mes = d.fecha.substring(0, 7)
  // monto_usd_calculado: si se cargó pesos, lo dividimos por TC; si se cargó USD directo, usamos ese
  const monto_usd_calculado = d.monto_usd > 0
    ? d.monto_usd
    : d.tipo_cambio > 0
      ? Math.round((d.monto_pesos / d.tipo_cambio) * 100) / 100
      : 0

  // Validar tarjeta cuando medio = TARJETA
  if (d.medio_pago === 'TARJETA' && !d.tarjeta_id) {
    return 'Seleccioná una tarjeta'
  }

  const supabase = await createClient()
  const { data: retiroIns, error } = await supabase.from('retiros_socios').insert({
    socio: d.socio,
    fecha: d.fecha,
    monto_usd: d.monto_usd,
    monto_pesos: d.monto_pesos,
    tipo_cambio: d.tipo_cambio,
    mes,
    monto_usd_calculado,
    categoria_id: d.categoria_id || null,
    notas: d.notas || null,
    medio_pago: d.medio_pago,
    tarjeta_id: d.medio_pago === 'TARJETA' ? d.tarjeta_id : null,
    cuotas_total: d.medio_pago === 'TARJETA' ? (d.cuotas_total || 1) : null,
  }).select('id').single()
  if (error) return error.message

  // Si es con tarjeta, generar las cuotas como pasivos del sistema
  if (retiroIns && d.medio_pago === 'TARJETA' && d.tarjeta_id) {
    const cuotas = d.cuotas_total || 1
    const monto = d.monto_pesos > 0 ? d.monto_pesos : (d.monto_usd * d.tipo_cambio)
    if (monto > 0) {
      try {
        await generarCuotasTarjeta({
          tarjetaId: d.tarjeta_id,
          origenTipo: 'MANUAL',
          origenId: retiroIns.id,
          concepto: `Retiro tarjeta - ${d.socio}`,
          montoTotal: Math.round(monto * 100) / 100,
          cuotasTotal: cuotas,
          fechaCompra: d.fecha,
        })
      } catch (e) {
        // El retiro ya quedó cargado; el error sólo afecta a la generación de cuotas
        console.error('Error generando cuotas para retiro:', (e as Error).message)
      }
    }
  }

  revalidatePath('/finanzas/retiros')
  revalidatePath('/finanzas/tarjetas')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/')
  return null
}

/**
 * Cierra y convierte todos los retiros del mes a USD usando un TC fijo.
 * Recalcula monto_usd_calculado para cada retiro y deja un timestamp de conversión.
 * Idempotente: se puede re-ejecutar para actualizar el TC.
 */
export async function cerrarConvertirRetirosMes(mes: string, tcCierre: number) {
  await requireUser()
  if (!mes || !tcCierre || tcCierre <= 0) {
    throw new Error('Mes y tipo de cambio son obligatorios')
  }
  const supabase = await createClient()

  const { data: retiros, error: errFetch } = await supabase
    .from('retiros_socios')
    .select('id, monto_usd, monto_pesos')
    .eq('mes', mes)
  if (errFetch) throw new Error(errFetch.message)
  if (!retiros || retiros.length === 0) {
    throw new Error('No hay retiros para este mes')
  }

  const ahora = new Date().toISOString()
  // Updates en paralelo (1 RTT × N en vez de serial)
  const results = await Promise.all(retiros.map((r) => {
    const usdFromPesos = Math.round((Number(r.monto_pesos) / tcCierre) * 100) / 100
    const usdFinal = Number(r.monto_usd) > 0 ? Number(r.monto_usd) : usdFromPesos
    return supabase
      .from('retiros_socios')
      .update({
        tipo_cambio: tcCierre,
        monto_usd_calculado: usdFinal,
        tc_cierre: tcCierre,
        convertido_at: ahora,
      })
      .eq('id', r.id)
  }))
  const firstError = results.find((r) => r.error)
  if (firstError?.error) throw new Error(firstError.error.message)

  revalidatePath('/finanzas/retiros')
  revalidatePath('/finanzas/cierre-mes')
  return { ok: retiros.length }
}

export async function deleteRetiro(id: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('retiros_socios').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/retiros')
}

const categoriaRetiroSchema = z.object({
  nombre: z.string().min(1),
  emoji: z.string().optional().nullable(),
  color: z.string().min(1),
  orden: z.coerce.number().int().min(0).default(0),
})

export async function createCategoriaRetiro(prevState: string | null, formData: FormData) {
  await requireUser()
  const result = categoriaRetiroSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message
  const supabase = await createClient()
  const { error } = await supabase.from('categorias_retiro').insert({
    ...result.data,
    emoji: result.data.emoji || null,
    activo: true,
  })
  if (error) return error.message
  revalidatePath('/finanzas/retiros')
  return null
}

// ============ AFIP / BIENES (sin cambios) ============

const afipSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  motivo: z.string().min(1),
  monto: z.coerce.number().positive(),
  responsable: z.string().min(1),
  estado: z.enum(['PENDIENTE', 'PAGADO', 'VENCIDO']),
  fecha_vencimiento: z.string().optional().nullable(),
})

export async function createAfip(prevState: string | null, formData: FormData) {
  await requireUser()
  const result = afipSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message
  const supabase = await createClient()
  const { error } = await supabase.from('afip_facturacion').insert({
    ...result.data,
    fecha_vencimiento: result.data.fecha_vencimiento || null,
  })
  if (error) return error.message
  revalidatePath('/finanzas/afip')
  return null
}

const bienSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.string().min(1),
  fecha_compra: z.string().min(1),
  precio: z.coerce.number().positive(),
  vida_util_anos: z.coerce.number().int().positive(),
  valor_residual: z.coerce.number().min(0),
  descripcion: z.string().optional().nullable(),
})

export async function createBien(prevState: string | null, formData: FormData) {
  await requireUser()
  const result = bienSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message
  const supabase = await createClient()
  const { error } = await supabase.from('bienes_uso').insert({
    ...result.data,
    descripcion: result.data.descripcion || null,
    activo: true,
  })
  if (error) return error.message
  revalidatePath('/finanzas/bienes')
  return null
}

// ============ CONFIGURACION PRORRATEO (settings) ============

export async function updateProrrateoConfig(porcentajes: { marca: string; porcentaje: number }[]) {
  await requireUser()
  const total = porcentajes.reduce((s, p) => s + p.porcentaje, 0)
  if (Math.abs(total - 100) > 0.5) {
    throw new Error('Los porcentajes deben sumar 100%')
  }

  const supabase = await createClient()
  // Bulk update: paralelizamos los N updates (4 marcas) en un solo RTT
  const results = await Promise.all(
    porcentajes.map((p) =>
      supabase
        .from('configuracion_prorrateo')
        .update({ porcentaje: p.porcentaje })
        .eq('marca', p.marca)
    )
  )
  const firstError = results.find((r) => r.error)
  if (firstError?.error) throw new Error(firstError.error.message)

  revalidatePath('/settings/prorrateo')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/recurrentes')
}

// ============ IMPORTACION EXCEL ============

interface RecurrenteImport {
  concepto: string
  categoria: string
  monto_estimado: number
  moneda?: string
  iva_incluido?: boolean
  porcentaje_iva?: number
  medio_pago?: string
  dia_vencimiento?: number
  tipo_mes?: string
}

export async function importRecurrentesExcel(rows: RecurrenteImport[]) {
  await requireUser()
  if (!rows.length) return { ok: 0, errors: ['No hay filas para importar'] }
  const supabase = await createClient()
  const errors: string[] = []
  let ok = 0

  for (const [i, row] of rows.entries()) {
    if (!row.concepto || !row.monto_estimado) {
      errors.push(`Fila ${i + 2}: falta concepto o monto`)
      continue
    }
    const { error } = await supabase.from('gastos_recurrentes').insert({
      concepto: row.concepto,
      categoria: row.categoria || 'Otros',
      monto_estimado: row.monto_estimado,
      moneda: row.moneda === 'USD' ? 'USD' : 'ARS',
      iva_incluido: !!row.iva_incluido,
      porcentaje_iva: row.porcentaje_iva ?? 21,
      medio_pago: row.medio_pago || 'TRANSFERENCIA',
      dia_vencimiento: row.dia_vencimiento || null,
      tipo_mes: row.tipo_mes === 'VENCIDO' ? 'VENCIDO' : 'CORRIENTE',
      activo: true,
    })
    if (error) errors.push(`Fila ${i + 2}: ${error.message}`)
    else ok++
  }

  revalidatePath('/finanzas/recurrentes')
  return { ok, errors }
}

interface ProveedorImport {
  nombre: string
  tipo?: string
  contacto?: string
  email?: string
  telefono?: string
  pais?: string
  moneda?: string
  condiciones_pago?: string
}

export async function importProveedoresExcel(rows: ProveedorImport[]) {
  await requireUser()
  if (!rows.length) return { ok: 0, errors: ['No hay filas para importar'] }
  const supabase = await createClient()
  const errors: string[] = []
  let ok = 0

  for (const [i, row] of rows.entries()) {
    if (!row.nombre) {
      errors.push(`Fila ${i + 2}: falta nombre`)
      continue
    }
    const { error } = await supabase.from('proveedores').insert({
      nombre: row.nombre,
      tipo: row.tipo === 'IMPORTACION' ? 'IMPORTACION' : 'NACIONAL',
      contacto: row.contacto || null,
      email: row.email || null,
      telefono: row.telefono || null,
      pais: row.pais || 'Argentina',
      moneda: row.moneda === 'USD' ? 'USD' : 'ARS',
      condiciones_pago: row.condiciones_pago || null,
      activo: true,
    })
    if (error) errors.push(`Fila ${i + 2}: ${error.message}`)
    else ok++
  }

  revalidatePath('/compras/proveedores')
  return { ok, errors }
}

// ============ ACTIVOS MANUALES (no bancarios) ============

const activoManualSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  descripcion: z.string().min(1),
  categoria: z.string().optional().nullable(),
  monto: z.coerce.number().min(0),
  moneda: z.enum(['ARS', 'USD']),
  titular_id: optUuid,
  notas: z.string().optional().nullable(),
})

export async function createActivoManual(prevState: string | null, formData: FormData) {
  await requireUser()
  const result = activoManualSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('activos_manuales').insert({
    ...result.data,
    categoria: result.data.categoria || null,
    titular_id: result.data.titular_id || null,
    notas: result.data.notas || null,
  })
  if (error) return error.message
  revalidatePath('/finanzas/saldos')
  revalidatePath('/finanzas/cierre-mes')
  return null
}

export async function updateActivoManual(id: string, prevState: string | null, formData: FormData) {
  await requireUser()
  const result = activoManualSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('activos_manuales').update({
    ...result.data,
    categoria: result.data.categoria || null,
    titular_id: result.data.titular_id || null,
    notas: result.data.notas || null,
  }).eq('id', id)
  if (error) return error.message
  revalidatePath('/finanzas/saldos')
  revalidatePath('/finanzas/cierre-mes')
  return null
}

export async function deleteActivoManual(id: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('activos_manuales').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/saldos')
  revalidatePath('/finanzas/cierre-mes')
}

// ============ CUENTAS PATRIMONIALES ============

const cuentaPatrimSchema = z.object({
  codigo: z.string().optional().nullable(),
  nombre: z.string().min(1),
  tipo: z.enum(['INVERSION', 'PROVISION', 'CTA_CTE_MARCA', 'PASIVO_ROTATIVO', 'IMPOSITIVO', 'OTRO_ACTIVO', 'OTRO_PASIVO']),
  categoria: z.string().optional().nullable(),
  marca: z.string().optional().nullable(),
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
  signo_pn: z.coerce.number().refine((v) => v === 1 || v === -1, 'Signo debe ser 1 o -1'),
  saldo_inicial: z.coerce.number().default(0),
  mes_inicial: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
  orden: z.coerce.number().int().default(0),
})

export async function createCuentaPatrim(prevState: string | null, formData: FormData) {
  await requireUser()
  const result = cuentaPatrimSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { data: cuenta, error } = await supabase.from('cuentas_patrimoniales').insert({
    ...result.data,
    codigo: result.data.codigo || null,
    categoria: result.data.categoria || null,
    marca: result.data.marca || null,
    mes_inicial: result.data.mes_inicial || null,
    notas: result.data.notas || null,
    activo: true,
  }).select('id').single()
  if (error) return error.message

  // Crear el saldo inicial automáticamente si hay mes_inicial
  if (cuenta && result.data.mes_inicial && result.data.saldo_inicial !== 0) {
    await supabase.from('saldos_cuentas_patrim').insert({
      cuenta_id: cuenta.id,
      mes: result.data.mes_inicial,
      saldo_inicio: 0,
      movimiento: result.data.saldo_inicial,
      saldo_cierre: result.data.saldo_inicial,
      notas: 'Saldo inicial',
    })
  }

  revalidatePath('/finanzas/cuentas-patrimoniales')
  revalidatePath('/finanzas/cierre-mes')
  return null
}

export async function updateCuentaPatrim(id: string, prevState: string | null, formData: FormData) {
  await requireUser()
  const result = cuentaPatrimSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('cuentas_patrimoniales').update({
    ...result.data,
    codigo: result.data.codigo || null,
    categoria: result.data.categoria || null,
    marca: result.data.marca || null,
    mes_inicial: result.data.mes_inicial || null,
    notas: result.data.notas || null,
  }).eq('id', id)
  if (error) return error.message
  revalidatePath('/finanzas/cuentas-patrimoniales')
  revalidatePath('/finanzas/cierre-mes')
  return null
}

export async function toggleCuentaPatrimActiva(id: string, activo: boolean) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('cuentas_patrimoniales').update({ activo }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/cuentas-patrimoniales')
}

export async function deleteCuentaPatrim(id: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('cuentas_patrimoniales').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/cuentas-patrimoniales')
  revalidatePath('/finanzas/cierre-mes')
}

export async function upsertSaldoCuentaPatrim(args: {
  cuentaId: string
  mes: string
  saldoInicio: number
  movimiento: number
  notas?: string | null
}) {
  await requireUser()
  const supabase = await createClient()
  const saldoCierre = Math.round((args.saldoInicio + args.movimiento) * 100) / 100
  const { error } = await supabase.from('saldos_cuentas_patrim').upsert(
    {
      cuenta_id: args.cuentaId,
      mes: args.mes,
      saldo_inicio: args.saldoInicio,
      movimiento: args.movimiento,
      saldo_cierre: saldoCierre,
      notas: args.notas || null,
    },
    { onConflict: 'cuenta_id,mes' },
  )
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/cuentas-patrimoniales')
  revalidatePath('/finanzas/cierre-mes')
}

// ============ SALDOS IMPOSITIVOS ============
// Vista amigable sobre cuentas_patrimoniales (tipo IMPOSITIVO) + saldos_cuentas_patrim.
// Cada impuesto se guarda con signo_pn = 1 fijo; la POSICIÓN del mes (a favor / a pagar)
// se expresa con el signo del saldo_cierre: positivo = a favor (activo), negativo = a pagar (pasivo).
// Así el motor del cierre de mes (aporte = signo_pn × saldo) lo clasifica solo.

export async function createImpuesto(nombre: string) {
  await requireUser()
  if (!nombre?.trim()) return 'El nombre es obligatorio'
  const supabase = await createClient()
  const { error } = await supabase.from('cuentas_patrimoniales').insert({
    nombre: nombre.trim(),
    tipo: 'IMPOSITIVO',
    signo_pn: 1,
    moneda: 'ARS',
    activo: true,
  })
  if (error) return error.message
  revalidatePath('/finanzas/saldos-impositivos')
  revalidatePath('/finanzas/cierre-mes')
  return null
}

export async function renameImpuesto(id: string, nombre: string) {
  await requireUser()
  if (!nombre?.trim()) throw new Error('El nombre es obligatorio')
  const supabase = await createClient()
  const { error } = await supabase.from('cuentas_patrimoniales').update({ nombre: nombre.trim() }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/saldos-impositivos')
  revalidatePath('/finanzas/cierre-mes')
}

export async function deleteImpuesto(id: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('cuentas_patrimoniales').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/saldos-impositivos')
  revalidatePath('/finanzas/cierre-mes')
}

/** Fija la posición de un impuesto en un mes. monto siempre positivo; posicion define el signo. */
export async function setSaldoImpositivo(args: {
  cuentaId: string
  mes: string
  posicion: 'favor' | 'pagar'
  monto: number
}) {
  await requireUser()
  const supabase = await createClient()
  const abs = Math.abs(Number(args.monto) || 0)
  const signed = args.posicion === 'pagar' ? -abs : abs
  const { error } = await supabase.from('saldos_cuentas_patrim').upsert(
    {
      cuenta_id: args.cuentaId,
      mes: args.mes,
      saldo_inicio: 0,
      movimiento: signed,
      saldo_cierre: signed,
    },
    { onConflict: 'cuenta_id,mes' },
  )
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/saldos-impositivos')
  revalidatePath('/finanzas/cierre-mes')
}

/**
 * Sugiere el movimiento de una cuenta INVENTARIO de una marca específica para el mes:
 * movimiento = SUM(compras netas WHERE negocio=marca, mes) − datos_ventas_gn.cmv
 * Neto = bruto − IVA (el CMV es neto; el IVA es crédito fiscal, vive en impositivos).
 */
export async function sugerirMovimientoInventario(args: {
  cuentaId: string
  marca: 'BDI' | 'ZATTIA' | 'STUNNED'
  mes: string
}) {
  await requireUser()
  const supabase = await createClient()

  // Sumar compras de la marca en el mes (rango: primer y último día)
  const [year, m] = args.mes.split('-').map(Number)
  const desde = `${args.mes}-01`
  const hasta = new Date(year, m, 0).toISOString().split('T')[0]

  const { data: compras } = await supabase
    .from('compras')
    .select('monto_total, iva')
    .eq('negocio', args.marca)
    .gte('fecha', desde)
    .lte('fecha', hasta)

  // Neto de IVA = bruto − iva (la parte no facturada, sin IVA, queda entera)
  const totalCompras = (compras ?? []).reduce((s, c) => s + (Number(c.monto_total) - Number(c.iva)), 0)

  // CMV de la marca en el mes
  const { data: ventas } = await supabase
    .from('datos_ventas_gn')
    .select('cmv')
    .eq('marca', args.marca)
    .eq('mes', args.mes)
    .maybeSingle()
  const cmv = Number(ventas?.cmv ?? 0)

  const movimiento = totalCompras - cmv

  // Cargar saldo actual del mes (si existe)
  const { data: saldoActual } = await supabase
    .from('saldos_cuentas_patrim')
    .select('saldo_inicio')
    .eq('cuenta_id', args.cuentaId)
    .eq('mes', args.mes)
    .maybeSingle()

  // Si no hay saldo, buscar saldo del mes anterior
  let saldoInicio = Number(saldoActual?.saldo_inicio ?? 0)
  if (saldoInicio === 0 && !saldoActual) {
    const prevDate = new Date(year, m - 2, 1)
    const mesAnterior = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    const { data: saldoAnt } = await supabase
      .from('saldos_cuentas_patrim')
      .select('saldo_cierre')
      .eq('cuenta_id', args.cuentaId)
      .eq('mes', mesAnterior)
      .maybeSingle()
    if (saldoAnt) saldoInicio = Number(saldoAnt.saldo_cierre)
  }

  return {
    totalCompras: Math.round(totalCompras * 100) / 100,
    cmv: Math.round(cmv * 100) / 100,
    movimiento: Math.round(movimiento * 100) / 100,
    saldoInicio: Math.round(saldoInicio * 100) / 100,
    saldoCierreSugerido: Math.round((saldoInicio + movimiento) * 100) / 100,
  }
}

// ── Posición de mercadería: arranque + Σ(compras netas − CMV) ──────────────
// Contra-asiento de compras/CMV (no se trackea el inventario físico real). El arranque va
// NEGATIVO (pasivo/pendiente de reposición): vender (CMV) lo hace más negativo, comprar lo
// hace menos negativo. Como pasivo, el resultado del mes = margen. Grupos: BDI; ZATTIA+STUNNED.
const GRUPOS_REPOSICION: Record<'BDI' | 'ZATTIA_STUNNED', ('BDI' | 'ZATTIA' | 'STUNNED')[]> = {
  BDI: ['BDI'],
  ZATTIA_STUNNED: ['ZATTIA', 'STUNNED'],
}
// Arranque = cierre de abril 2026 (se acumula desde mayo), NEGATIVO (es un pendiente de reposición).
const ARRANQUE_REPOSICION: Record<'BDI' | 'ZATTIA_STUNNED', number> = {
  BDI: -27687627.89,
  ZATTIA_STUNNED: -62592664.99,
}
const MES_ARRANQUE_REPOSICION = '2026-04'

function siguienteMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m, 1) // m (1-index) como índice 0-based = mes siguiente
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * saldo(grupo, mes) = arranqueAbril + Σ(mayo..mes) [ comprasNetas_mes − CMV_mes ]
 *   comprasNetas = Σ(monto_total − iva) de compras del grupo (por `negocio`) en el mes → SUBE el inventario.
 *   CMV          = Σ datos_ventas_gn.cmv del grupo en el mes → BAJA el inventario (venta).
 * Producción en proceso (negocio='PRODUCCION') NO entra: el filtro por marca la excluye sola.
 * Devuelve los acumulados (compras/CMV) para mostrar el movimiento de la cuenta.
 */
export async function calcularReposicion(grupo: 'BDI' | 'ZATTIA_STUNNED', mes: string) {
  await requireUser()
  const supabase = await createClient()
  const marcas = GRUPOS_REPOSICION[grupo]
  const arranque = ARRANQUE_REPOSICION[grupo] ?? 0
  const r2 = (n: number) => Math.round(n * 100) / 100

  const meses: string[] = []
  let cur = siguienteMes(MES_ARRANQUE_REPOSICION)
  while (cur <= mes) { meses.push(cur); cur = siguienteMes(cur) }

  let totalCompras = 0, totalCmv = 0
  const detalle: { mes: string; cmv: number; comprasNetas: number }[] = []
  for (const mm of meses) {
    const [year, m] = mm.split('-').map(Number)
    const desde = `${mm}-01`
    const hasta = new Date(year, m, 0).toISOString().split('T')[0]
    const { data: compras } = await supabase
      .from('compras')
      .select('monto_total, iva')
      .in('negocio', marcas)
      .gte('fecha', desde)
      .lte('fecha', hasta)
    const comprasNetas = (compras ?? []).reduce((s, c) => s + (Number(c.monto_total) - Number(c.iva)), 0)
    const { data: ventas } = await supabase
      .from('datos_ventas_gn')
      .select('cmv')
      .in('marca', marcas)
      .eq('mes', mm)
    const cmv = (ventas ?? []).reduce((s, v) => s + Number(v.cmv), 0)
    totalCompras += comprasNetas
    totalCmv += cmv
    detalle.push({ mes: mm, cmv: r2(cmv), comprasNetas: r2(comprasNetas) })
  }

  // Inventario contable: sube por compra, baja por CMV
  const saldo = r2(arranque + totalCompras - totalCmv)
  return { grupo, arranque: r2(arranque), comprasNetas: r2(totalCompras), cmv: r2(totalCmv), saldo, detalle }
}

/**
 * Arrastra los saldos del mes anterior:
 * para cada cuenta activa, crea o actualiza el saldo del mes destino con
 * saldo_inicio = saldo_cierre del mes anterior (movimiento queda en 0).
 */
export async function arrastrarSaldosPatrim(mes: string) {
  await requireUser()
  const supabase = await createClient()
  const [y, m] = mes.split('-').map(Number)
  const prevDate = new Date(y, m - 2, 1)
  const mesAnterior = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

  const { data: cuentas } = await supabase.from('cuentas_patrimoniales').select('id, saldo_inicial, mes_inicial').eq('activo', true)
  const { data: saldosAnt } = await supabase.from('saldos_cuentas_patrim').select('cuenta_id, saldo_cierre').eq('mes', mesAnterior)
  const saldoAntMap = new Map<string, number>()
  for (const s of saldosAnt ?? []) saldoAntMap.set(s.cuenta_id, Number(s.saldo_cierre))

  // Buscar saldos existentes del mes destino para no pisar movimientos ya cargados
  const { data: saldosActuales } = await supabase.from('saldos_cuentas_patrim').select('cuenta_id').eq('mes', mes)
  const yaTieneSaldo = new Set((saldosActuales ?? []).map((s) => s.cuenta_id))

  for (const c of cuentas ?? []) {
    if (yaTieneSaldo.has(c.id)) continue
    let saldoInicio = saldoAntMap.get(c.id) ?? 0
    // Si no hay mes anterior pero el mes_inicial coincide con este mes, usar saldo_inicial
    if (saldoInicio === 0 && c.mes_inicial && c.mes_inicial <= mes) {
      saldoInicio = Number(c.saldo_inicial ?? 0)
    }
    await supabase.from('saldos_cuentas_patrim').insert({
      cuenta_id: c.id,
      mes,
      saldo_inicio: saldoInicio,
      movimiento: 0,
      saldo_cierre: saldoInicio,
    })
  }
  revalidatePath('/finanzas/cuentas-patrimoniales')
  revalidatePath('/finanzas/cierre-mes')
}

// ============ CIERRE DE MES (ARQUEO PATRIMONIAL) ============

export async function upsertCierreMes(args: {
  mes: string
  tipo_cambio: number
  caja_ars: number
  caja_usd: number
  pasivos_manuales: Array<{
    id?: string
    descripcion: string
    monto: number
    moneda: 'ARS' | 'USD'
    acreedor?: string | null
    notas?: string | null
  }>
  notas?: string | null
}) {
  await requireUser()
  const supabase = await createClient()

  // Verificar que no esté cerrado
  const { data: existente } = await supabase
    .from('cierres_mensuales')
    .select('id, cerrado')
    .eq('mes', args.mes)
    .maybeSingle()
  if (existente?.cerrado) throw new Error('Este cierre ya está confirmado y no se puede editar')

  const { error } = await supabase.from('cierres_mensuales').upsert(
    {
      mes: args.mes,
      tipo_cambio: args.tipo_cambio,
      caja_ars: args.caja_ars,
      caja_usd: args.caja_usd,
      pasivos_manuales: args.pasivos_manuales,
      notas: args.notas || null,
    },
    { onConflict: 'mes' },
  )
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/cierre-mes')
}

export async function confirmarCierreMes(args: {
  mes: string
  tipo_cambio: number
  caja_ars: number
  caja_usd: number
  pasivos_manuales: PasivoManualInput[]
  snapshotCuentas: SnapshotCuentaInput[]
  snapshotPasivos: Record<string, unknown>
  snapshotRetiros: Record<string, unknown>
  totales: {
    total_activos_ars: number
    total_activos_usd: number
    total_pasivos_ars: number
    total_pasivos_usd: number
    pn_ars: number
    pn_usd: number
    total_retiros_ars: number
    total_retiros_usd: number
    resultado_ars: number
  }
  notas?: string | null
}) {
  await requireUser()
  const supabase = await createClient()

  const { data: existente } = await supabase
    .from('cierres_mensuales')
    .select('id, cerrado')
    .eq('mes', args.mes)
    .maybeSingle()
  if (existente?.cerrado) throw new Error('Este cierre ya está confirmado')

  const { error } = await supabase.from('cierres_mensuales').upsert(
    {
      mes: args.mes,
      tipo_cambio: args.tipo_cambio,
      caja_ars: args.caja_ars,
      caja_usd: args.caja_usd,
      pasivos_manuales: args.pasivos_manuales,
      snapshot_cuentas: args.snapshotCuentas,
      snapshot_pasivos: args.snapshotPasivos,
      snapshot_retiros: args.snapshotRetiros,
      ...args.totales,
      cerrado: true,
      fecha_cierre: new Date().toISOString(),
      notas: args.notas || null,
    },
    { onConflict: 'mes' },
  )
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/cierre-mes')
}

export async function reabrirCierreMes(mes: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('cierres_mensuales')
    .update({ cerrado: false, fecha_cierre: null })
    .eq('mes', mes)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/cierre-mes')
}

interface PasivoManualInput {
  id?: string
  descripcion: string
  monto: number
  moneda: 'ARS' | 'USD'
  acreedor?: string | null
  notas?: string | null
}

interface SnapshotCuentaInput {
  cuenta_id: string
  titular_nombre: string
  banco: string
  nombre: string
  tipo: string
  saldo_ars: number
  saldo_usd: number
}

// Backward compat: upsertSaldo legado (mantiene tabla saldos_mensuales si la usás)
const saldoSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  saldo_pesos: z.coerce.number(),
  saldo_usd: z.coerce.number(),
  caja_pesos: z.coerce.number(),
  caja_usd: z.coerce.number(),
  cuentas_corrientes: z.coerce.number(),
  notas: z.string().optional().nullable(),
})

export async function upsertSaldo(prevState: string | null, formData: FormData) {
  await requireUser()
  const result = saldoSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return result.error.issues[0].message
  const supabase = await createClient()
  const { error } = await supabase
    .from('saldos_mensuales')
    .upsert({ ...result.data, notas: result.data.notas || null }, { onConflict: 'mes' })
  if (error) return error.message
  revalidatePath('/finanzas/saldos')
  return null
}

/**
 * Paga TODO el saldo pendiente de un recurrente: marca todos los gastos
 * pendientes asociados a ese recurrente_id como PAGADO, desde la cuenta indicada.
 * Devuelve cuántos gastos se pagaron y el total.
 */
export async function pagarSaldoRecurrente(args: {
  recurrenteId: string
  cuentaOrigenId: string | null
  fechaPago?: string
}) {
  await requireUser()
  const supabase = await createClient()

  const { data: gastos, error } = await supabase
    .from('gastos')
    .select('id, monto')
    .eq('recurrente_id', args.recurrenteId)
    .neq('estado', 'PAGADO')
  if (error) throw new Error(error.message)
  if (!gastos || gastos.length === 0) {
    return { pagados: 0, total: 0 }
  }

  let total = 0
  let pagados = 0
  for (const g of gastos) {
    try {
      await marcarGastoPagado(g.id, args.cuentaOrigenId, args.fechaPago)
      total += Number(g.monto)
      pagados += 1
    } catch {
      // Ignorar errores individuales para que un gasto roto no impida pagar los demás
    }
  }

  revalidatePath('/finanzas/saldos-acumulados')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
  revalidatePath('/finanzas/recurrentes')

  return { pagados, total }
}
