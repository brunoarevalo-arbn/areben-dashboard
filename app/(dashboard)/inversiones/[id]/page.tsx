import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { InversorDetalleClient } from '@/components/inversiones/inversor-detalle-client'

export default async function InversorDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: inversor }, { data: instrumentos }, { data: periodos }, { data: tramos }] = await Promise.all([
    supabase.from('inversores').select('*').eq('id', id).single(),
    supabase.from('instrumentos_inversion').select('*').eq('inversor_id', id).order('created_at', { ascending: false }),
    supabase.from('periodos_instrumento').select('*, instrumento:instrumentos_inversion!inner(inversor_id)').eq('instrumento.inversor_id', id).order('mes', { ascending: false }),
    supabase
      .from('tramos_tasa')
      .select('*, instrumento:instrumentos_inversion!inner(inversor_id)')
      .eq('instrumento.inversor_id', id)
      .order('fecha_desde', { ascending: true }),
  ])

  if (!inversor) notFound()

  return (
    <InversorDetalleClient
      inversor={inversor}
      instrumentos={instrumentos ?? []}
      periodos={periodos ?? []}
      tramos={tramos ?? []}
    />
  )
}
