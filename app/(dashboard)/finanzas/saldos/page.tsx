import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { SaldosClient } from '@/components/finanzas/saldos-client'

export default async function SaldosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? await getMesActivo()
  const supabase = await createClient()

  const [{ data: titulares }, { data: cuentas }, { data: saldos }, { data: tc }, { data: activosManuales }] = await Promise.all([
    supabase.from('cuentas_titulares').select('*').eq('activo', true).order('nombre'),
    supabase
      .from('cuentas_bancarias')
      .select('*, titular:cuentas_titulares(*)')
      .order('banco'),
    supabase.from('saldos_cuentas').select('*').eq('mes', mes),
    supabase.from('tipos_cambio_mes').select('*').eq('mes', mes).maybeSingle(),
    supabase
      .from('activos_manuales')
      .select('*, titular:cuentas_titulares(*)')
      .eq('mes', mes)
      .order('created_at'),
  ])

  return (
    <SaldosClient
      mes={mes}
      titulares={titulares ?? []}
      cuentas={cuentas ?? []}
      saldos={saldos ?? []}
      tipoCambio={tc}
      activosManuales={activosManuales ?? []}
    />
  )
}
