import { createClient } from '@/lib/supabase/server'
import { VacacionesClient } from '@/components/rrhh/vacaciones-client'

export default async function VacacionesPage() {
  const supabase = await createClient()
  const ano = new Date().getFullYear()

  const [{ data: empleados }, { data: vacaciones }] = await Promise.all([
    supabase
      .from('empleados')
      .select('id, nombre, apellido')
      .eq('activo', true)
      .order('apellido'),
    supabase
      .from('vacaciones_empleados')
      .select('*, empleado:empleados(nombre, apellido)')
      .eq('ano', ano),
  ])

  return (
    <VacacionesClient
      empleados={empleados ?? []}
      vacaciones={vacaciones ?? []}
      ano={ano}
    />
  )
}
