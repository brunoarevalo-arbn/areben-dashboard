import { createClient } from '@/lib/supabase/server'
import { SociosClient } from '@/components/finanzas/socios-client'
import type { Socio, RetiroSocio, CategoriaRetiro, TipoCambioMes } from '@/types/database'

// Módulo Socios unificado: cuenta corriente + alta de retiros + conversión + pagos.
// El saldo acumulado en USD (patrimonial) vive aparte en Cuentas particulares.
export async function CuentaSociosPanel({ socioInicial }: { socioInicial?: string }) {
  const supabase = await createClient()

  const [{ data: socios }, { data: retiros }, { data: categorias }, { data: tipoCambio }, { data: tarjetas }] = await Promise.all([
    supabase.from('socios').select('*').eq('activo', true).order('nombre'),
    supabase.from('retiros_socios').select('*, categoria:categorias_retiro(*)').eq('estado', 'PAGADO').order('fecha', { ascending: false }),
    supabase.from('categorias_retiro').select('*').eq('activo', true).order('orden'),
    supabase.from('tipos_cambio_mes').select('*').order('mes', { ascending: false }),
    supabase.from('tarjetas_credito').select('id, nombre, banco').eq('activo', true).order('banco'),
  ])

  return (
    <SociosClient
      socios={(socios ?? []) as Socio[]}
      retiros={(retiros ?? []) as (RetiroSocio & { categoria?: CategoriaRetiro | null })[]}
      categorias={(categorias ?? []) as CategoriaRetiro[]}
      tiposCambio={(tipoCambio ?? []) as TipoCambioMes[]}
      tarjetas={(tarjetas ?? []) as { id: string; nombre: string; banco: string }[]}
      socioInicial={socioInicial ?? null}
    />
  )
}
