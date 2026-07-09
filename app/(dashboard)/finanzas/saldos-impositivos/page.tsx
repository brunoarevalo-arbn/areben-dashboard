import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { SaldosImpositivosClient } from '@/components/finanzas/saldos-impositivos-client'

export default async function SaldosImpositivosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? await getMesActivo()
  const supabase = await createClient()

  const [{ data: cuentas }, { data: saldos }] = await Promise.all([
    supabase
      .from('cuentas_patrimoniales')
      .select('*')
      .eq('tipo', 'IMPOSITIVO')
      .order('orden')
      .order('nombre'),
    supabase.from('saldos_cuentas_patrim').select('*').eq('mes', mes),
  ])

  return (
    <SaldosImpositivosClient
      mes={mes}
      cuentas={cuentas ?? []}
      saldos={saldos ?? []}
    />
  )
}
