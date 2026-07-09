import { createClient } from '@/lib/supabase/server'
import { ComisionesClient } from '@/components/settings/comisiones-client'
import type { ComisionMedioPago } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function ComisionesPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('comision_medio_pago').select('*').order('medio')
  return <ComisionesClient medios={(data ?? []) as ComisionMedioPago[]} />
}
