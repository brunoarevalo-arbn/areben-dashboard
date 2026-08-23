import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { HorasExtrasClient } from '@/components/rrhh/horas-extras-client'

export default async function HorasExtrasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; tab?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? (await getMesActivo())

  const desde = `${mes}-01`
  const f = new Date(desde + 'T00:00:00')
  const hasta = new Date(f.getFullYear(), f.getMonth() + 1, 0).toISOString().split('T')[0]

  const supabase = await createClient()

  const [{ data: pendientes }, { data: delMes }, { data: empleados }] = await Promise.all([
    // Las pendientes van SIN filtro de mes: una carga de fin de mes que nadie miró no se
    // tiene que esconder porque el mes activo ya pasó al siguiente.
    supabase
      .from('horas_extras_registros')
      .select('*')
      .eq('estado', 'PENDIENTE')
      .order('fecha', { ascending: false }),
    supabase
      .from('horas_extras_registros')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false }),
    supabase
      .from('empleados')
      .select('id, nombre, apellido, valor_hora, sueldo_basico, horas_mensuales, token_horas, token_horas_creado_at')
      .eq('activo', true)
      .order('apellido'),
  ])

  return (
    <HorasExtrasClient
      mes={mes}
      tab={params.tab ?? 'pendientes'}
      pendientes={pendientes ?? []}
      delMes={delMes ?? []}
      empleados={empleados ?? []}
    />
  )
}
