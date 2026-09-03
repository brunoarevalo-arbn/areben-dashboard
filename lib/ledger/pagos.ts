import 'server-only'
import { z } from 'zod'
import { optUuid } from '@/lib/zod-helpers'
import { resolverOrigenDeGasto } from '@/lib/pagos-gastos'
import type { TipoOrigenPago, InstrumentoPago } from '@/types/database'

// El ledger de salidas, separado de QUIÉN lo pidió.
//
// Todo esto vivía en `app/actions/pagos.ts` y sigue siendo el mismo código, movido tal cual. Se
// separó cuando apareció un segundo llamador que **no es una persona**: la puerta de servicio
// (`app/api/puente/*`), por la que el Monitor registra el pago de un cliente que transfirió
// directo a un acreedor. Esa puerta no tiene sesión —del otro lado hay un servidor— así que no
// puede usar `requireUser()` ni el cliente de Supabase que lee la cookie.
//
// 🔑 **Lo que NO se hizo: una segunda implementación.** Escribir el pago desde la puerta por su
// cuenta habría duplicado la validación de saldo, la derivación de `debitado` y el marcado del
// gasto. Es el mismo argumento que del lado de la lectura: dos implementaciones del mismo
// criterio terminan dando distinto, y el día que pase nadie va a saber cuál creer.
//
// Lo que cambió respecto del original:
//   - la conexión LLEGA por parámetro en vez de fabricarse adentro. Cada entrada trae la suya:
//     las pantallas, la del usuario logueado (respeta RLS); la puerta, la de servicio (detrás
//     del sobre, ver `lib/puente-auth.ts`).
//   - el chequeo de sesión y los `revalidatePath` quedaron AFUERA: son de la entrada, no del
//     ledger. `createPagoUnificado` los sigue haciendo exactamente igual que antes.
//
// ⛔ Nadie más debería llamar a `crearPagoEnLedger` directo. Las pantallas y las actions siguen
// entrando por `createPagoUnificado`, que es la puerta con sesión.

/**
 * La conexión a Supabase. Se tipa a lo que el ledger usa —`from(...)`— y no al cliente completo,
 * porque las dos entradas traen clientes de tipos distintos (el de `@supabase/ssr` y el de
 * `@supabase/supabase-js`) y lo único que tienen que compartir es esto.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClienteLedger = { from: (tabla: string) => any }

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
  // Quién transfirió, cuando no fuimos nosotros (migración 081). Los llena sólo la puerta de
  // servicio; desde las pantallas del dashboard no viajan y quedan en NULL.
  pagador_cliente_id: z.string().optional().nullable(),
  pagador_nombre: z.string().optional().nullable(),
  operacion_id: optUuid,
})

export type PagoUnifInput = z.infer<typeof pagoUnifSchema>

/**
 * Recalcula el estado del origen del pago: marca PAGADO/pagada=true si total pagado >= total deuda;
 * revierte a PENDIENTE si se borró un pago y ya no está completamente paga.
 */
export async function recomputarOrigen(
  sb: ClienteLedger,
  tipo: TipoOrigenPago,
  origenId: string | null,
) {
  if (!origenId || tipo === 'LIBRE' || tipo === 'COMPRA') {
    // COMPRA tiene su propio trigger SQL (actualizar_saldo_compra). LIBRE no tiene origen.
    return
  }


  // Sum total pagado para este origen (sólo pagos debitados o sin marca de no-debitado)
  const { data: pagosRel } = await sb
    .from('pagos')
    .select('monto, fecha_emision')
    .eq('tipo_origen', tipo)
    .eq('origen_id', origenId)
  const filas = (pagosRel ?? []) as { monto: number | string; fecha_emision: string | null }[]
  const totalPagado = filas.reduce((s, p) => s + Number(p.monto), 0)
  // Fecha real en que quedó saldado = la del último pago cargado (no "hoy"). Así el cierre
  // (que netea por fecha) refleja cuándo se pagó de verdad, no cuándo se tocó el sistema.
  const fechaUltimoPago =
    filas
      .map((p) => p.fecha_emision)
      .filter((f): f is string => !!f)
      .sort()
      .at(-1) ?? new Date().toISOString().split('T')[0]

  if (tipo === 'GASTO') {
    const { data: g } = await sb
      .from('gastos')
      .select('monto, estado')
      .eq('id', origenId)
      .single()
    if (!g) return
    const total = Number(g.monto)
    const completo = totalPagado + 0.01 >= total
    if (completo && g.estado !== 'PAGADO') {
      await sb
        .from('gastos')
        .update({ estado: 'PAGADO', fecha_pago: fechaUltimoPago })
        .eq('id', origenId)
    } else if (!completo && g.estado === 'PAGADO') {
      await sb
        .from('gastos')
        .update({ estado: 'PENDIENTE', fecha_pago: null })
        .eq('id', origenId)
    }
    return
  }

  if (tipo === 'NOMINA') {
    const { data: n } = await sb
      .from('nomina_mensual')
      .select('neto, estado, gasto_pendiente_id')
      .eq('id', origenId)
      .single()
    if (!n) return
    const total = Number(n.neto)
    const completo = totalPagado + 0.01 >= total
    if (completo && n.estado !== 'PAGADO') {
      await sb.from('nomina_mensual').update({ estado: 'PAGADO' }).eq('id', origenId)
      if (n.gasto_pendiente_id) {
        await sb.from('gastos')
          .update({ estado: 'PAGADO', fecha_pago: fechaUltimoPago })
          .eq('id', n.gasto_pendiente_id)
      }
    } else if (!completo && n.estado === 'PAGADO') {
      await sb.from('nomina_mensual').update({ estado: 'PENDIENTE' }).eq('id', origenId)
      if (n.gasto_pendiente_id) {
        await sb.from('gastos')
          .update({ estado: 'PENDIENTE', fecha_pago: null })
          .eq('id', n.gasto_pendiente_id)
      }
    }
    return
  }

  if (tipo === 'CUOTA') {
    const { data: c } = await sb
      .from('cuotas_tarjeta')
      .select('monto_cuota, pagada')
      .eq('id', origenId)
      .single()
    if (!c) return
    const total = Number(c.monto_cuota)
    const completo = totalPagado + 0.01 >= total
    if (completo && !c.pagada) {
      await sb
        .from('cuotas_tarjeta')
        .update({ pagada: true, fecha_pago: fechaUltimoPago })
        .eq('id', origenId)
    } else if (!completo && c.pagada) {
      await sb
        .from('cuotas_tarjeta')
        .update({ pagada: false, fecha_pago: null })
        .eq('id', origenId)
    }
    return
  }

  if (tipo === 'PRESTAMO') {
    const { data: c } = await sb
      .from('prestamo_cuotas')
      .select('monto_total, pagada, prestamo_id, fecha_vencimiento')
      .eq('id', origenId)
      .single()
    if (!c) return
    const total = Number(c.monto_total)
    const completo = totalPagado + 0.01 >= total
    if (completo && !c.pagada) {
      await sb
        .from('prestamo_cuotas')
        .update({ pagada: true, fecha_pago: fechaUltimoPago })
        .eq('id', origenId)
      // Marcar el gasto financiero (interés) de ese mes como PAGADO
      await sb
        .from('gastos')
        .update({ estado: 'PAGADO', fecha_pago: fechaUltimoPago })
        .eq('prestamo_id', c.prestamo_id)
        .eq('mes', c.fecha_vencimiento.substring(0, 7))
        .eq('categoria', 'Gastos Financieros')
    } else if (!completo && c.pagada) {
      await sb
        .from('prestamo_cuotas')
        .update({ pagada: false, fecha_pago: null })
        .eq('id', origenId)
      await sb
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
export async function crearPagoEnLedger(sb: ClienteLedger, input: PagoUnifInput) {
  const result = pagoUnifSchema.safeParse(input)
  if (!result.success) throw new Error(result.error.issues[0].message)
  const d = result.data

  // Un gasto-sueldo es el ESPEJO de una nómina: la deuda vive en nomina_mensual.
  // Imputar el pago al gasto dejaría a Nómina viendo el neto entero (y al revés),
  // y el saldo se calcularía dos veces contra dos totales distintos. Se redirige acá,
  // en el núcleo, para que dé igual desde qué pantalla se pague.
  //
  // ⚠️ Llegó de `main` el 3-sep-2026, cuando esto todavía vivía en `createPagoUnificado`. Se movió
  // ACÁ y no se dejó en la action a propósito: si quedaba allá, un pago que entra por la puerta de
  // servicio —el cliente que le transfiere a un acreedor— se saltearía el redirect y se imputaría
  // al gasto en vez de a la nómina.
  if (d.tipo_origen === 'GASTO' && d.origen_id) {
    // El cast: `resolverOrigenDeGasto` se tipa contra el cliente con sesión, y acá el cliente puede
    // ser ése o el de servicio. Lo único que usa de los dos es `from`, que es justo lo que
    // `ClienteLedger` promete.
    const origen = await resolverOrigenDeGasto(sb as never, d.origen_id)
    if (origen.tipo_origen === 'NOMINA') {
      d.tipo_origen = 'NOMINA'
      d.origen_id = origen.origen_id
    }
  }

  // Validar origen y saldo (excepto LIBRE)
  if (d.tipo_origen !== 'LIBRE') {
    if (!d.origen_id) throw new Error('Se requiere origen_id para este tipo')
  
    let totalDeuda = 0
    if (d.tipo_origen === 'COMPRA') {
      const { data } = await sb.from('compras').select('saldo_pendiente, monto_total').eq('id', d.origen_id).single()
      totalDeuda = Number(data?.saldo_pendiente ?? data?.monto_total ?? 0)
    } else if (d.tipo_origen === 'GASTO') {
      const { data } = await sb.from('gastos').select('monto').eq('id', d.origen_id).single()
      totalDeuda = Number(data?.monto ?? 0)
    } else if (d.tipo_origen === 'NOMINA') {
      const { data } = await sb.from('nomina_mensual').select('neto').eq('id', d.origen_id).single()
      totalDeuda = Number(data?.neto ?? 0)
    } else if (d.tipo_origen === 'CUOTA') {
      const { data } = await sb.from('cuotas_tarjeta').select('monto_cuota').eq('id', d.origen_id).single()
      totalDeuda = Number(data?.monto_cuota ?? 0)
    } else if (d.tipo_origen === 'PRESTAMO') {
      const { data } = await sb.from('prestamo_cuotas').select('monto_total').eq('id', d.origen_id).single()
      totalDeuda = Number(data?.monto_total ?? 0)
    }

    // Para gastos/nomina/cuota: comparar contra suma ya pagada (compra usa saldo_pendiente)
    if (d.tipo_origen !== 'COMPRA') {
      const { data: prev } = await sb
        .from('pagos')
        .select('monto')
        .eq('tipo_origen', d.tipo_origen)
        .eq('origen_id', d.origen_id)
      const previos = (prev ?? []) as { monto: number | string }[]
      const yaPagado = previos.reduce((s, p) => s + Number(p.monto), 0)
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

  const { data: creado, error } = await sb.from('pagos').insert({
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
    // Quién transfirió y de qué operación salió (migración 081). Los tres son NULL en la carga
    // manual, que es el caso normal: sólo los llena la puerta de servicio.
    pagador_cliente_id: d.pagador_cliente_id || null,
    pagador_nombre: d.pagador_nombre || null,
    operacion_id: d.operacion_id || null,
  })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  if (d.tipo_origen !== 'COMPRA') {
    await recomputarOrigen(sb, d.tipo_origen, d.origen_id ?? null)
  }
  // COMPRA: el trigger SQL (actualizar_saldo_compra) ya recomputa saldo_pendiente y estado

  // El id del pago recién creado. Lo usa la puerta de servicio para archivar en el compromiso
  // exactamente qué renglones se escribieron; `createPagoUnificado` lo ignora.
  return (creado as { id: string } | null)?.id ?? null
}
