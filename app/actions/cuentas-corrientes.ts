'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const PATHS = ['/finanzas/cuentas-corrientes', '/finanzas/pagos', '/finanzas/cierre-mes', '/']
function revalidar() {
  for (const p of PATHS) revalidatePath(p)
}

// ───────────────────────── CUENTAS ─────────────────────────

export async function createCcCuenta(args: {
  nombre: string
  tipo: 'CLIENTE' | 'PROVEEDOR' | 'SERVICIO' | 'OTRO'
  naturaleza: 'COBRAR' | 'PAGAR'
  moneda: 'ARS' | 'USD'
  notas?: string | null
}) {
  await requireUser()
  if (!args.nombre?.trim()) return 'El nombre es obligatorio'
  const supabase = await createClient()
  const { error } = await supabase.from('cc_cuentas').insert({
    nombre: args.nombre.trim(),
    tipo: args.tipo,
    naturaleza: args.naturaleza,
    moneda: args.moneda,
    notas: args.notas || null,
  })
  if (error) return error.message
  revalidar()
  return null
}

export async function updateCcCuenta(id: string, args: {
  nombre: string
  tipo: 'CLIENTE' | 'PROVEEDOR' | 'SERVICIO' | 'OTRO'
  naturaleza: 'COBRAR' | 'PAGAR'
  moneda: 'ARS' | 'USD'
  notas?: string | null
}) {
  await requireUser()
  if (!args.nombre?.trim()) return 'El nombre es obligatorio'
  const supabase = await createClient()
  const { error } = await supabase.from('cc_cuentas').update({
    nombre: args.nombre.trim(),
    tipo: args.tipo,
    naturaleza: args.naturaleza,
    moneda: args.moneda,
    notas: args.notas || null,
  }).eq('id', id)
  if (error) return error.message
  revalidar()
  return null
}

export async function toggleCcCuentaActiva(id: string, activo: boolean) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('cc_cuentas').update({ activo }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidar()
}

export async function deleteCcCuenta(id: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('cc_cuentas').delete().eq('id', id) // cascade borra movimientos
  if (error) throw new Error(error.message)
  revalidar()
}

// ─────────────────────── MOVIMIENTOS ───────────────────────

/**
 * Agrega un movimiento (DEUDA sube el saldo / PAGO lo baja).
 * `monto` va en la moneda de la cuenta. Si el movimiento se hizo en otra moneda
 * (ej. pago en pesos sobre cuenta USD), pasar montoOrigen + monedaOrigen + tcAplicado
 * (el cliente ya calcula `monto` = montoOrigen / tc para USD, o × tc para ARS).
 */
export async function addCcMovimiento(args: {
  cuentaId: string
  fecha: string          // 'YYYY-MM-DD'
  tipo: 'DEUDA' | 'PAGO'
  concepto?: string | null
  monto: number          // en moneda de la cuenta, positivo
  montoOrigen?: number | null
  monedaOrigen?: 'ARS' | 'USD' | null
  tcAplicado?: number | null
}) {
  await requireUser()
  const monto = Math.abs(Number(args.monto) || 0)
  if (monto <= 0) return 'El monto debe ser mayor a cero'
  const supabase = await createClient()
  const { error } = await supabase.from('cc_movimientos').insert({
    cuenta_id: args.cuentaId,
    fecha: args.fecha,
    mes: args.fecha.slice(0, 7),
    tipo: args.tipo,
    concepto: args.concepto || null,
    monto,
    monto_origen: args.montoOrigen ?? null,
    moneda_origen: args.monedaOrigen ?? null,
    tc_aplicado: args.tcAplicado ?? null,
  })
  if (error) return error.message
  revalidar()
  return null
}

export async function deleteCcMovimiento(id: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('cc_movimientos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidar()
}
