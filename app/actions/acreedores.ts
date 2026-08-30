'use server'

// Cuenta corriente de acreedores (/finanzas/acreedores).
//
// La pantalla es de solo lectura: el saldo sale de los gastos y de los pagos que ya están
// cargados (ver lib/acreedores.ts). Lo único que se escribe desde acá es A QUIÉN pertenece
// cada gasto — `gastos.proveedor_id`, la columna que agregó la migración 079.
//
// No toca `pagos`, ni el estado del gasto, ni el cierre: asignar un acreedor no mueve un peso.

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const PATHS = ['/finanzas/acreedores', '/finanzas/gastos', '/finanzas/pagos']
function revalidar() {
  for (const p of PATHS) revalidatePath(p)
}

/**
 * Pone (o saca, con `null`) el acreedor de varios gastos de una vez. Es la forma práctica de
 * abrir la cuenta de alguien nuevo: se buscan sus gastos por concepto y se marcan todos juntos.
 */
export async function asignarAcreedor(
  gastoIds: string[],
  proveedorId: string | null,
): Promise<{ actualizados: number; error?: string }> {
  await requireUser()
  if (!gastoIds.length) return { actualizados: 0 }

  const supabase = await createClient()
  const { error } = await supabase
    .from('gastos')
    .update({ proveedor_id: proveedorId })
    .in('id', gastoIds)
  if (error) return { actualizados: 0, error: error.message }

  revalidar()
  return { actualizados: gastoIds.length }
}

/**
 * Da de alta un acreedor nuevo en el maestro `proveedores` — el mismo que usan las compras,
 * para no tener dos listas de nombres. Nace sin marcas porque no se le compra mercadería.
 */
export async function crearAcreedor(nombre: string): Promise<{ id?: string; error?: string }> {
  await requireUser()
  const limpio = nombre.trim()
  if (!limpio) return { error: 'Poné un nombre.' }

  const supabase = await createClient()

  const { data: existente } = await supabase
    .from('proveedores')
    .select('id, nombre')
    .ilike('nombre', limpio)
    .maybeSingle()
  if (existente) return { error: `Ya existe "${existente.nombre}". Elegilo de la lista.` }

  const { data, error } = await supabase
    .from('proveedores')
    .insert({ nombre: limpio, tipo: 'NACIONAL', pais: 'Argentina', moneda: 'ARS', activo: true })
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidar()
  revalidatePath('/compras/proveedores')
  return { id: data.id }
}
