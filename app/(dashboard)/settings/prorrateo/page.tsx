import { createClient } from '@/lib/supabase/server'
import { ProrrateoSettingsClient } from '@/components/settings/prorrateo-client'

export default async function ProrrateoSettingsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('configuracion_prorrateo')
    .select('*')
    .order('orden')

  return <ProrrateoSettingsClient configs={data ?? []} />
}
