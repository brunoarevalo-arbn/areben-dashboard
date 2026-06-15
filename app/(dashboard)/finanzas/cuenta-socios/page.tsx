import { createClient } from '@/lib/supabase/server'
import { CuentaSociosClient } from '@/components/finanzas/cuenta-socios-client'
import type { Socio, RetiroSocio, CategoriaRetiro } from '@/types/database'

export default async function CuentaSociosPage({
  searchParams,
}: {
  searchParams: Promise<{ socio?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const [
    { data: socios },
    { data: retiros },
    { data: categorias },
  ] = await Promise.all([
    supabase.from('socios').select('*').eq('activo', true).order('nombre'),
    supabase
      .from('retiros_socios')
      .select('*, categoria:categorias_retiro(*)')
      .order('fecha', { ascending: false }),
    supabase.from('categorias_retiro').select('*').eq('activo', true).order('orden'),
  ])

  return (
    <CuentaSociosClient
      socios={(socios ?? []) as Socio[]}
      retiros={(retiros ?? []) as RetiroSocio[]}
      categorias={(categorias ?? []) as CategoriaRetiro[]}
      socioInicial={params.socio ?? null}
    />
  )
}
