import { createClient } from '@/lib/supabase/server'
import { EmpleadosClient } from '@/components/rrhh/empleados-client'

export default async function EmpleadosPage() {
  const supabase = await createClient()
  const { data: empleados } = await supabase
    .from('empleados')
    .select('*')
    .order('apellido')

  return <EmpleadosClient empleados={empleados ?? []} />
}
