import { createClient } from '@/lib/supabase/server'
import { InversoresClient } from '@/components/inversiones/inversores-client'

export default async function InversionesPage() {
  const supabase = await createClient()
  const [{ data: inversores }, { data: instrumentos }, { data: periodos }] = await Promise.all([
    supabase.from('inversores').select('*').order('nombre'),
    supabase.from('instrumentos_inversion').select('*').order('created_at', { ascending: false }),
    supabase.from('periodos_instrumento').select('instrumento_id, saldo_cierre, mes').order('mes', { ascending: false }),
  ])

  return (
    <InversoresClient
      inversores={inversores ?? []}
      instrumentos={instrumentos ?? []}
      periodos={periodos ?? []}
    />
  )
}
