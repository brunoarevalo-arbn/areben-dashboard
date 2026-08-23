'use server'

/**
 * Carga de horas extras por el propio empleado, desde su link personal (/horas/<token>).
 *
 * ⚠️ Este es el ÚNICO archivo de actions mutadoras que NO llama a `requireUser()`, junto con
 * `app/actions/auth.ts`. Es a propósito: los empleados no tienen usuario del dashboard, así que
 * la autorización es el token del link. Para que eso no sea un agujero:
 *
 *  - Nunca se escribe con `.from(...)`: todo va por las funciones `security definer` de la
 *    migración 077, que son lo único que `anon` puede ejecutar. La RLS `authenticated_all`
 *    sigue cerrada para el resto de la tabla.
 *  - Las funciones validan adentro (empleado activo, horas 0,25–12, fecha no futura ni de más de
 *    45 días atrás, tope de 12 hs por día) y devuelven el mensaje ya escrito para el empleado.
 *  - Todo lo que entra nace `PENDIENTE`: sin que alguien lo apruebe en /rrhh/horas-extras no se
 *    paga nada. El peor caso de un link filtrado es que alguien PIDA horas de más.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/** Lo que la página necesita mostrar: el nombre y sus últimos 60 días de cargas. */
export interface EstadoHoras {
  nombre: string
  apellido: string
  /** Hoy en hora de Argentina, calculado en la base (no en el server ni en el celular). */
  hoy: string
  registros: {
    id: string
    fecha: string
    cantidad: number
    porcentaje: number
    estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'
    notas: string | null
    rechazo_motivo: string | null
    created_at: string
  }[]
}

export async function estadoPorToken(token: string): Promise<EstadoHoras | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('horas_estado_por_token', { p_token: token })
  if (error || !data) return null
  return data as EstadoHoras
}

export async function cargarHorasPorToken(prevState: string | null, formData: FormData) {
  const token = String(formData.get('token') ?? '')
  const fecha = String(formData.get('fecha') ?? '')
  const cantidad = Number(formData.get('cantidad'))
  const notas = String(formData.get('notas') ?? '')

  if (!token) return 'Falta el link.'
  if (!fecha) return 'Elegí la fecha.'
  if (!cantidad || cantidad <= 0) return 'Poné cuántas horas hiciste.'

  const supabase = await createClient()
  const { error } = await supabase.rpc('horas_cargar_por_token', {
    p_token: token,
    p_fecha: fecha,
    p_cantidad: cantidad,
    p_notas: notas || null,
  })
  // El mensaje viene escrito desde la función, ya en castellano y para el empleado.
  if (error) return error.message

  revalidatePath('/horas/[token]', 'page')
  revalidatePath('/rrhh/horas-extras')
  return null
}

export async function borrarHorasPorToken(token: string, id: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('horas_borrar_por_token', { p_token: token, p_id: id })
  if (error) return error.message

  revalidatePath('/horas/[token]', 'page')
  revalidatePath('/rrhh/horas-extras')
  return null
}
