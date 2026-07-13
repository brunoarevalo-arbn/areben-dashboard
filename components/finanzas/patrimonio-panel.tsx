import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { sintetizarSaldosPatrim } from '@/app/actions/composicion-cierre'
import { CuentasPatrimonialesClient } from '@/components/finanzas/cuentas-patrimoniales-client'
import type { CuentaPatrimonial, SaldoCuentaPatrim } from '@/types/database'

// Panel "Por tipo" del módulo Patrimonio (todas las cuentas patrimoniales).
export async function PatrimonioPanel({ mes: mesParam }: { mes?: string }) {
  const mes = mesParam ?? (await getMesActivo())
  const supabase = await createClient()

  const [{ data: cuentas }, { data: saldos }, { data: socios }] = await Promise.all([
    supabase.from('cuentas_patrimoniales').select('*').order('orden').order('nombre'),
    supabase.from('saldos_cuentas_patrim').select('*').eq('mes', mes),
    supabase.from('socios').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  // Sintetizar los saldos de las cuentas que no se cargan a mano (inventario, socios, inversión),
  // así la lista muestra el saldo real y no 0 (mismo cálculo que el cierre).
  const { saldosPatrimFinal } = await sintetizarSaldosPatrim(
    (cuentas ?? []) as CuentaPatrimonial[],
    (saldos ?? []) as SaldoCuentaPatrim[],
    mes,
  )

  return <CuentasPatrimonialesClient mes={mes} cuentas={cuentas ?? []} saldos={saldosPatrimFinal} socios={socios ?? []} />
}
