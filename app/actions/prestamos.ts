'use server'

import { revalidatePath } from 'next/cache'
import { createClient, requireUser } from '@/lib/supabase/server'
import { z } from 'zod'

const createPrestamoSchema = z.object({
  nombre: z.string().min(1),
  acreedor: z.string().min(1),
  titular_formal: z.string().optional().nullable(),
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  capital_original: z.coerce.number().positive(),
  total_intereses: z.coerce.number().nonnegative().default(0),
  cantidad_cuotas: z.coerce.number().int().positive(),
  dia_pago: z.coerce.number().int().min(1).max(31).default(1),
  cuenta_pago_id: z.string().uuid().optional().nullable(),
  cuotas: z.array(z.object({
    cuota_numero: z.number().int().positive(),
    capital: z.number().nonnegative(),
    interes: z.number().nonnegative(),
    monto_total: z.number().nonnegative(),
    fecha_vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    pagada: z.boolean().default(false),
  })).min(1),
  notas: z.string().optional().nullable(),
})

export async function createPrestamo(input: z.infer<typeof createPrestamoSchema>) {
  await requireUser()
  const parsed = createPrestamoSchema.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0].message)
  const data = parsed.data

  const supabase = await createClient()
  const total_a_pagar = data.capital_original + data.total_intereses

  const { data: prestamo, error: prestErr } = await supabase
    .from('prestamos')
    .insert({
      nombre: data.nombre,
      acreedor: data.acreedor,
      titular_formal: data.titular_formal || null,
      moneda: data.moneda,
      fecha_inicio: data.fecha_inicio,
      capital_original: data.capital_original,
      total_intereses: data.total_intereses,
      total_a_pagar,
      cantidad_cuotas: data.cantidad_cuotas,
      dia_pago: data.dia_pago,
      cuenta_pago_id: data.cuenta_pago_id || null,
      notas: data.notas || null,
    })
    .select('id')
    .single()
  if (prestErr || !prestamo) throw new Error(prestErr?.message ?? 'Error creando préstamo')

  // Cuotas
  const cuotaRows = data.cuotas.map((c) => ({
    prestamo_id: prestamo.id,
    cuota_numero: c.cuota_numero,
    total_cuotas: data.cantidad_cuotas,
    capital: c.capital,
    interes: c.interes,
    monto_total: c.monto_total,
    fecha_vencimiento: c.fecha_vencimiento,
    pagada: c.pagada,
    fecha_pago: c.pagada ? c.fecha_vencimiento : null,
  }))
  const { error: cuotasErr } = await supabase.from('prestamo_cuotas').insert(cuotaRows)
  if (cuotasErr) throw new Error(cuotasErr.message)

  // Gastos financieros (intereses) — solo para las cuotas PENDIENTES (las pagadas son históricas).
  // Nacen DEVENGADO: son el costo financiero (entran al resultado) pero NO son una línea de caja
  // aparte — la salida de caja es la cuota (capital + interés). Así no duplican en Pendientes ni en
  // el cierre. Mismo criterio que el interés de las inversiones.
  const cuotasPendientes = data.cuotas.filter((c) => !c.pagada && c.interes > 0)
  if (cuotasPendientes.length > 0) {
    const gastoRows = cuotasPendientes.map((c) => ({
      categoria: 'Gastos Financieros',
      concepto: `Interés ${data.nombre} - Cuota ${c.cuota_numero}/${data.cantidad_cuotas}`,
      monto: c.interes,
      monto_neto: c.interes,
      moneda: data.moneda,
      negocio: 'GENERAL',
      mes: c.fecha_vencimiento.substring(0, 7),
      fecha: c.fecha_vencimiento,
      fecha_pago: c.fecha_vencimiento,
      estado: 'DEVENGADO',
      medio_pago: 'TRANSFERENCIA',
      cuenta_id: data.cuenta_pago_id || null,
      iva_incluido: false,
      porcentaje_iva: 0,
      confirmado: true,
      prestamo_id: prestamo.id,
      notas: `Componente financiero del préstamo ${data.acreedor}`,
    }))
    const { error: gastoErr } = await supabase.from('gastos').insert(gastoRows)
    if (gastoErr) throw new Error(gastoErr.message)
  }

  revalidatePath('/finanzas/prestamos')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
  return { id: prestamo.id }
}

export async function marcarCuotaPrestamoPagada(cuotaId: string, fechaPago?: string) {
  await requireUser()
  const supabase = await createClient()
  const fecha = fechaPago ?? new Date().toISOString().split('T')[0]
  const { error } = await supabase
    .from('prestamo_cuotas')
    .update({ pagada: true, fecha_pago: fecha })
    .eq('id', cuotaId)
  if (error) throw new Error(error.message)

  // El gasto de interés queda DEVENGADO (costo, no caja): no se toca al pagar la cuota.
  // La salida de caja es la cuota completa (capital + interés); el interés no es una línea aparte.

  revalidatePath('/finanzas/prestamos')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
}

export async function desmarcarCuotaPrestamoPagada(cuotaId: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('prestamo_cuotas')
    .update({ pagada: false, fecha_pago: null })
    .eq('id', cuotaId)
  if (error) throw new Error(error.message)

  // El gasto de interés queda DEVENGADO (costo, no caja): no se toca al despagar la cuota.

  revalidatePath('/finanzas/prestamos')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
}

export async function cancelarPrestamo(prestamoId: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('prestamos')
    .update({ estado: 'CANCELADO' })
    .eq('id', prestamoId)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/prestamos')
}

export async function eliminarPrestamo(prestamoId: string) {
  await requireUser()
  const supabase = await createClient()

  await supabase
    .from('gastos')
    .delete()
    .eq('prestamo_id', prestamoId)
    .eq('categoria', 'Gastos Financieros')

  const { error } = await supabase
    .from('prestamos')
    .delete()
    .eq('id', prestamoId)
  if (error) throw new Error(error.message)

  revalidatePath('/finanzas/prestamos')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
}
