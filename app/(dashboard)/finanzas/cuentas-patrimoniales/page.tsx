import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { CuentasPatrimonialesClient } from '@/components/finanzas/cuentas-patrimoniales-client'

export default async function CuentasPatrimPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? await getMesActivo()
  const supabase = await createClient()

  const [{ data: cuentas }, { data: saldos }] = await Promise.all([
    supabase.from('cuentas_patrimoniales').select('*').order('orden').order('nombre'),
    supabase.from('saldos_cuentas_patrim').select('*').eq('mes', mes),
  ])

  return (
    <CuentasPatrimonialesClient
      mes={mes}
      cuentas={cuentas ?? []}
      saldos={saldos ?? []}
    />
  )
}
