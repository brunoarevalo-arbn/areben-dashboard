import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { SaldosImpositivosClient } from '@/components/finanzas/saldos-impositivos-client'

// Panel "Impositivos" del módulo Patrimonio (cuentas patrimoniales tipo IMPOSITIVO).
export async function SaldosImpositivosPanel({ mes: mesParam }: { mes?: string }) {
  const mes = mesParam ?? (await getMesActivo())
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

  return <SaldosImpositivosClient mes={mes} cuentas={cuentas ?? []} saldos={saldos ?? []} />
}
