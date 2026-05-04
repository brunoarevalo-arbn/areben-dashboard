import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { GastosFinancierosClient } from '@/components/inversiones/gastos-financieros-client'

export default async function GastosFinancierosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? getCurrentMonth()
  const supabase = await createClient()

  const { data: periodos } = await supabase
    .from('periodos_instrumento')
    .select('*, instrumento:instrumentos_inversion(*, inversor:inversores(nombre))')
    .order('mes', { ascending: false })
    .limit(1000)

  return <GastosFinancierosClient mes={mes} periodos={periodos ?? []} />
}
