import { createClient } from '@/lib/supabase/server'
import { PLMarcaClient } from '@/components/analisis/pl-marca-client'
import { getCurrentMonth } from '@/lib/utils'

export default async function PLMarcaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? getCurrentMonth()

  const supabase = await createClient()

  const [{ data: ventas }, { data: gastos }] = await Promise.all([
    supabase.from('datos_ventas_gn').select('*').eq('mes', mes),
    supabase.from('gastos').select('negocio, monto, estado').eq('mes', mes).neq('negocio', 'GENERAL'),
  ])

  return <PLMarcaClient ventas={ventas ?? []} gastos={gastos ?? []} mes={mes} />
}
