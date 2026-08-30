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
import { createPagoUnificado } from '@/app/actions/pagos'
import type { InstrumentoPago } from '@/types/database'

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

/**
 * Registra UNA salida de plata repartida entre varios gastos del mismo acreedor.
 *
 * Es lo que se venía haciendo a mano: se transfiere un importe y se lo va imputando del concepto
 * más viejo al más nuevo. Cada renglón nace como un pago propio en el ledger — no hay un "pago
 * grande" que después se subdivide — así el saldo de cada gasto y el cierre siguen funcionando
 * igual que siempre, sin nada nuevo que entender.
 *
 * Se apoya en `createPagoUnificado` en vez de escribir `pagos` a mano: así hereda la validación de
 * saldo, el marcado automático del gasto como PAGADO cuando se completa, y los revalidate.
 */
export async function registrarPagoRepartido(args: {
  renglones: { gastoId: string; monto: number }[]
  fecha: string
  instrumento: InstrumentoPago
  cuentaId: string | null
  /** De dónde salió la plata (ej. "Nazarena Luciani - BDI Mayorista"). Va en cada renglón. */
  notas: string | null
}): Promise<{ aplicados: number; error?: string }> {
  await requireUser()

  const renglones = args.renglones.filter((r) => r.monto > 0.005)
  if (!renglones.length) return { aplicados: 0, error: 'No hay nada para imputar.' }

  let aplicados = 0
  for (const r of renglones) {
    try {
      await createPagoUnificado({
        tipo_origen: 'GASTO',
        origen_id: r.gastoId,
        monto: r.monto,
        moneda: 'ARS',
        fecha_emision: args.fecha,
        instrumento: args.instrumento,
        cuenta_id: args.cuentaId,
        notas: args.notas,
      })
      aplicados++
    } catch (e) {
      // Se corta acá: los renglones ya aplicados quedan (son pagos reales y válidos), pero no se
      // sigue imputando a ciegas. El mensaje dice hasta dónde llegó para poder retomar.
      const detalle = e instanceof Error ? e.message : String(e)
      return {
        aplicados,
        error: aplicados === 0
          ? `No se pudo registrar el pago: ${detalle}`
          : `Se aplicaron ${aplicados} de ${renglones.length} renglones y se cortó: ${detalle}`,
      }
    }
  }

  revalidar()
  return { aplicados }
}
