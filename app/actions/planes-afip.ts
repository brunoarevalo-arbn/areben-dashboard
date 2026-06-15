'use server'

import { revalidatePath } from 'next/cache'
import { createClient, requireUser } from '@/lib/supabase/server'
import { z } from 'zod'

const createPlanSchema = z.object({
  nombre: z.string().min(1),
  numero_plan: z.string().optional().nullable(),
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monto_deuda_original: z.coerce.number().nonnegative(),
  pago_contado: z.coerce.number().nonnegative().default(0),
  capital_financiado: z.coerce.number().positive(),
  cantidad_cuotas: z.coerce.number().int().positive(),
  monto_cuota: z.coerce.number().positive(),
  dia_debito: z.coerce.number().int().min(1).max(31).default(15),
  cuenta_debito_id: z.string().uuid().optional().nullable(),
  gasto_ids: z.array(z.string().uuid()).default([]),
  notas: z.string().optional().nullable(),
})

function calcularFechaCuota(fechaInicio: string, indice: number, diaDebito: number): string {
  const [y, m] = fechaInicio.split('-').map(Number)
  const fecha = new Date(y, m - 1 + indice, diaDebito)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

export async function createPlanAfip(input: z.infer<typeof createPlanSchema>) {
  await requireUser()
  const parsed = createPlanSchema.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0].message)
  const data = parsed.data

  const supabase = await createClient()
  const hoy = new Date().toISOString().split('T')[0]

  const totalAPagar = data.monto_cuota * data.cantidad_cuotas
  const intereses = totalAPagar - data.capital_financiado

  // 1) Crear plan
  const { data: plan, error: planErr } = await supabase
    .from('planes_afip')
    .insert({
      nombre: data.nombre,
      numero_plan: data.numero_plan || null,
      fecha_inicio: data.fecha_inicio,
      monto_deuda_original: data.monto_deuda_original,
      pago_contado: data.pago_contado,
      capital_financiado: data.capital_financiado,
      cantidad_cuotas: data.cantidad_cuotas,
      monto_cuota: data.monto_cuota,
      total_a_pagar: totalAPagar,
      intereses,
      dia_debito: data.dia_debito,
      cuenta_debito_id: data.cuenta_debito_id || null,
      notas: data.notas || null,
    })
    .select('id')
    .single()
  if (planErr || !plan) throw new Error(planErr?.message ?? 'Error creando plan')

  // 2) Generar cuotas
  const capitalPorCuota = Math.round((data.capital_financiado / data.cantidad_cuotas) * 100) / 100
  const interesPorCuota = Math.round((intereses / data.cantidad_cuotas) * 100) / 100
  const cuotaRows = Array.from({ length: data.cantidad_cuotas }, (_, i) => {
    const fechaVenc = calcularFechaCuota(data.fecha_inicio, i, data.dia_debito)
    const yaPaso = fechaVenc < hoy
    return {
      plan_afip_id: plan.id,
      cuota_numero: i + 1,
      total_cuotas: data.cantidad_cuotas,
      capital: capitalPorCuota,
      interes: interesPorCuota,
      monto_total: data.monto_cuota,
      fecha_vencimiento: fechaVenc,
      pagada: yaPaso,
      fecha_pago: yaPaso ? fechaVenc : null,
    }
  })
  const { error: cuotasErr } = await supabase.from('plan_afip_cuotas').insert(cuotaRows)
  if (cuotasErr) throw new Error(cuotasErr.message)

  // 3) Crear gastos de intereses (uno por cuota), categoría "Gastos Financieros"
  if (interesPorCuota > 0) {
    const gastosInteresRows = cuotaRows.map((c) => ({
      categoria: 'Gastos Financieros',
      concepto: `Interés Plan AFIP ${data.nombre} - Cuota ${c.cuota_numero}/${data.cantidad_cuotas}`,
      monto: interesPorCuota,
      monto_neto: interesPorCuota,
      moneda: 'ARS',
      negocio: 'GENERAL',
      mes: c.fecha_vencimiento.substring(0, 7),
      fecha: c.fecha_vencimiento,
      fecha_pago: c.fecha_vencimiento,
      estado: c.pagada ? 'PAGADO' : 'PENDIENTE',
      medio_pago: 'DEBITO_AUTOMATICO',
      cuenta_id: data.cuenta_debito_id || null,
      iva_incluido: false,
      porcentaje_iva: 0,
      confirmado: true,
      plan_afip_id: plan.id,
      notas: `Componente financiero del plan AFIP ${data.numero_plan ?? data.nombre}`,
    }))
    const { error: gastoIntErr } = await supabase.from('gastos').insert(gastosInteresRows)
    if (gastoIntErr) throw new Error(gastoIntErr.message)
  }

  // 4) Marcar como PAGADOS los gastos vinculados (cargas sociales cubiertas por el plan)
  if (data.gasto_ids.length > 0) {
    const { error: vincErr } = await supabase
      .from('gastos')
      .update({
        plan_afip_id: plan.id,
        estado: 'PAGADO',
        fecha_pago: data.fecha_inicio,
      })
      .in('id', data.gasto_ids)
    if (vincErr) throw new Error(vincErr.message)
  }

  revalidatePath('/finanzas/planes-afip')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
  return { id: plan.id }
}

export async function marcarCuotaPlanPagada(cuotaId: string, fechaPago?: string) {
  await requireUser()
  const supabase = await createClient()
  const fecha = fechaPago ?? new Date().toISOString().split('T')[0]
  const { error } = await supabase
    .from('plan_afip_cuotas')
    .update({ pagada: true, fecha_pago: fecha })
    .eq('id', cuotaId)
  if (error) throw new Error(error.message)

  // Buscar el gasto financiero asociado (mismo plan + mes de la cuota) y marcarlo pagado
  const { data: cuota } = await supabase
    .from('plan_afip_cuotas')
    .select('plan_afip_id, fecha_vencimiento')
    .eq('id', cuotaId)
    .single()
  if (cuota) {
    await supabase
      .from('gastos')
      .update({ estado: 'PAGADO', fecha_pago: fecha })
      .eq('plan_afip_id', cuota.plan_afip_id)
      .eq('mes', cuota.fecha_vencimiento.substring(0, 7))
      .eq('categoria', 'Gastos Financieros')
  }

  revalidatePath('/finanzas/planes-afip')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
}

export async function desmarcarCuotaPlanPagada(cuotaId: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('plan_afip_cuotas')
    .update({ pagada: false, fecha_pago: null })
    .eq('id', cuotaId)
  if (error) throw new Error(error.message)

  const { data: cuota } = await supabase
    .from('plan_afip_cuotas')
    .select('plan_afip_id, fecha_vencimiento')
    .eq('id', cuotaId)
    .single()
  if (cuota) {
    await supabase
      .from('gastos')
      .update({ estado: 'PENDIENTE', fecha_pago: cuota.fecha_vencimiento })
      .eq('plan_afip_id', cuota.plan_afip_id)
      .eq('mes', cuota.fecha_vencimiento.substring(0, 7))
      .eq('categoria', 'Gastos Financieros')
  }

  revalidatePath('/finanzas/planes-afip')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
}

export async function cancelarPlanAfip(planId: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('planes_afip')
    .update({ estado: 'CANCELADO' })
    .eq('id', planId)
  if (error) throw new Error(error.message)
  revalidatePath('/finanzas/planes-afip')
}

export async function eliminarPlanAfip(planId: string) {
  await requireUser()
  const supabase = await createClient()

  // Revertir los gastos vinculados (que se marcaron PAGADOS): los volvemos a PENDIENTE
  await supabase
    .from('gastos')
    .update({ estado: 'PENDIENTE', fecha_pago: null, plan_afip_id: null })
    .eq('plan_afip_id', planId)
    .neq('categoria', 'Gastos Financieros')

  // Borrar los gastos de intereses generados por el plan
  await supabase
    .from('gastos')
    .delete()
    .eq('plan_afip_id', planId)
    .eq('categoria', 'Gastos Financieros')

  // Borrar el plan (cuotas se borran por CASCADE)
  const { error } = await supabase
    .from('planes_afip')
    .delete()
    .eq('id', planId)
  if (error) throw new Error(error.message)

  revalidatePath('/finanzas/planes-afip')
  revalidatePath('/finanzas/pendientes')
  revalidatePath('/finanzas/gastos')
}
