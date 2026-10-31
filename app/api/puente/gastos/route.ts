import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verificarPuente } from '@/lib/puente-auth'
import { clienteDeServicio } from '@/lib/supabase/servicio'
import { crearPagoEnLedger } from '@/lib/ledger/pagos'
import { armarGastoErp, cuerpoGastoErp, type GastoErp } from '@/lib/puente-gastos'

// Puerta de servicio: un gasto del ERP que un Admin ya APROBÓ (ver `lib/puente-gastos.ts`).
//
//   POST /api/puente/gastos     header  x-puente-auth: <PUENTE_SECRET>
//     → { operacion_id, gasto_id, pago_id }     (repetida: true si ya había entrado)
//
// 🔑 Idempotencia por `operacion_id` (= el id del gasto en el ERP), con el mismo candado que `puente/pagos`
// (`puente_operaciones`, migración 081). Aprobar dos veces —el botón apretado dos veces, un reintento sin señal— carga
// UN gasto. A diferencia de los pagos, si algo falla ANTES de dejar un peso escrito el candado se SUELTA: no quedó nada
// a medias y el Admin tiene que poder volver a aprobar.

export const dynamic = 'force-dynamic'

/** Sin esto, un gasto con fecha vieja entraría a un mes ya cerrado y descuadraría el cierre. */
async function mesCerradoMasReciente(sb: ReturnType<typeof clienteDeServicio>): Promise<string | null> {
  const { data } = await sb.from('cierres_mensuales').select('mes').eq('cerrado', true).order('mes', { ascending: false }).limit(1)
  return data?.[0]?.mes ?? null
}

export async function POST(request: Request) {
  const sobre = verificarPuente(request)
  if (!sobre.ok) return NextResponse.json({ error: sobre.error }, { status: sobre.status })

  let datos: GastoErp
  try {
    datos = cuerpoGastoErp.parse(await request.json())
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0].message : 'El pedido no se entiende.'
    return NextResponse.json({ error: detalle }, { status: 400 })
  }

  const sb = clienteDeServicio()
  try {
    // ── 1. El mes cerrado: antes del candado, para que no lo consuma ─────────────────────
    const ultimoCerrado = await mesCerradoMasReciente(sb)
    const mes = datos.fecha.substring(0, 7)
    if (ultimoCerrado && mes <= ultimoCerrado) {
      return NextResponse.json(
        { error: `El mes ${mes} ya está cerrado en el dashboard (el último cerrado es ${ultimoCerrado}): cargalo a mano después de reabrirlo.` },
        { status: 409 },
      )
    }

    // ── 2. El candado ────────────────────────────────────────────────────────────────────
    const { error: eLock } = await sb.from('puente_operaciones').insert({
      operacion_id: datos.operacion_id,
      recurso: 'gasto-erp',
      pedido: datos,
      pedido_por: datos.aprobado_por ?? null,
      estado: 'EN_CURSO',
    })
    if (eLock) {
      if (eLock.code !== '23505') return NextResponse.json({ error: eLock.message }, { status: 502 })
      const { data: previa } = await sb.from('puente_operaciones').select('estado, resultado, error').eq('operacion_id', datos.operacion_id).single()
      if (previa?.estado === 'OK') return NextResponse.json({ repetida: true, ...(previa.resultado as object) })
      if (previa?.estado === 'EN_CURSO') {
        return NextResponse.json({ error: 'Ese gasto se está cargando ahora mismo. Esperá unos segundos y mirá si quedó.' }, { status: 409 })
      }
      return NextResponse.json({ error: `Ese gasto ya se intentó cargar y se cortó a mitad: ${previa?.error ?? 'sin detalle'}. Miralo a mano en el dashboard.` }, { status: 409 })
    }
    const cerrar = (estado: 'OK' | 'ERROR', extra: Record<string, unknown>) =>
      sb.from('puente_operaciones').update({ estado, ...extra, cerrado_at: new Date().toISOString() }).eq('operacion_id', datos.operacion_id)
    const soltar = () => sb.from('puente_operaciones').delete().eq('operacion_id', datos.operacion_id)

    // ── 3. El gasto ──────────────────────────────────────────────────────────────────────
    const { gasto, pago } = armarGastoErp(datos)
    const { data: fila, error: eGasto } = await sb.from('gastos').insert(gasto).select('id').single()
    if (eGasto || !fila) {
      await soltar()
      return NextResponse.json({ error: eGasto?.message ?? 'No se pudo crear el gasto.' }, { status: 502 })
    }

    // ── 4. La caja chica ya se pagó: su pago en efectivo, por el mismo ledger que el dashboard ─
    let pagoId: string | null = null
    if (pago) {
      try {
        pagoId = (await crearPagoEnLedger(sb, { tipo_origen: 'GASTO', origen_id: fila.id, moneda: 'ARS', cuenta_id: null, operacion_id: datos.operacion_id, ...pago })) ?? null
      } catch (e) {
        // Sin el pago, el gasto quedaría PENDIENTE y pediría pagarse otra vez: se borra y se suelta el candado.
        await sb.from('gastos').delete().eq('id', fila.id)
        await soltar()
        return NextResponse.json({ error: `No se pudo registrar el pago en efectivo: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 })
      }
    }

    const resultado = { operacion_id: datos.operacion_id, gasto_id: fila.id, pago_id: pagoId }
    await cerrar('OK', { resultado })
    return NextResponse.json(resultado)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
