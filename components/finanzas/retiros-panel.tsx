import { createClient } from '@/lib/supabase/server'
import { RetirosClient } from '@/components/finanzas/retiros-client'

// Panel "Movimientos" del módulo Socios (retiros individuales).
export async function RetirosPanel() {
  const supabase = await createClient()
  const [{ data: retiros }, { data: categorias }, { data: tipoCambio }, { data: tarjetas }] = await Promise.all([
    supabase
      .from('retiros_socios')
      .select('*, categoria:categorias_retiro(*)')
      .order('fecha', { ascending: false })
      .limit(200),
    supabase.from('categorias_retiro').select('*').eq('activo', true).order('orden'),
    supabase.from('tipos_cambio_mes').select('*').order('mes', { ascending: false }),
    supabase.from('tarjetas_credito').select('id, nombre, banco').eq('activo', true).order('banco'),
  ])

  const socios = [...new Set(retiros?.map((r) => r.socio) ?? [])]

  return (
    <RetirosClient
      retiros={retiros ?? []}
      socios={socios}
      categorias={categorias ?? []}
      tiposCambio={tipoCambio ?? []}
      tarjetas={tarjetas ?? []}
    />
  )
}
