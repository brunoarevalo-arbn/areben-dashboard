import { createClient } from '@/lib/supabase/server'
import { EmpleadosClient } from '@/components/rrhh/empleados-client'

export default async function EmpleadosPage() {
  const supabase = await createClient()
  const [{ data: empleados }, { data: eventos }, { data: horasExtras }, { data: ausencias }] = await Promise.all([
    supabase.from('empleados').select('*').order('apellido'),
    supabase.from('eventos_empleado').select('*').order('fecha', { ascending: false }),
    supabase.from('horas_extras_registros').select('*').order('fecha', { ascending: false }),
    supabase.from('ausencias_registros').select('*').order('fecha', { ascending: false }),
  ])

  return (
    <EmpleadosClient
      empleados={empleados ?? []}
      eventos={eventos ?? []}
      horasExtras={horasExtras ?? []}
      ausencias={ausencias ?? []}
    />
  )
}
