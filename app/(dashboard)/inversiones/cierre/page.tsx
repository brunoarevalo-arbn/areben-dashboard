import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { CierreMensualClient } from '@/components/inversiones/cierre-mensual-client'
import { revisarCadena } from '@/lib/inversiones-cadena'

export default async function CierrePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? getCurrentMonth()
  const supabase = await createClient()

  const [{ data: periodos }, { data: instrumentos }, { data: inversores }, { data: todosPeriodos }, { data: cadena }] = await Promise.all([
    supabase
      .from('periodos_instrumento')
      .select('*, instrumento:instrumentos_inversion(*, inversor:inversores(*))')
      .eq('mes', mes)
      .order('created_at'),
    supabase.from('instrumentos_inversion').select('*, inversor:inversores(*)'),
    supabase.from('inversores').select('*'),
    supabase.from('periodos_instrumento').select('mes, cerrado').lt('mes', mes).eq('cerrado', false),
    // Todos los meses de todos los instrumentos: la cadena se revisa entera, no sólo
    // el mes que se está mirando, porque el corte puede venir de un mes anterior.
    supabase
      .from('periodos_instrumento')
      .select('instrumento_id, mes, saldo_inicio, saldo_cierre')
      .order('mes', { ascending: true })
      .limit(5000),
  ])

  return (
    <CierreMensualClient
      mes={mes}
      periodos={periodos ?? []}
      instrumentos={instrumentos ?? []}
      inversores={inversores ?? []}
      mesesAbiertosAnteriores={[...new Set((todosPeriodos ?? []).map((p) => p.mes))].sort()}
      descuadres={revisarCadena(cadena ?? [])}
    />
  )
}
