import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { ReporteClient } from '@/components/inversiones/reporte-client'

export default async function ReportePage({
  searchParams,
}: {
  searchParams: Promise<{ inversor?: string; mes?: string; instrumento?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? getCurrentMonth()
  const supabase = await createClient()

  // Si vino un instrumento, encontrar su inversor
  let inversorId = params.inversor
  if (!inversorId && params.instrumento) {
    const { data: i } = await supabase.from('instrumentos_inversion').select('inversor_id').eq('id', params.instrumento).single()
    inversorId = i?.inversor_id
  }

  const [{ data: inversores }, { data: inversor }, { data: instrumentos }, { data: periodos }, { data: tramos }] = await Promise.all([
    supabase.from('inversores').select('*').order('nombre'),
    inversorId ? supabase.from('inversores').select('*').eq('id', inversorId).maybeSingle() : Promise.resolve({ data: null }),
    inversorId ? supabase.from('instrumentos_inversion').select('*').eq('inversor_id', inversorId) : Promise.resolve({ data: [] }),
    inversorId
      ? supabase.from('periodos_instrumento').select('*, instrumento:instrumentos_inversion!inner(inversor_id)').eq('mes', mes).eq('instrumento.inversor_id', inversorId)
      : Promise.resolve({ data: [] }),
    inversorId
      ? supabase.from('tramos_tasa').select('*, instrumento:instrumentos_inversion!inner(inversor_id)').eq('instrumento.inversor_id', inversorId).order('fecha_desde', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  return (
    <ReporteClient
      mes={mes}
      inversores={inversores ?? []}
      inversorSelected={inversor ?? null}
      instrumentos={instrumentos ?? []}
      periodos={periodos ?? []}
      tramos={tramos ?? []}
    />
  )
}
