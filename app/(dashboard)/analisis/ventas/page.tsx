import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { VentasClient } from '@/components/analisis/ventas-client'

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? getCurrentMonth()

  const supabase = await createClient()
  const { data: ventas } = await supabase
    .from('datos_ventas_gn')
    .select('*')
    .eq('mes', mes)
    .order('marca')

  return <VentasClient ventas={ventas ?? []} mes={mes} />
}
