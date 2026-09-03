import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verificarPuente } from '@/lib/puente-auth'
import { clienteDeServicio } from '@/lib/supabase/servicio'
import { armarCuentas, repartirPago } from '@/lib/acreedores'
import { crearPagoEnLedger } from '@/lib/ledger/pagos'

// Puerta de servicio: registrar que un cliente transfirió DIRECTO a un acreedor.
//
//   POST /api/puente/pagos     header  x-puente-auth: <PUENTE_SECRET>
//
// Es el momento en que el circuito cierra: la plata ya se movió de la cuenta del cliente a la del
// contador, y acá se anota que esa deuda nuestra bajó y quién la pagó.
//
// 🔑 **El reparto se calcula ACÁ, con datos frescos.** El Monitor manda un importe, no renglones:
// entre que se prometió y que se transfirió pueden haber pasado días, y la deuda pudo cambiar. Si
// mandara el reparto ya hecho, se estaría imputando contra una foto vieja.
//
// 🔑 **Idempotencia por `operacion_id`, y no es opcional.** `crearPagoEnLedger` escribe un pago por
// renglón sin transacción, así que un reintento a ciegas —el celular sin señal, el botón apretado
// dos veces— duplicaría los renglones que sí entraron. Y un pago duplicado no se ve raro: se ve
// como un pago. La operación se ANOTA ANTES de escribir un peso, con el id como clave primaria; el
// segundo intento choca contra la clave y recibe lo que pasó la primera vez, sin tocar nada.
//
// ⛔ Lo que esta puerta NO decide: si el cliente transfirió menos de lo prometido, acá entra el
// importe REAL y punto. Qué hacer con lo que falta —seguir reclamándolo o cerrar la promesa— es
// del lado del Monitor, que es donde vive el compromiso.

export const dynamic = 'force-dynamic'

// Los mensajes se escriben para que se lean: viajan al Monitor y terminan a la vista de una
// persona. Sin el `error` propio, un campo que falta sale como "expected string, received
// undefined", que no le dice nada a nadie.
const cuerpo = z.object({
  /** El id de la operación del Monitor. Es lo que hace que un reintento no duplique nada. */
  operacion_id: z.uuid({ error: 'Falta el número de la operación, que es lo que evita registrar el pago dos veces.' }),
  acreedor_id: z.uuid({ error: 'Falta a quién se le pagó.' }),
  monto: z.coerce.number({ error: 'Falta cuánto transfirió.' }).positive('El monto tiene que ser mayor que cero.'),
  /** Cuándo transfirió el cliente. No es "hoy": el cierre netea por la fecha real. */
  fecha: z
    .string({ error: 'Falta qué día se hizo la transferencia.' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va como AAAA-MM-DD.'),
  instrumento: z.enum(['TRANSFERENCIA', 'EFECTIVO']).default('TRANSFERENCIA'),
  pagador: z.object(
    {
      /** Id del cliente en Gestión Nube. Referencia blanda: puede no venir. */
      cliente_id: z.string().optional().nullable(),
      /** A nombre de quién salió la transferencia. Puede no ser el cliente. */
      nombre: z.string({ error: 'Falta a nombre de quién salió la transferencia.' }).min(1, 'Falta a nombre de quién salió la transferencia.'),
    },
    { error: 'Falta quién transfirió.' },
  ),
  /** Quién apretó el botón en el Monitor. ⚠️ El dashboard no lo verifica: lo afirma el Monitor. */
  pedido_por: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
})

type Cuerpo = z.infer<typeof cuerpo>

/** Sin esto, un pago con fecha vieja entraría a un mes ya cerrado y descuadraría el cierre. */
async function mesCerradoMasReciente(sb: ReturnType<typeof clienteDeServicio>): Promise<string | null> {
  const { data } = await sb
    .from('cierres_mensuales')
    .select('mes')
    .eq('cerrado', true)
    .order('mes', { ascending: false })
    .limit(1)
  return data?.[0]?.mes ?? null
}

export async function POST(request: Request) {
  const sobre = verificarPuente(request)
  if (!sobre.ok) return NextResponse.json({ error: sobre.error }, { status: sobre.status })

  let datos: Cuerpo
  try {
    datos = cuerpo.parse(await request.json())
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0].message : 'El pedido no se entiende.'
    return NextResponse.json({ error: detalle }, { status: 400 })
  }

  const sb = clienteDeServicio()

  try {
    // ── 1. El candado. Antes que nada, para que un reintento no llegue a escribir ────────
    const { error: eLock } = await sb.from('puente_operaciones').insert({
      operacion_id: datos.operacion_id,
      recurso: 'pago-acreedor',
      pedido: datos,
      pedido_por: datos.pedido_por ?? null,
      estado: 'EN_CURSO',
    })
    if (eLock) {
      if (eLock.code !== '23505') {
        return NextResponse.json({ error: eLock.message }, { status: 502 })
      }
      // Ya se había pedido esta misma operación: se contesta lo de la primera vez.
      const { data: previa } = await sb
        .from('puente_operaciones')
        .select('estado, resultado, error')
        .eq('operacion_id', datos.operacion_id)
        .single()
      if (previa?.estado === 'OK') {
        return NextResponse.json({ repetida: true, ...(previa.resultado as object) })
      }
      if (previa?.estado === 'EN_CURSO') {
        return NextResponse.json(
          { error: 'Esa misma operación se está registrando ahora mismo. Esperá unos segundos y mirá si quedó.' },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: `Esa operación ya se intentó y falló: ${previa?.error ?? 'sin detalle'}` },
        { status: 409 },
      )
    }

    const cerrar = async (estado: 'OK' | 'ERROR', extra: Record<string, unknown>) => {
      await sb
        .from('puente_operaciones')
        .update({ estado, ...extra, cerrado_at: new Date().toISOString() })
        .eq('operacion_id', datos.operacion_id)
    }

    // ── 2. El mes cerrado ────────────────────────────────────────────────────────────────
    const ultimoCerrado = await mesCerradoMasReciente(sb)
    const mesDelPago = datos.fecha.substring(0, 7)
    if (ultimoCerrado && mesDelPago <= ultimoCerrado) {
      const msg = `El mes ${mesDelPago} ya está cerrado (el último cerrado es ${ultimoCerrado}). Cargalo a mano en el dashboard después de reabrirlo.`
      await cerrar('ERROR', { error: msg })
      return NextResponse.json({ error: msg }, { status: 409 })
    }

    // ── 3. La deuda de HOY, no la de cuando se prometió ──────────────────────────────────
    const { data: gastos, error: eGastos } = await sb
      .from('gastos')
      .select('id, concepto, categoria, mes, fecha, monto, moneda, estado, notas, proveedor_id')
      .eq('proveedor_id', datos.acreedor_id)
    if (eGastos) {
      await cerrar('ERROR', { error: eGastos.message })
      return NextResponse.json({ error: eGastos.message }, { status: 502 })
    }

    const ids = (gastos ?? []).map((g: { id: string }) => g.id)
    const { data: pagosPrevios } = ids.length
      ? await sb
          .from('pagos')
          .select('id, origen_id, monto, fecha_emision, fecha_debito, debitado, instrumento, notas')
          .eq('tipo_origen', 'GASTO')
          .in('origen_id', ids)
      : { data: [] }

    const [cuenta] = armarCuentas(
      (gastos ?? []).map((g: { monto: number | string }) => ({ ...g, monto: Number(g.monto) })) as never,
      (pagosPrevios ?? []).map((p: { monto: number | string }) => ({ ...p, monto: Number(p.monto) })) as never,
      [{ id: datos.acreedor_id, nombre: 'acreedor' }],
    )
    if (!cuenta) {
      const msg = 'Ese acreedor no tiene ningún gasto a su nombre: no hay deuda a la que imputar la transferencia.'
      await cerrar('ERROR', { error: msg })
      return NextResponse.json({ error: msg }, { status: 409 })
    }

    const reparto = repartirPago(cuenta.conceptos, datos.monto)
    if (reparto.imputado <= 0.005) {
      const msg = 'No queda deuda a la que imputar esta transferencia. Puede que ya se haya registrado por otro lado.'
      await cerrar('ERROR', { error: msg })
      return NextResponse.json({ error: msg, entra: 0 }, { status: 409 })
    }
    if (reparto.sobrante > 0.005) {
      // ⛔ No se imputa de a partes: o entra todo o no entra. Un pago a medias dejaría la
      // diferencia sin registro en ningún lado —el saldo a favor no existe en este modelo— y
      // habría que descubrirla conciliando. Mejor frenar y decir cuánto entra.
      const msg = `Entran ${reparto.imputado.toFixed(2)} de ${datos.monto.toFixed(2)}: el resto no tiene deuda a la que imputarse. Resolvelo a mano en el dashboard.`
      await cerrar('ERROR', { error: msg })
      return NextResponse.json({ error: msg, entra: reparto.imputado }, { status: 409 })
    }

    // ── 4. Un pago por renglón, por la misma puerta que usa el dashboard ─────────────────
    const creados: { pago_id: string | null; gasto_id: string; concepto: string; mes: string; monto: number }[] = []
    for (const r of reparto.renglones) {
      try {
        const pagoId = await crearPagoEnLedger(sb, {
          tipo_origen: 'GASTO',
          origen_id: r.gastoId,
          monto: r.monto,
          moneda: 'ARS',
          fecha_emision: datos.fecha,
          instrumento: datos.instrumento,
          // La plata no salió de una cuenta nuestra: la transfirió el cliente.
          cuenta_id: null,
          notas: datos.notas ?? null,
          pagador_cliente_id: datos.pagador.cliente_id ?? null,
          pagador_nombre: datos.pagador.nombre,
          operacion_id: datos.operacion_id,
        })
        creados.push({ pago_id: pagoId, gasto_id: r.gastoId, concepto: r.concepto, mes: r.mes, monto: r.monto })
      } catch (e) {
        // Se corta acá: los renglones ya escritos son pagos reales y quedan. La fila de la
        // operación dice hasta dónde llegó, así que el reintento no los vuelve a escribir y
        // alguien puede terminarlo a mano sabiendo exactamente qué falta.
        const detalle = e instanceof Error ? e.message : String(e)
        const msg = `Se registraron ${creados.length} de ${reparto.renglones.length} renglones y se cortó: ${detalle}`
        await cerrar('ERROR', { error: msg, resultado: { pagos: creados } })
        return NextResponse.json({ error: msg, pagos: creados }, { status: 409 })
      }
    }

    const resultado = { operacion_id: datos.operacion_id, pagos: creados, imputado: reparto.imputado }
    await cerrar('OK', { resultado })
    return NextResponse.json(resultado)
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: detalle }, { status: 500 })
  }
}
