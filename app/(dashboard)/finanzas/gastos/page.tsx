import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { GastosClient } from '@/components/finanzas/gastos-client'

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; negocio?: string; estado?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? getCurrentMonth()

  const supabase = await createClient()

  let query = supabase
    .from('gastos')
    .select('*')
    .eq('mes', mes)
    .order('created_at', { ascending: false })

  if (params.negocio) query = query.eq('negocio', params.negocio)
  if (params.estado) query = query.eq('estado', params.estado)

  const { data: gastos } = await query

  const { data: categorias } = await supabase
    .from('gastos')
    .select('categoria')
    .order('categoria')

  const uniqueCategorias = [...new Set(categorias?.map((c) => c.categoria) ?? [])]

  return (
    <GastosClient
      gastos={gastos ?? []}
      mes={mes}
      categorias={uniqueCategorias}
      filtros={{ negocio: params.negocio, estado: params.estado }}
    />
  )
}
