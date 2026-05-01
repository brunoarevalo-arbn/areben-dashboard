import { createClient } from '@/lib/supabase/server'
import { RetirosClient } from '@/components/finanzas/retiros-client'

export default async function RetirosPage() {
  const supabase = await createClient()
  const { data: retiros } = await supabase
    .from('retiros_socios')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(100)

  const socios = [...new Set(retiros?.map((r) => r.socio) ?? [])]

  return <RetirosClient retiros={retiros ?? []} socios={socios} />
}
