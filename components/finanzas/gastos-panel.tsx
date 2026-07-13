import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { GastosClient } from '@/components/finanzas/gastos-client'

// Panel "Del mes" del módulo Gastos (server component).
export async function GastosPanel({
  params,
}: {
  params: { mes?: string; negocio?: string; estado?: string }
}) {
  // Gastos comunes se cargan en el día → mes calendario actual
  const mes = params.mes ?? getCurrentMonth()
  const supabase = await createClient()

  let query = supabase
    .from('gastos')
    .select('*')
    .eq('mes', mes)
    .order('created_at', { ascending: false })

  if (params.negocio) query = query.eq('negocio', params.negocio)
  // VENCIDO es computado (por fecha, no por el estado en la base) → se filtra client-side.
  if (params.estado && params.estado !== 'VENCIDO') query = query.eq('estado', params.estado)

  const [{ data: gastos }, { data: categorias }, { data: cuentas }, { data: tarjetas }, { data: prorrateoDef }, { data: tiposIva }, { data: configProrrateo }, { data: recurrentes }] = await Promise.all([
    query,
    supabase.from('gastos').select('categoria').order('categoria'),
    supabase.from('cuentas_bancarias').select('id, nombre, banco, titular:cuentas_titulares(nombre)').eq('activo', true).order('banco'),
    supabase.from('tarjetas_credito').select('id, nombre, banco').eq('activo', true).order('banco'),
    supabase.from('prorrateos_default').select('*'),
    supabase.from('tipos_iva').select('*').eq('activo', true).order('orden'),
    supabase.from('configuracion_prorrateo').select('*').eq('activo', true).order('orden'),
    supabase.from('gastos_recurrentes').select('id, dia_vencimiento, tipo_mes'),
  ])

  const uniqueCategorias = [...new Set(categorias?.map((c) => c.categoria) ?? [])]

  return (
    <GastosClient
      gastos={gastos ?? []}
      mes={mes}
      categorias={uniqueCategorias}
      filtros={{ negocio: params.negocio, estado: params.estado }}
      cuentas={(cuentas ?? []) as unknown as Parameters<typeof GastosClient>[0]['cuentas']}
      tarjetas={tarjetas ?? []}
      prorrateosDefault={prorrateoDef ?? []}
      tiposIva={tiposIva ?? []}
      configProrrateo={configProrrateo ?? []}
      recurrentes={recurrentes ?? []}
      hoy={new Date().toISOString().slice(0, 10)}
    />
  )
}
