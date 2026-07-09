import { createClient } from '@/lib/supabase/server'
import { CuentasCobroClient } from '@/components/settings/cuentas-cobro-client'
import type { CuentaCobroGN } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function CuentasCobroPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('cuentas_cobro_gn')
    .select('*')
    .order('tipo')
    .order('nombre')

  return <CuentasCobroClient cuentas={(data ?? []) as CuentaCobroGN[]} />
}
