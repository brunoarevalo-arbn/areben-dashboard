import { createClient } from '@/lib/supabase/server'
import { AnaliticaGNClient, type AggRow } from '@/components/analisis/analitica-gn-client'

export const dynamic = 'force-dynamic'

export default async function AnaliticaGNPage() {
  const supabase = await createClient()
  const [{ data: rows }, { data: cc }] = await Promise.all([
    supabase.from('ventas_gn_agg').select('*').order('mes', { ascending: false }),
    supabase.from('cuentas_cobro_gn').select('nombre, tipo'),
  ])
  const tipoPorCuenta: Record<string, string> = {}
  for (const c of cc ?? []) tipoPorCuenta[c.nombre] = c.tipo

  return <AnaliticaGNClient rows={(rows ?? []) as AggRow[]} tipoPorCuenta={tipoPorCuenta} />
}
