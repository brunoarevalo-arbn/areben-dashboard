import { createClient } from '@/lib/supabase/server'
import { PrestamosClient } from '@/components/inversiones/prestamos-client'

export default async function PrestamosPage() {
  const supabase = await createClient()

  const [{ data: instrumentos }, { data: periodos }] = await Promise.all([
    supabase
      .from('instrumentos_inversion')
      .select('*, inversor:inversores(*)')
      .order('fecha_inicio', { ascending: false }),
    supabase.from('periodos_instrumento').select('instrumento_id, saldo_cierre, mes').order('mes', { ascending: false }),
  ])

  return <PrestamosClient instrumentos={instrumentos ?? []} periodos={periodos ?? []} />
}
