import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { GastosClient } from '@/components/finanzas/gastos-client'

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; negocio?: string; estado?: string }>
}) {
  const params = await searchParams
  // Gastos comunes se cargan en el día → mes calendario actual
  const mes = params.mes ?? getCurrentMonth()

  const supabase = await createClient()

  let query = supabase
    .from('gastos')
    .select('*')
    .eq('mes', mes)
    .order('created_at', { ascending: false })

  if (params.negocio) query = query.eq('negocio', params.negocio)
  if (params.estado) query = query.eq('estado', params.estado)

  const [{ data: gastos }, { data: categorias }, { data: cuentas }, { data: tarjetas }, { data: prorrateoDef }, { data: tiposIva }, { data: configProrrateo }] = await Promise.all([
    query,
    supabase.from('gastos').select('categoria').order('categoria'),
    supabase.from('cuentas_bancarias').select('id, nombre, banco').eq('activo', true).order('banco'),
    supabase.from('tarjetas_credito').select('id, nombre, banco').eq('activo', true).order('banco'),
    supabase.from('prorrateos_default').select('*'),
    supabase.from('tipos_iva').select('*').eq('activo', true).order('orden'),
    supabase.from('configuracion_prorrateo').select('*').eq('activo', true).order('orden'),
  ])

  const uniqueCategorias = [...new Set(categorias?.map((c) => c.categoria) ?? [])]

  return (
    <GastosClient
      gastos={gastos ?? []}
      mes={mes}
      categorias={uniqueCategorias}
      filtros={{ negocio: params.negocio, estado: params.estado }}
      cuentas={cuentas ?? []}
      tarjetas={tarjetas ?? []}
      prorrateosDefault={prorrateoDef ?? []}
      tiposIva={tiposIva ?? []}
      configProrrateo={configProrrateo ?? []}
    />
  )
}
