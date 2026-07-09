import { createClient } from '@/lib/supabase/server'
import { CuentasCobroClient } from '@/components/settings/cuentas-cobro-client'
import type { CuentaCobroGN } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function CuentasCobroPage() {
  const supabase = await createClient()
  const [{ data }, { data: origenRows }] = await Promise.all([
    supabase.from('cuentas_cobro_gn').select('*').order('tipo').order('nombre'),
    supabase.from('ventas_gn_agg').select('cuenta_cobro, cuenta_gn'),
  ])

  // Origen: en qué cuenta(s) GN aparece cada cuenta de cobro
  const origenPorCuenta: Record<string, string[]> = {}
  for (const r of origenRows ?? []) {
    const arr = (origenPorCuenta[r.cuenta_cobro] ??= [])
    if (!arr.includes(r.cuenta_gn)) arr.push(r.cuenta_gn)
  }
  for (const k in origenPorCuenta) origenPorCuenta[k].sort()

  return <CuentasCobroClient cuentas={(data ?? []) as CuentaCobroGN[]} origenPorCuenta={origenPorCuenta} />
}
