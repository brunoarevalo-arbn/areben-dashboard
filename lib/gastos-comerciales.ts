import 'server-only'
import { leerGastosComerciales, type GastosComerciales } from '@/lib/calc/gastos-comerciales'

// Los gastos comerciales de un mes, según el ERP del Monitor. Misma llave que los adelantos (`PUENTE_SECRET`).
// ⛔ Nunca frena el cierre: si el Monitor no contesta, la sección dice que no pudo preguntar (no muestra ceros).
const URL_MONITOR =
  process.env.MONITOR_GASTOS_URL || 'https://monitorareben.vercel.app/api/datos?recurso=gastos-puente'
const TIMEOUT_MS = 8000
const MARCAS_DEL_MONITOR = { BDI: 'bdi', ZATTIA: 'zattia' } as const // Zattia ya suma a Stunned

export type GastosDelMes = { marca: GastosComerciales['marca']; datos: GastosComerciales | null; aviso: string | null }

export async function gastosComercialesDelMes(marca: GastosComerciales['marca'], desde: string, hasta: string): Promise<GastosDelMes> {
  const secreto = process.env.PUENTE_SECRET
  if (!secreto) return { marca, datos: null, aviso: 'Falta PUENTE_SECRET: no se pudo preguntar al Monitor.' }
  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(`${URL_MONITOR}&marca=${MARCAS_DEL_MONITOR[marca]}&desde=${desde}&hasta=${hasta}`, {
      headers: { 'x-puente-auth': secreto }, signal: corte.signal, cache: 'no-store',
    })
    const d = await r.json().catch(() => null)
    const datos = r.ok ? leerGastosComerciales(marca, d) : null
    return datos ? { marca, datos, aviso: null } : { marca, datos: null, aviso: `El Monitor no contestó bien (${r.status}).` }
  } catch (e) {
    const msg = (e as Error)?.name === 'AbortError' ? 'el Monitor tardó demasiado' : (e as Error).message
    return { marca, datos: null, aviso: `No se pudo preguntar al Monitor (${msg}).` }
  } finally {
    clearTimeout(reloj)
  }
}
