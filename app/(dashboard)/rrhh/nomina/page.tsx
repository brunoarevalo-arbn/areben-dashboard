import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { NominaClient } from '@/components/rrhh/nomina-client'

export default async function NominaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? getCurrentMonth()

  const supabase = await createClient()

  const [{ data: nominas }, { data: empleados }, { data: aportes }] = await Promise.all([
    supabase
      .from('nomina_mensual')
      .select('*, empleado:empleados(nombre, apellido, tipo_empleado)')
      .eq('mes', mes)
      .order('created_at', { ascending: false }),
    supabase
      .from('empleados')
      .select('id, nombre, apellido, tipo_empleado, sueldo_basico, valor_hora')
      .eq('activo', true)
      .order('apellido'),
    supabase
      .from('configuracion_aportes')
      .select('*')
      .eq('activo', true)
      .order('orden'),
  ])

  return (
    <NominaClient
      nominas={nominas ?? []}
      empleados={empleados ?? []}
      aportes={aportes ?? []}
      mes={mes}
    />
  )
}
