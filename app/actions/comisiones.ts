'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Marca } from '@/types/database'
import { tokenParaCuenta, paginaVentas, GestionNubeError } from '@/lib/gestion-nube/client'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Cambia el % de comisión de un medio de pago. */
export async function setComisionMedio(id: string, porcentaje: number): Promise<string | null> {
  await requireUser()
  if (!(porcentaje >= 0) || porcentaje > 100) return 'Porcentaje inválido'
  const supabase = await createClient()
  const { error } = await supabase
    .from('comision_medio_pago')
    .update({ porcentaje, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return error.message
  revalidatePath('/settings/comisiones')
  return null
}

/**
 * Override manual de la comisión de un mes/marca (número real del resumen de MP/banco).
 * null = volver al estimado (columna comisiones). El sync no toca este campo.
 */
export async function setComisionOverride(mes: string, marca: Marca, monto: number | null): Promise<string | null> {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('datos_ventas_gn')
    .update({ comisiones_override: monto })
    .eq('mes', mes)
    .eq('marca', marca)
  if (error) return error.message
  revalidatePath('/analisis/ventas')
  return null
}

/**
 * Detecta medios de pago (payment_method) nuevos mirando las ventas de GN de los
 * últimos ~3 meses (todas las cuentas). Inserta solo los que faltan, con 0% por
 * defecto (el usuario carga el %). No pisa los ya configurados.
 */
export async function detectarMediosPago(): Promise<string | null> {
  await requireUser()
  const supabase = await createClient()
  const { data: cuentas } = await supabase.from('cuentas_gn').select('alias')

  const d = new Date()
  d.setMonth(d.getMonth() - 3)
  const desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`

  const medios = new Set<string>()
  try {
    for (const c of cuentas ?? []) {
      const token = tokenParaCuenta(c.alias)
      for (let page = 1; page <= 100; page++) {
        const { data, hayMas } = await paginaVentas(token, desde, page)
        for (const v of data) {
          const k = (v.payment_method || '').trim()
          if (k) medios.add(k)
        }
        if (!hayMas) break
        await sleep(700)
      }
    }
  } catch (e) {
    return e instanceof GestionNubeError ? e.message : (e as Error).message
  }

  if (!medios.size) return 'No se encontraron medios de pago'
  const filas = [...medios].map((medio) => ({ medio, porcentaje: 0 }))
  const { error } = await supabase
    .from('comision_medio_pago')
    .upsert(filas, { onConflict: 'medio', ignoreDuplicates: true })
  if (error) return error.message

  revalidatePath('/settings/comisiones')
  return null
}
