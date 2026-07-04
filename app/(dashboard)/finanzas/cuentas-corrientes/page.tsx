import { createClient } from '@/lib/supabase/server'
import { CuentasCorrientesClient } from '@/components/finanzas/cuentas-corrientes-client'

// Cuentas corrientes = saldo por proveedor/servicio (gastos recurrentes):
// devengado (lo que se cargó) − pagado (lo que se abonó) = saldo que se debe.
// A diferencia de "Pendientes", acá no importa la fecha de pago: es el running
// total de cuánto se le debe a cada uno.
export default async function CuentasCorrientesPage() {
  const supabase = await createClient()

  const [{ data: gastos }, { data: pagos }] = await Promise.all([
    supabase
      .from('gastos')
      .select('id, concepto, monto, mes, estado, moneda, recurrente_id, recurrente:gastos_recurrentes(concepto, activo)')
      .not('recurrente_id', 'is', null)
      .order('mes', { ascending: true }),
    supabase
      .from('pagos')
      .select('origen_id, monto, fecha_emision')
      .eq('tipo_origen', 'GASTO'),
  ])

  // Pagos acumulados por gasto + fecha del último pago
  const pagadoByGasto = new Map<string, number>()
  const ultimoPagoByGasto = new Map<string, string>()
  for (const p of pagos ?? []) {
    if (!p.origen_id) continue
    pagadoByGasto.set(p.origen_id, (pagadoByGasto.get(p.origen_id) ?? 0) + Number(p.monto))
    if (p.fecha_emision) {
      const prev = ultimoPagoByGasto.get(p.origen_id)
      if (!prev || p.fecha_emision > prev) ultimoPagoByGasto.set(p.origen_id, p.fecha_emision)
    }
  }

  type Detalle = { id: string; mes: string; monto: number; pagado: number; saldo: number; estado: string }
  type Cuenta = {
    recurrente_id: string
    nombre: string
    activo: boolean
    moneda: 'ARS' | 'USD'
    devengado: number
    pagado: number
    saldo: number
    ultimoPago: string | null
    detalles: Detalle[]
  }

  const grupos = new Map<string, Cuenta>()
  for (const g of gastos ?? []) {
    const rid = g.recurrente_id as string
    const rec = (Array.isArray(g.recurrente) ? g.recurrente[0] : g.recurrente) as { concepto?: string; activo?: boolean } | null
    const pagado = pagadoByGasto.get(g.id) ?? 0
    const saldo = Number(g.monto) - pagado

    if (!grupos.has(rid)) {
      grupos.set(rid, {
        recurrente_id: rid,
        nombre: rec?.concepto ?? g.concepto,
        activo: rec?.activo ?? true,
        moneda: (g.moneda ?? 'ARS') as 'ARS' | 'USD',
        devengado: 0,
        pagado: 0,
        saldo: 0,
        ultimoPago: null,
        detalles: [],
      })
    }
    const grp = grupos.get(rid)!
    grp.devengado += Number(g.monto)
    grp.pagado += pagado
    grp.saldo += saldo
    const up = ultimoPagoByGasto.get(g.id)
    if (up && (!grp.ultimoPago || up > grp.ultimoPago)) grp.ultimoPago = up
    grp.detalles.push({ id: g.id, mes: g.mes, monto: Number(g.monto), pagado, saldo, estado: g.estado })
  }

  // Solo los que tienen saldo pendiente, ordenados por lo que más se debe.
  const cuentas = Array.from(grupos.values())
    .filter((c) => Math.round(c.saldo) > 0)
    .sort((a, b) => b.saldo - a.saldo)

  return <CuentasCorrientesClient cuentas={cuentas} />
}
