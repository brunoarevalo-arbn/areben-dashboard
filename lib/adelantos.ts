import 'server-only'
import { crearPagoEnLedger, recomputarOrigen, type ClienteLedger } from '@/lib/ledger/pagos'
import { planAdelantos, type Adelanto } from '@/lib/calc/adelantos'

// Adelantos de sueldo: el puente entre el Monitor (donde se anotan) y la nómina (donde se aplican).
//
// 🔑 **La dirección es al revés que la de los acreedores.** Allá el Monitor le escribe al dashboard
// cuando confirma. Acá el dashboard le PREGUNTA al Monitor qué adelantos hay, recién cuando existe
// una nómina donde colgarlos — antes de liquidar no se escribe nada (Darío, 28-sep-2026: liquidan
// el día 1 y pasar pagos antes "sería un quilombo de pagos"). La llave es la misma de siempre
// (`PUENTE_SECRET`), sólo que viaja para el otro lado.
//
// ⛔ **Nada de esto puede frenar una liquidación.** Si el Monitor no contesta, la nómina se guarda
// igual y los adelantos quedan pendientes: se engancharán la próxima vez que se toque la nómina de
// ese empleado, o cuando el Monitor confirme otro adelanto. Por eso todo devuelve un aviso en vez
// de tirar un error.
//
// Se llama desde las TRES entradas que crean o cambian una nómina —la individual, la masiva y la
// edición— y desde el borrado. Son cuatro caminos a propósito con una sola función: dos formularios
// que hacen lo mismo es exactamente lo que ya fabricó bugs de plata en este circuito.

const URL_MONITOR =
  process.env.MONITOR_ADELANTOS_URL || 'https://monitorareben.vercel.app/api/datos?recurso=adelantos-puente'
const TIMEOUT_MS = 8000

export type ResultadoAdelantos = {
  aplicados: number
  montoAplicado: number
  pendiente: number
  aviso: string | null
}

const SIN_NADA: ResultadoAdelantos = { aplicados: 0, montoAplicado: 0, pendiente: 0, aviso: null }

/** Los adelantos confirmados de un empleado, según el Monitor. `null` si no se pudo preguntar. */
async function leerAdelantosDelMonitor(empleadoId: string): Promise<{ adelantos: Adelanto[] } | { aviso: string }> {
  const secreto = process.env.PUENTE_SECRET
  if (!secreto) return { aviso: 'Falta PUENTE_SECRET: no se pudieron revisar los adelantos del Monitor.' }

  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(`${URL_MONITOR}&empleado_id=${encodeURIComponent(empleadoId)}`, {
      headers: { 'x-puente-auth': secreto },
      signal: corte.signal,
      cache: 'no-store',
    })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d || !Array.isArray(d.adelantos)) {
      return { aviso: `El Monitor no contestó bien (${r.status}): los adelantos quedan pendientes.` }
    }
    return { adelantos: d.adelantos as Adelanto[] }
  } catch (e) {
    const msg = (e as Error)?.name === 'AbortError' ? 'el Monitor tardó demasiado' : (e as Error).message
    return { aviso: `No se pudieron revisar los adelantos (${msg}). Quedan pendientes.` }
  } finally {
    clearTimeout(reloj)
  }
}

async function ultimoMesCerrado(sb: ClienteLedger): Promise<string | null> {
  const { data } = await sb
    .from('cierres_mensuales')
    .select('mes')
    .eq('cerrado', true)
    .order('mes', { ascending: false })
    .limit(1)
  return data?.[0]?.mes ?? null
}

/**
 * Engancha a las nóminas de un empleado los adelantos que todavía no entraron.
 *
 * Idempotente: lo aplicado se cuenta de los pagos que ya existen, así que llamarla dos veces no
 * duplica nada. Nunca tira: si algo falla, devuelve el aviso.
 */
export async function aplicarAdelantosDeEmpleado(
  sb: ClienteLedger,
  empleadoId: string,
  /** Si el llamador ya los tiene (el Monitor los manda al confirmar), no se le vuelve a preguntar. */
  adelantosDados?: Adelanto[],
): Promise<ResultadoAdelantos> {
  try {
    let adelantos = adelantosDados
    if (!adelantos) {
      const leido = await leerAdelantosDelMonitor(empleadoId)
      if ('aviso' in leido) return { ...SIN_NADA, aviso: leido.aviso }
      adelantos = leido.adelantos
    }
    if (!adelantos.length) return SIN_NADA

    const { data: nominas, error: eNom } = await sb
      .from('nomina_mensual')
      .select('id, mes, neto')
      .eq('empleado_id', empleadoId)
    if (eNom) return { ...SIN_NADA, aviso: `No se pudieron leer las nóminas: ${eNom.message}` }

    const ids = (nominas ?? []).map((n: { id: string }) => n.id)
    const { data: pagosNomina } = ids.length
      ? await sb.from('pagos').select('origen_id, monto').eq('tipo_origen', 'NOMINA').in('origen_id', ids)
      : { data: [] }
    const { data: pagosAdelanto } = await sb
      .from('pagos')
      .select('adelanto_id, monto')
      .in('adelanto_id', adelantos.map((a) => a.id))

    const pagadoPorNomina = new Map<string, number>()
    for (const p of (pagosNomina ?? []) as { origen_id: string; monto: number | string }[]) {
      pagadoPorNomina.set(p.origen_id, (pagadoPorNomina.get(p.origen_id) ?? 0) + Number(p.monto))
    }

    const plan = planAdelantos(
      adelantos,
      ((nominas ?? []) as { id: string; mes: string; neto: number | string }[]).map((n) => ({
        id: n.id,
        mes: n.mes,
        neto: Number(n.neto),
        pagado: pagadoPorNomina.get(n.id) ?? 0,
      })),
      ((pagosAdelanto ?? []) as { adelanto_id: string; monto: number | string }[]).map((p) => ({
        adelanto_id: p.adelanto_id,
        monto: Number(p.monto),
      })),
      await ultimoMesCerrado(sb),
    )

    let aplicados = 0
    let montoAplicado = 0
    for (const e of plan.enganches) {
      await crearPagoEnLedger(sb, {
        tipo_origen: 'NOMINA',
        origen_id: e.nominaId,
        monto: e.monto,
        moneda: 'ARS',
        fecha_emision: e.adelanto.fecha,
        instrumento: 'TRANSFERENCIA',
        // La plata no salió de una cuenta nuestra: la transfirió el cliente al empleado.
        cuenta_id: null,
        notas: `Adelanto: transferencia de ${e.adelanto.cliente_nombre}`,
        pagador_cliente_id: e.adelanto.cliente_id,
        pagador_nombre: e.adelanto.cliente_nombre,
        adelanto_id: e.adelanto.id,
      })
      aplicados++
      montoAplicado += e.monto
    }

    const pendiente = plan.pendientes.reduce((s, p) => s + p.restante, 0)
    const bloqueado = plan.bloqueados.reduce((s, p) => s + p.restante, 0)
    return {
      aplicados,
      montoAplicado: Math.round(montoAplicado * 100) / 100,
      pendiente: Math.round(pendiente * 100) / 100,
      aviso: bloqueado > 0.005
        ? `Hay $${bloqueado.toFixed(2)} de adelantos con fecha en un mes ya cerrado: no se pueden enganchar solos.`
        : null,
    }
  } catch (e) {
    return { ...SIN_NADA, aviso: `Los adelantos no se pudieron enganchar: ${(e as Error).message}` }
  }
}

/**
 * Suelta los adelantos de una nómina: borra sus pagos de adelanto y recalcula su estado. Como lo
 * aplicado se cuenta de esos pagos, el adelanto vuelve solo a pendiente en el Monitor.
 *
 * Se usa antes de BORRAR una nómina (si no, sus pagos quedarían huérfanos) y antes de EDITARLA
 * (para volver a engancharlos contra el neto nuevo: si bajó, lo que sobra pasa al mes siguiente).
 */
export async function soltarAdelantosDeNomina(sb: ClienteLedger, nominaId: string): Promise<number> {
  const { data } = await sb
    .from('pagos')
    .delete()
    .eq('tipo_origen', 'NOMINA')
    .eq('origen_id', nominaId)
    .not('adelanto_id', 'is', null)
    .select('id')
  const soltados = (data ?? []).length
  if (soltados) await recomputarOrigen(sb, 'NOMINA', nominaId)
  return soltados
}
