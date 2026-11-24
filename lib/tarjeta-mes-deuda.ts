import type { createClient } from '@/lib/supabase/server'
import { mesDeudaCuota } from '@/lib/calc/tarjeta'

type Supa = Awaited<ReturnType<typeof createClient>>

type CuotaBase = {
  mes_cierre: string
  cuota_numero: number | null
  origen_tipo: string | null
  origen_id: string | null
}

/**
 * Fecha del consumo de cada cuota, sacada de donde se cargó (la misma que se usó para generarla):
 * gasto → fecha_pago (o el 1° de su mes) · compra → fecha · movimiento de cuenta corriente → fecha ·
 * retiro (MANUAL / RETIRO / RETIRO_SOCIO con origen) → fecha. Sin origen → sin fecha.
 */
async function fechasDeConsumo(supabase: Supa, cuotas: CuotaBase[]): Promise<Map<string, string>> {
  const ids = (tipos: string[]) =>
    [...new Set(cuotas.filter((c) => c.origen_id && tipos.includes(c.origen_tipo ?? '')).map((c) => c.origen_id as string))]
  const fechas = new Map<string, string>() // clave: `${tipo}:${id}`

  async function leer(tabla: string, cols: string, lista: string[], clave: string, fecha: (r: Record<string, string | null>) => string | null) {
    for (let i = 0; i < lista.length; i += 200) {
      const { data } = await supabase.from(tabla).select(cols).in('id', lista.slice(i, i + 200))
      for (const r of (data ?? []) as unknown as Record<string, string | null>[]) {
        const f = fecha(r)
        if (f) fechas.set(`${clave}:${r.id}`, f)
      }
    }
  }

  await Promise.all([
    leer('gastos', 'id, fecha_pago, mes', ids(['GASTO']), 'GASTO', (r) => r.fecha_pago || (r.mes ? `${r.mes}-01` : null)),
    leer('compras', 'id, fecha', ids(['COMPRA']), 'COMPRA', (r) => r.fecha),
    leer('cc_movimientos', 'id, fecha', ids(['CC_MOVIMIENTO']), 'CC_MOVIMIENTO', (r) => r.fecha),
    leer('retiros_socios', 'id, fecha', ids(['MANUAL', 'RETIRO', 'RETIRO_SOCIO']), 'RETIRO', (r) => r.fecha),
  ])

  const out = new Map<string, string>()
  for (const c of cuotas) {
    if (!c.origen_id) continue
    const clave = ['MANUAL', 'RETIRO', 'RETIRO_SOCIO'].includes(c.origen_tipo ?? '') ? 'RETIRO' : c.origen_tipo
    const f = fechas.get(`${clave}:${c.origen_id}`)
    if (f) out.set(`${c.origen_tipo}:${c.origen_id}`, f)
  }
  return out
}

/**
 * Deja sólo las cuotas que son deuda del mes del cierre: las que se consumieron hasta ese mes
 * (cuota 1 en el mes del consumo, la 2 al mes siguiente, …). Las cuotas tienen que venir ya
 * filtradas por "no pagada al corte".
 */
export async function cuotasDeudaDelMes<T extends CuotaBase>(supabase: Supa, cuotas: T[], mes: string): Promise<(T & { fecha_consumo: string | null })[]> {
  const fechas = await fechasDeConsumo(supabase, cuotas)
  return cuotas
    .map((c) => ({ ...c, fecha_consumo: (c.origen_id ? fechas.get(`${c.origen_tipo}:${c.origen_id}`) : null) ?? null }))
    .filter((c) => mesDeudaCuota({ mes_cierre: c.mes_cierre, cuota_numero: c.cuota_numero ?? 1 }, c.fecha_consumo) <= mes)
}
