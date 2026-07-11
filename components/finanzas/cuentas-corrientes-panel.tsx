import { createClient } from '@/lib/supabase/server'
import { CuentasCorrientesClient } from '@/components/finanzas/cuentas-corrientes-client'
import { CC_SERVICIOS, CC_GASTOS } from '@/lib/cuentas-corrientes'

// Cuentas corrientes = todo lo que se debe SIN fecha fija de pago, de tres fuentes:
//  1) Servicios recurrentes marcados como CC (lista curada — ver lib/cuentas-corrientes).
//  2) Proveedores con saldo pendiente sin plan de pago con fecha (cuenta corriente).
//  3) Gastos sueltos marcados como CC (lista curada, ej. deudas a proveedores de servicios).
// Lo que tiene fecha fija (cuotas, cheques, cta cte con vencimiento) va a Pendientes, no acá.

type Detalle = { label: string; saldo: number }
type Cuenta = {
  key: string
  nombre: string
  tipo: 'Servicio' | 'Proveedor' | 'Otro'
  moneda: 'ARS' | 'USD'
  devengado: number | null
  pagado: number | null
  saldo: number
  ultimoPago: string | null
  detalles: Detalle[]
}

export async function CuentasCorrientesPanel() {
  const supabase = await createClient()

  const [{ data: gastos }, { data: pagosGasto }, { data: compras }, { data: pagosCompra }] = await Promise.all([
    supabase
      .from('gastos')
      .select('id, concepto, monto, mes, moneda, recurrente_id, recurrente:gastos_recurrentes(concepto)'),
    supabase
      .from('pagos')
      .select('origen_id, monto, fecha_emision')
      .eq('tipo_origen', 'GASTO'),
    supabase
      .from('compras')
      .select('id, descripcion, fecha, saldo_pendiente, moneda, proveedor:proveedores(nombre)')
      .gt('saldo_pendiente', 0)
      .neq('estado', 'PAGADO'),
    supabase
      .from('pagos')
      .select('compra_id, fecha_vencimiento, acreditado')
      .eq('tipo_origen', 'COMPRA'),
  ])

  // Pagos acumulados por gasto + último pago
  const pagadoByGasto = new Map<string, number>()
  const ultimoPagoByGasto = new Map<string, string>()
  for (const p of pagosGasto ?? []) {
    if (!p.origen_id) continue
    pagadoByGasto.set(p.origen_id, (pagadoByGasto.get(p.origen_id) ?? 0) + Number(p.monto))
    if (p.fecha_emision) {
      const prev = ultimoPagoByGasto.get(p.origen_id)
      if (!prev || p.fecha_emision > prev) ultimoPagoByGasto.set(p.origen_id, p.fecha_emision)
    }
  }

  const cuentas: Cuenta[] = []

  // 1) Servicios recurrentes (curados) — saldo = devengado − pagado
  const servMap = new Map<string, Cuenta>()
  for (const g of gastos ?? []) {
    if (!g.recurrente_id) continue
    const rec = (Array.isArray(g.recurrente) ? g.recurrente[0] : g.recurrente) as { concepto?: string } | null
    const nombre = rec?.concepto ?? g.concepto
    if (!CC_SERVICIOS.has(nombre)) continue
    const pagado = pagadoByGasto.get(g.id) ?? 0
    const saldo = Number(g.monto) - pagado
    if (!servMap.has(g.recurrente_id)) {
      servMap.set(g.recurrente_id, {
        key: `serv-${g.recurrente_id}`, nombre, tipo: 'Servicio',
        moneda: (g.moneda ?? 'ARS') as 'ARS' | 'USD',
        devengado: 0, pagado: 0, saldo: 0, ultimoPago: null, detalles: [],
      })
    }
    const c = servMap.get(g.recurrente_id)!
    c.devengado! += Number(g.monto)
    c.pagado! += pagado
    c.saldo += saldo
    const up = ultimoPagoByGasto.get(g.id)
    if (up && (!c.ultimoPago || up > c.ultimoPago)) c.ultimoPago = up
    c.detalles.push({ label: g.mes, saldo })
  }
  cuentas.push(...servMap.values())

  // 2) Gastos sueltos marcados CC (curados)
  const otrosMap = new Map<string, Cuenta>()
  for (const g of gastos ?? []) {
    if (g.recurrente_id) continue
    if (!CC_GASTOS.has(g.concepto)) continue
    const pagado = pagadoByGasto.get(g.id) ?? 0
    const saldo = Number(g.monto) - pagado
    const key = `otro-${g.concepto}`
    if (!otrosMap.has(key)) {
      otrosMap.set(key, {
        key, nombre: g.concepto, tipo: 'Otro',
        moneda: (g.moneda ?? 'ARS') as 'ARS' | 'USD',
        devengado: null, pagado: null, saldo: 0,
        ultimoPago: ultimoPagoByGasto.get(g.id) ?? null, detalles: [],
      })
    }
    const c = otrosMap.get(key)!
    c.saldo += saldo
    c.detalles.push({ label: g.mes, saldo })
  }
  cuentas.push(...otrosMap.values())

  // 3) Proveedores con saldo pendiente SIN fecha de pago (sin pago programado con vencimiento)
  const comprasConFecha = new Set<string>()
  for (const p of pagosCompra ?? []) {
    if (p.compra_id && !p.acreditado && p.fecha_vencimiento) comprasConFecha.add(p.compra_id)
  }
  const provMap = new Map<string, Cuenta>()
  for (const c of compras ?? []) {
    if (comprasConFecha.has(c.id)) continue // tiene fecha → va a Pendientes
    const prov = (Array.isArray(c.proveedor) ? c.proveedor[0] : c.proveedor) as { nombre?: string } | null
    const nombre = prov?.nombre ?? 'Proveedor s/d'
    const key = `prov-${nombre}`
    if (!provMap.has(key)) {
      provMap.set(key, {
        key, nombre, tipo: 'Proveedor',
        moneda: (c.moneda ?? 'ARS') as 'ARS' | 'USD',
        devengado: null, pagado: null, saldo: 0, ultimoPago: null, detalles: [],
      })
    }
    const cc = provMap.get(key)!
    cc.saldo += Number(c.saldo_pendiente)
    cc.detalles.push({ label: c.descripcion ?? 'Compra', saldo: Number(c.saldo_pendiente) })
  }
  cuentas.push(...provMap.values())

  const visibles = cuentas
    .filter((c) => Math.round(c.saldo) > 0)
    .sort((a, b) => b.saldo - a.saldo)

  return <CuentasCorrientesClient cuentas={visibles} />
}
