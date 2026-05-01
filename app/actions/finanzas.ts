'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// ============ GASTOS ============

const gastoSchema = z.object({
  categoria: z.string().min(1, 'Requerido'),
  concepto: z.string().min(1, 'Requerido'),
  monto: z.coerce.number().positive('Debe ser positivo'),
  negocio: z.enum(['BDI', 'ZATTIA', 'STUNNED', 'GENERAL']),
  mes: z.string().regex(/^\d{4}-\d{2}$/, 'Formato YYYY-MM'),
  estado: z.enum(['PENDIENTE', 'PAGADO', 'VENCIDO']),
  fecha_pago: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
})

export async function createGasto(prevState: string | null, formData: FormData) {
  const raw = Object.fromEntries(formData)
  const result = gastoSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('gastos').insert({
    ...result.data,
    fecha_pago: result.data.fecha_pago || null,
    notas: result.data.notas || null,
  })
  if (error) return error.message

  revalidatePath('/finanzas/gastos')
  revalidatePath('/')
  return null
}

export async function updateGasto(id: string, prevState: string | null, formData: FormData) {
  const raw = Object.fromEntries(formData)
  const result = gastoSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase
    .from('gastos')
    .update({ ...result.data, fecha_pago: result.data.fecha_pago || null, notas: result.data.notas || null })
    .eq('id', id)
  if (error) return error.message

  revalidatePath('/finanzas/gastos')
  revalidatePath('/')
  return null
}

export async function deleteGasto(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('gastos').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/finanzas/gastos')
  revalidatePath('/')
}

export async function marcarGastoPagado(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('gastos')
    .update({ estado: 'PAGADO', fecha_pago: new Date().toISOString().split('T')[0] })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/finanzas/gastos')
  revalidatePath('/')
}

// ============ SALDOS ============

const saldoSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  saldo_pesos: z.coerce.number(),
  saldo_usd: z.coerce.number(),
  caja_pesos: z.coerce.number(),
  caja_usd: z.coerce.number(),
  cuentas_corrientes: z.coerce.number(),
  notas: z.string().optional().nullable(),
})

export async function upsertSaldo(prevState: string | null, formData: FormData) {
  const raw = Object.fromEntries(formData)
  const result = saldoSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase
    .from('saldos_mensuales')
    .upsert({ ...result.data, notas: result.data.notas || null }, { onConflict: 'mes' })
  if (error) return error.message

  revalidatePath('/finanzas/saldos')
  revalidatePath('/')
  return null
}

// ============ RETIROS ============

const retiroSchema = z.object({
  socio: z.string().min(1, 'Requerido'),
  fecha: z.string().min(1, 'Requerido'),
  monto_usd: z.coerce.number().min(0),
  monto_pesos: z.coerce.number().min(0),
  tipo_cambio: z.coerce.number().positive(),
  notas: z.string().optional().nullable(),
})

export async function createRetiro(prevState: string | null, formData: FormData) {
  const raw = Object.fromEntries(formData)
  const result = retiroSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('retiros_socios').insert({
    ...result.data,
    notas: result.data.notas || null,
  })
  if (error) return error.message

  revalidatePath('/finanzas/retiros')
  revalidatePath('/')
  return null
}

export async function deleteRetiro(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('retiros_socios').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/retiros')
}

// ============ AFIP ============

const afipSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  motivo: z.string().min(1),
  monto: z.coerce.number().positive(),
  responsable: z.string().min(1),
  estado: z.enum(['PENDIENTE', 'PAGADO', 'VENCIDO']),
  fecha_vencimiento: z.string().optional().nullable(),
})

export async function createAfip(prevState: string | null, formData: FormData) {
  const raw = Object.fromEntries(formData)
  const result = afipSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('afip_facturacion').insert({
    ...result.data,
    fecha_vencimiento: result.data.fecha_vencimiento || null,
  })
  if (error) return error.message

  revalidatePath('/finanzas/afip')
  return null
}

// ============ BIENES ============

const bienSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.string().min(1),
  fecha_compra: z.string().min(1),
  precio: z.coerce.number().positive(),
  vida_util_anos: z.coerce.number().int().positive(),
  valor_residual: z.coerce.number().min(0),
  descripcion: z.string().optional().nullable(),
})

export async function createBien(prevState: string | null, formData: FormData) {
  const raw = Object.fromEntries(formData)
  const result = bienSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase.from('bienes_uso').insert({
    ...result.data,
    descripcion: result.data.descripcion || null,
    activo: true,
  })
  if (error) return error.message

  revalidatePath('/finanzas/bienes')
  return null
}
