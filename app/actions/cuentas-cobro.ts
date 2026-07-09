'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TipoCuentaCobro } from '@/types/database'
import { tokenParaCuenta, paginaVentas, GestionNubeError } from '@/lib/gestion-nube/client'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Cambia el tipo de una cuenta de cobro (areben/propia/efectivo). */
export async function setTipoCuentaCobro(id: string, tipo: TipoCuentaCobro): Promise<string | null> {
  await requireUser()
  if (!['areben', 'propia', 'efectivo'].includes(tipo)) return 'Tipo inválido'
  const supabase = await createClient()
  const { error } = await supabase.from('cuentas_cobro_gn').update({ tipo }).eq('id', id)
  if (error) return error.message
  revalidatePath('/settings/cuentas-cobro')
  return null
}

/**
 * Detecta cuentas de cobro (account_display) nuevas mirando las ventas de GN de los
 * últimos ~3 meses (ambas cuentas). Inserta solo las que faltan, con tipo 'efectivo'
 * por defecto (el usuario las reclasifica). No pisa las ya clasificadas.
 */
export async function detectarCuentasCobroGN(): Promise<string | null> {
  await requireUser()
  const supabase = await createClient()
  const { data: cuentas } = await supabase.from('cuentas_gn').select('alias')

  const d = new Date()
  d.setMonth(d.getMonth() - 3)
  const desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`

  const nombres = new Set<string>()
  try {
    for (const c of cuentas ?? []) {
      const token = tokenParaCuenta(c.alias)
      for (let page = 1; page <= 100; page++) {
        const { data, hayMas } = await paginaVentas(token, desde, page)
        for (const v of data) {
          const k = (v.account_display || '').trim()
          if (k) nombres.add(k)
        }
        if (!hayMas) break
        await sleep(700)
      }
    }
  } catch (e) {
    return e instanceof GestionNubeError ? e.message : (e as Error).message
  }

  if (!nombres.size) return 'No se encontraron cuentas de cobro'
  const filas = [...nombres].map((nombre) => ({ nombre, tipo: 'efectivo' as const }))
  const { error } = await supabase
    .from('cuentas_cobro_gn')
    .upsert(filas, { onConflict: 'nombre', ignoreDuplicates: true })
  if (error) return error.message

  revalidatePath('/settings/cuentas-cobro')
  return null
}
