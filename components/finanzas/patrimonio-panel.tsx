import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { CuentasPatrimonialesClient } from '@/components/finanzas/cuentas-patrimoniales-client'

// Panel "Por tipo" del módulo Patrimonio (todas las cuentas patrimoniales).
export async function PatrimonioPanel({ mes: mesParam }: { mes?: string }) {
  const mes = mesParam ?? (await getMesActivo())
  const supabase = await createClient()

  const [{ data: cuentas }, { data: saldos }, { data: socios }] = await Promise.all([
    supabase.from('cuentas_patrimoniales').select('*').order('orden').order('nombre'),
    supabase.from('saldos_cuentas_patrim').select('*').eq('mes', mes),
    supabase.from('socios').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  return <CuentasPatrimonialesClient mes={mes} cuentas={cuentas ?? []} saldos={saldos ?? []} socios={socios ?? []} />
}
