'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// ============ PROVEEDORES ============

const proveedorSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(['NACIONAL', 'IMPORTACION']),
  contacto: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  telefono: z.string().optional().nullable(),
  pais: z.string().min(1),
  condiciones_pago: z.string().optional().nullable(),
  moneda: z.enum(['ARS', 'USD']),
  notas: z.string().optional().nullable(),
})

export async function createProveedor(prevState: string | null, formData: FormData) {
  const raw = Object.fromEntries(formData)
  const result = proveedorSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('proveedores').insert({
    ...result.data,
    email: result.data.email || null,
    contacto: result.data.contacto || null,
    telefono: result.data.telefono || null,
    condiciones_pago: result.data.condiciones_pago || null,
    notas: result.data.notas || null,
    activo: true,
  })
  if (error) return error.message

  revalidatePath('/compras/proveedores')
  return null
}

export async function updateProveedor(id: string, prevState: string | null, formData: FormData) {
  const raw = Object.fromEntries(formData)
  const result = proveedorSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('proveedores').update({
    ...result.data,
    email: result.data.email || null,
    contacto: result.data.contacto || null,
    telefono: result.data.telefono || null,
    condiciones_pago: result.data.condiciones_pago || null,
    notas: result.data.notas || null,
  }).eq('id', id)
  if (error) return error.message

  revalidatePath('/compras/proveedores')
  return null
}

// ============ COMPRAS ============

const compraSchema = z.object({
  proveedor_id: z.string().uuid(),
  fecha: z.string().min(1),
  descripcion: z.string().min(1),
  cantidad: z.coerce.number().positive(),
  precio_unitario: z.coerce.number().positive(),
  moneda: z.enum(['ARS', 'USD']),
  tipo_cambio: z.coerce.number().optional().nullable(),
  estado: z.enum(['PENDIENTE', 'PAGADO', 'VENCIDO']),
  fecha_pago: z.string().optional().nullable(),
  negocio: z.enum(['BDI', 'ZATTIA', 'STUNNED', 'GENERAL']),
  notas: z.string().optional().nullable(),
})

export async function createCompra(prevState: string | null, formData: FormData) {
  const raw = Object.fromEntries(formData)
  const result = compraSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('compras').insert({
    ...result.data,
    tipo_cambio: result.data.tipo_cambio || null,
    fecha_pago: result.data.fecha_pago || null,
    notas: result.data.notas || null,
  })
  if (error) return error.message

  revalidatePath('/compras/lista')
  return null
}

export async function deleteCompra(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('compras').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/compras/lista')
}

// ============ DATOS GN ============

const datosGNSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  marca: z.enum(['BDI', 'ZATTIA', 'STUNNED', 'GENERAL']),
  ventas_brutas: z.coerce.number().min(0),
  devoluciones: z.coerce.number().min(0),
  ventas_netas: z.coerce.number().min(0),
  cmv: z.coerce.number().min(0),
  cantidad_vendida: z.coerce.number().int().min(0),
  comisiones: z.coerce.number().min(0),
})

export async function upsertDatosGN(prevState: string | null, formData: FormData) {
  const raw = Object.fromEntries(formData)
  const result = datosGNSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const d = result.data
  const margen_pesos = d.ventas_netas - d.cmv
  const margen_porcentaje = d.ventas_netas > 0 ? (margen_pesos / d.ventas_netas) * 100 : 0

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('datos_ventas_gn').upsert(
    {
      ...d,
      margen_pesos,
      margen_porcentaje,
      fecha_sincronizacion: new Date().toISOString(),
      sincronizado_por: user?.email ?? 'manual',
    },
    { onConflict: 'mes,marca' }
  )
  if (error) return error.message

  revalidatePath('/analisis/ventas')
  revalidatePath('/analisis/pl-marca')
  revalidatePath('/')
  return null
}
