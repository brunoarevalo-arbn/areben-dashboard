import type { createClient } from '@/lib/supabase/server'

type Supa = Awaited<ReturnType<typeof createClient>>

export type PagoDeGasto = {
  id: string
  monto: number
  fecha_emision: string | null
  debitado: boolean
  fecha_vencimiento: string | null
  /** true si el pago se imputó a la nómina, no al gasto espejo */
  via_nomina: boolean
}

/**
 * El gasto-sueldo es un ESPEJO de la nómina: la deuda vive en `nomina_mensual` y los
 * pagos se imputan con tipo_origen=NOMINA (ver resolverOrigenDeGasto). Leer sólo
 * tipo_origen=GASTO deja al gasto mostrando el total aunque ya se hayan pagado
 * adelantos — que es exactamente el desfasaje que tenía Pendientes contra Nómina.
 *
 * Este helper es el ÚNICO lugar donde se resuelve "cuánto se pagó de este gasto".
 *
 * @param hasta  Si viene, sólo cuenta pagos con fecha_emision <= hasta (lo usa el cierre).
 */
export async function pagosDeGastos(
  supabase: Supa,
  gastoIds: string[],
  opts?: { hasta?: string }
): Promise<Map<string, PagoDeGasto[]>> {
  const out = new Map<string, PagoDeGasto[]>()
  const ids = gastoIds.filter(Boolean)
  if (ids.length === 0) return out

  const push = (gastoId: string, p: PagoDeGasto) => {
    const arr = out.get(gastoId) ?? []
    arr.push(p)
    out.set(gastoId, arr)
  }

  // (a) Pagos imputados directo al gasto
  let qGasto = supabase
    .from('pagos')
    .select('id, origen_id, monto, fecha_emision, debitado, fecha_vencimiento')
    .eq('tipo_origen', 'GASTO')
    .in('origen_id', ids)
  if (opts?.hasta) qGasto = qGasto.lte('fecha_emision', opts.hasta)
  const { data: pagosGasto } = await qGasto
  for (const p of pagosGasto ?? []) {
    if (!p.origen_id) continue
    push(p.origen_id, {
      id: p.id,
      monto: Number(p.monto),
      fecha_emision: p.fecha_emision ?? null,
      debitado: !!p.debitado,
      fecha_vencimiento: p.fecha_vencimiento ? String(p.fecha_vencimiento).slice(0, 10) : null,
      via_nomina: false,
    })
  }

  // (b) Pagos imputados a la nómina vinculada → cuentan contra su gasto espejo
  const { data: nominas } = await supabase
    .from('nomina_mensual')
    .select('id, gasto_pendiente_id')
    .in('gasto_pendiente_id', ids)
  const gastoPorNomina = new Map<string, string>()
  for (const n of nominas ?? []) {
    if (n.gasto_pendiente_id) gastoPorNomina.set(n.id, n.gasto_pendiente_id)
  }
  if (gastoPorNomina.size > 0) {
    let qNomina = supabase
      .from('pagos')
      .select('id, origen_id, monto, fecha_emision, debitado, fecha_vencimiento')
      .eq('tipo_origen', 'NOMINA')
      .in('origen_id', Array.from(gastoPorNomina.keys()))
    if (opts?.hasta) qNomina = qNomina.lte('fecha_emision', opts.hasta)
    const { data: pagosNomina } = await qNomina
    for (const p of pagosNomina ?? []) {
      if (!p.origen_id) continue
      const gastoId = gastoPorNomina.get(p.origen_id)
      if (!gastoId) continue
      push(gastoId, {
        id: p.id,
        monto: Number(p.monto),
        fecha_emision: p.fecha_emision ?? null,
        debitado: !!p.debitado,
        fecha_vencimiento: p.fecha_vencimiento ? String(p.fecha_vencimiento).slice(0, 10) : null,
        via_nomina: true,
      })
    }
  }

  return out
}

/** Igual que pagosDeGastos pero devolviendo sólo el total pagado por gasto. */
export async function totalPagadoPorGasto(
  supabase: Supa,
  gastoIds: string[],
  opts?: { hasta?: string }
): Promise<Map<string, number>> {
  const detalle = await pagosDeGastos(supabase, gastoIds, opts)
  const totales = new Map<string, number>()
  for (const [gastoId, pagos] of detalle) {
    totales.set(gastoId, pagos.reduce((s, p) => s + p.monto, 0))
  }
  return totales
}

/**
 * Un gasto-sueldo no es dueño de su deuda: la dueña es la nómina. Todo pago contra
 * él se imputa a la nómina, así una sola plata la ven las dos pantallas y el saldo
 * no se calcula dos veces contra dos totales distintos.
 *
 * Devuelve a qué origen hay que imputar el pago y cuál es la deuda total de ese origen.
 */
export async function resolverOrigenDeGasto(
  supabase: Supa,
  gastoId: string
): Promise<{ tipo_origen: 'GASTO' | 'NOMINA'; origen_id: string; total_deuda: number }> {
  const { data: nomina } = await supabase
    .from('nomina_mensual')
    .select('id, neto')
    .eq('gasto_pendiente_id', gastoId)
    .maybeSingle()
  if (nomina) {
    return { tipo_origen: 'NOMINA', origen_id: nomina.id, total_deuda: Number(nomina.neto) }
  }
  const { data: gasto } = await supabase.from('gastos').select('monto').eq('id', gastoId).single()
  return { tipo_origen: 'GASTO', origen_id: gastoId, total_deuda: Number(gasto?.monto ?? 0) }
}

/** Total pagado (ledger unificado) por nómina. */
export async function totalPagadoPorNomina(
  supabase: Supa,
  nominaIds: string[]
): Promise<Map<string, number>> {
  const totales = new Map<string, number>()
  const ids = nominaIds.filter(Boolean)
  if (ids.length === 0) return totales
  const { data } = await supabase
    .from('pagos')
    .select('origen_id, monto')
    .eq('tipo_origen', 'NOMINA')
    .in('origen_id', ids)
  for (const p of data ?? []) {
    if (!p.origen_id) continue
    totales.set(p.origen_id, (totales.get(p.origen_id) ?? 0) + Number(p.monto))
  }
  return totales
}
