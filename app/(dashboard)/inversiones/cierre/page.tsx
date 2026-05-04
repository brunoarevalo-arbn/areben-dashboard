import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { CierreMensualClient } from '@/components/inversiones/cierre-mensual-client'

export default async function CierrePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? getCurrentMonth()
  const supabase = await createClient()

  const [{ data: periodos }, { data: instrumentos }, { data: inversores }, { data: todosPeriodos }] = await Promise.all([
    supabase
      .from('periodos_instrumento')
      .select('*, instrumento:instrumentos_inversion(*, inversor:inversores(*))')
      .eq('mes', mes)
      .order('created_at'),
    supabase.from('instrumentos_inversion').select('*'),
    supabase.from('inversores').select('*'),
    supabase.from('periodos_instrumento').select('mes, cerrado').lt('mes', mes).eq('cerrado', false),
  ])

  return (
    <CierreMensualClient
      mes={mes}
      periodos={periodos ?? []}
      instrumentos={instrumentos ?? []}
      inversores={inversores ?? []}
      mesesAbiertosAnteriores={[...new Set((todosPeriodos ?? []).map((p) => p.mes))].sort()}
    />
  )
}
