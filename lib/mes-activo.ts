import { createClient } from '@/lib/supabase/server'

/**
 * Devuelve el "mes activo de trabajo": el siguiente al último mes con cierre confirmado.
 * Si no hay cierres, usa el mes calendario actual − 1.
 *
 * Esto permite que el usuario, al entrar a la app a principios de mes,
 * vea el mes anterior por default (que es el que está cerrando) en vez del
 * mes calendario actual donde todavía no cargó nada.
 *
 * Una vez que confirma el cierre, automáticamente avanza al siguiente.
 */
export async function getMesActivo(): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('cierres_mensuales')
    .select('mes')
    .eq('cerrado', true)
    .order('mes', { ascending: false })
    .limit(1)
    .maybeSingle()

  const ahora = new Date()
  const mesCalendario = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`

  if (!data) {
    // Sin cierres → mes calendario − 1
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  // Hay cierre → siguiente al último cerrado, pero nunca futuro
  const [y, m] = data.mes.split('-').map(Number)
  const siguiente = new Date(y, m, 1) // m+1 porque setMonth usa 0-indexed
  const mesSiguiente = `${siguiente.getFullYear()}-${String(siguiente.getMonth() + 1).padStart(2, '0')}`

  // Si el siguiente al último cerrado ya pasó al futuro, usar el calendario actual
  return mesSiguiente > mesCalendario ? mesCalendario : mesSiguiente
}
