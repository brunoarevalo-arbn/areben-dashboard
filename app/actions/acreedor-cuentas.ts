'use server'

// Cuentas bancarias de los acreedores: a dónde se le transfiere a cada uno.
//
// Es una libreta de direcciones, no un movimiento de plata: acá no se toca `pagos`, ni el estado
// de ningún gasto, ni el cierre. Guardar un CBU no cambia un solo número del dashboard.
//
// La única regla que se cuida desde acá es la de la SUGERIDA: una sola por acreedor. La base la
// garantiza con un índice único parcial (migración 080), y estas funciones hacen los pasos en el
// orden que ese índice acepta —primero bajar la vieja, después subir la nueva— porque al revés
// rebota.

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { limpiar, normalizarCbu, validarCuenta } from '@/lib/acreedor-cuentas'

const PATHS = ['/finanzas/acreedores', '/finanzas/pagos']
function revalidar() {
  for (const p of PATHS) revalidatePath(p)
}

/** Traduce el error de la base a algo que se pueda leer. */
function explicar(error: { code?: string; message: string }): string {
  if (error.code === '23505') {
    if (error.message.includes('cbu_unico')) return 'Ese CBU ya está cargado en esta persona.'
    if (error.message.includes('sugerida')) return 'Esa persona ya tiene otra cuenta marcada como sugerida.'
  }
  if (error.code === '23514') {
    if (error.message.includes('cbu_formato')) return 'El CBU tiene que ser de 22 números.'
    if (error.message.includes('destino_no_vacio')) return 'Poné al menos el alias o el CBU.'
  }
  return error.message
}

export interface GuardarCuentaArgs {
  /** Si viene, se edita esa cuenta; si no, se crea una nueva. */
  id?: string
  proveedorId: string
  alias?: string | null
  cbu?: string | null
  banco?: string | null
  titular?: string | null
  notas?: string | null
  /** Marcarla como la que se ofrece primero. */
  sugerida?: boolean
}

/**
 * Alta o edición de una cuenta. La PRIMERA cuenta de un acreedor queda sugerida sola: si es la
 * única que hay, no tiene sentido que la pantalla no proponga ninguna.
 */
export async function guardarCuentaAcreedor(
  args: GuardarCuentaArgs,
): Promise<{ id?: string; error?: string }> {
  await requireUser()

  const problema = validarCuenta(args)
  if (problema) return { error: problema }
  if (!args.proveedorId) return { error: 'Falta a quién pertenece la cuenta.' }

  const supabase = await createClient()

  const campos = {
    proveedor_id: args.proveedorId,
    alias: limpiar(args.alias),
    cbu: normalizarCbu(args.cbu),
    banco: limpiar(args.banco),
    titular: limpiar(args.titular),
    notas: limpiar(args.notas),
  }

  // Una cuenta archivada que se edita sigue archivada: no puede quedar sugerida sin querer.
  let activa = true
  if (args.id) {
    const { data: actual } = await supabase
      .from('acreedor_cuentas')
      .select('activa')
      .eq('id', args.id)
      .single()
    activa = actual?.activa ?? true
  }

  // ¿Tiene que quedar sugerida? Lo pedido, o sí o sí cuando es la única activa del acreedor:
  // si es la única que hay, no tiene sentido que la pantalla no proponga ninguna.
  const { data: hermanas } = await supabase
    .from('acreedor_cuentas')
    .select('id')
    .eq('proveedor_id', args.proveedorId)
    .eq('activa', true)
  const otras = (hermanas ?? []).filter((h) => h.id !== args.id)
  // Marcarla como "la que se usa" la saca del archivo: es exactamente lo que se está pidiendo.
  if (args.sugerida === true) activa = true
  const sugerida = activa && (args.sugerida === true || otras.length === 0)

  // Bajar la sugerida vieja ANTES de subir la nueva: el índice único no admite las dos juntas.
  if (sugerida) {
    const { error } = await supabase
      .from('acreedor_cuentas')
      .update({ sugerida: false })
      .eq('proveedor_id', args.proveedorId)
      .eq('sugerida', true)
    if (error) return { error: explicar(error) }
  }

  if (args.id) {
    const { error } = await supabase
      .from('acreedor_cuentas')
      .update({ ...campos, sugerida, activa })
      .eq('id', args.id)
    if (error) return { error: explicar(error) }
    revalidar()
    return { id: args.id }
  }

  const { data, error } = await supabase
    .from('acreedor_cuentas')
    .insert({ ...campos, sugerida, activa: true })
    .select('id')
    .single()
  if (error) return { error: explicar(error) }

  revalidar()
  return { id: data.id }
}

/** Marca una cuenta como la que se ofrece primero, y baja la que lo estaba. */
export async function marcarCuentaSugerida(id: string): Promise<{ error?: string }> {
  await requireUser()
  const supabase = await createClient()

  const { data: cuenta, error: eLeer } = await supabase
    .from('acreedor_cuentas')
    .select('proveedor_id')
    .eq('id', id)
    .single()
  if (eLeer || !cuenta) return { error: 'No se encontró la cuenta.' }

  const { error: eBajar } = await supabase
    .from('acreedor_cuentas')
    .update({ sugerida: false })
    .eq('proveedor_id', cuenta.proveedor_id)
    .eq('sugerida', true)
  if (eBajar) return { error: explicar(eBajar) }

  const { error } = await supabase
    .from('acreedor_cuentas')
    .update({ sugerida: true, activa: true })
    .eq('id', id)
  if (error) return { error: explicar(error) }

  revalidar()
  return {}
}

/**
 * Archiva una cuenta (no la borra: los pagos viejos se siguen leyendo). Si era la sugerida, la
 * marca pasa a la más antigua de las que quedan, para no dejar al acreedor sin ninguna propuesta.
 */
export async function archivarCuentaAcreedor(id: string): Promise<{ error?: string }> {
  await requireUser()
  const supabase = await createClient()

  const { data: cuenta, error: eLeer } = await supabase
    .from('acreedor_cuentas')
    .select('proveedor_id, sugerida')
    .eq('id', id)
    .single()
  if (eLeer || !cuenta) return { error: 'No se encontró la cuenta.' }

  const { error } = await supabase
    .from('acreedor_cuentas')
    .update({ activa: false, sugerida: false })
    .eq('id', id)
  if (error) return { error: explicar(error) }

  if (cuenta.sugerida) {
    const { data: quedan } = await supabase
      .from('acreedor_cuentas')
      .select('id')
      .eq('proveedor_id', cuenta.proveedor_id)
      .eq('activa', true)
      .order('created_at', { ascending: true })
      .limit(1)
    const heredera = quedan?.[0]?.id
    if (heredera) {
      await supabase.from('acreedor_cuentas').update({ sugerida: true }).eq('id', heredera)
    }
  }

  revalidar()
  return {}
}

/** Vuelve a poner en uso una cuenta archivada. No la marca como sugerida. */
export async function reactivarCuentaAcreedor(id: string): Promise<{ error?: string }> {
  await requireUser()
  const supabase = await createClient()

  const { error } = await supabase.from('acreedor_cuentas').update({ activa: true }).eq('id', id)
  if (error) return { error: explicar(error) }

  revalidar()
  return {}
}
