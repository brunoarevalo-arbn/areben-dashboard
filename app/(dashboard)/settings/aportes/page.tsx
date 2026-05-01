import { createClient } from '@/lib/supabase/server'
import { AportesClient } from '@/components/settings/aportes-client'

export default async function AportesPage() {
  const supabase = await createClient()
  const { data: aportes } = await supabase
    .from('configuracion_aportes')
    .select('*')
    .order('orden')

  return <AportesClient aportes={aportes ?? []} />
}
