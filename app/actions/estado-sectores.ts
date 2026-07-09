'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { esSectorValido } from '@/lib/sectores'

/**
 * Marca (o desmarca) un sector como "listo" para un mes.
 * Registra quién (email) y cuándo. Upsert por (mes, sector).
 * Devuelve string con el error, o null si salió bien (patrón del resto de actions).
 */
export async function marcarSectorListo(
  sector: string,
  mes: string,
  listo: boolean,
): Promise<string | null> {
  const user = await requireUser()

  if (!esSectorValido(sector)) return 'Sector desconocido'
  if (!/^\d{4}-\d{2}$/.test(mes)) return 'Mes inválido'

  const supabase = await createClient()
  const { error } = await supabase.from('estado_sector_mes').upsert(
    {
      mes,
      sector,
      listo,
      marcado_por: user.email ?? 'manual',
      marcado_at: new Date().toISOString(),
    },
    { onConflict: 'mes,sector' },
  )
  if (error) return error.message

  revalidatePath('/')
  revalidatePath('/finanzas/saldos-impositivos')
  return null
}
