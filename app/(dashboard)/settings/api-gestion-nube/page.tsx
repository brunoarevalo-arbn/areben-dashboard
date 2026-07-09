import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { GestionNubeClient } from '@/components/settings/gestion-nube-client'
import type { CuentaGN } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function ApiGNPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const mes = (await searchParams).mes ?? (await getMesActivo())
  const supabase = await createClient()
  const { data } = await supabase.from('cuentas_gn').select('*').order('alias')

  return <GestionNubeClient cuentas={(data ?? []) as CuentaGN[]} mes={mes} />
}
