import { createClient } from '@/lib/supabase/server'
import { SaldosAcumuladosClient } from '@/components/finanzas/saldos-acumulados-client'

export const dynamic = 'force-dynamic'

export default async function SaldosAcumuladosPage() {
  const supabase = await createClient()

  // Ventana: últimos 24 meses para capturar deudas viejas que se arrastran
  const desde = new Date()
  desde.setMonth(desde.getMonth() - 24)
  const desdeMes = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}`

  // Traemos solo gastos PENDIENTES con recurrente_id (son los que pertenecen a un
  // pago recurrente conocido — abogado, contador, IIBB, monotributo, etc.)
  const [{ data: gastosPendientes }, { data: recurrentes }, { data: cuentas }, { data: pagos }] = await Promise.all([
    supabase
      .from('gastos')
      .select('id, concepto, categoria, monto, monto_neto, moneda, fecha_pago, mes, estado, recurrente_id, medio_pago')
      .neq('estado', 'PAGADO')
      .not('recurrente_id', 'is', null)
      .gte('mes', desdeMes)
      .order('mes', { ascending: true })
      .limit(500),
    supabase
      .from('gastos_recurrentes')
      .select('id, concepto, categoria, monto_estimado, medio_pago, dia_vencimiento, tipo_mes')
      .eq('activo', true)
      .order('concepto'),
    supabase.from('cuentas_bancarias').select('id, nombre, banco, titular:cuentas_titulares(nombre)').eq('activo', true).order('banco'),
    // Pagos parciales que ya hay contra esos gastos (para mostrar saldo real)
    supabase.from('pagos').select('origen_id, monto').eq('tipo_origen', 'GASTO'),
  ])

  // Sumar pagos por gasto_id
  const pagosByGasto = new Map<string, number>()
  for (const p of pagos ?? []) {
    if (!p.origen_id) continue
    pagosByGasto.set(p.origen_id, (pagosByGasto.get(p.origen_id) ?? 0) + Number(p.monto))
  }

  // Filtrar gastos con saldo > 0 (los que tienen un pago parcial completo se descartan)
  const gastosConSaldo = (gastosPendientes ?? [])
    .map((g) => {
      const pagado = pagosByGasto.get(g.id) ?? 0
      const saldo = Math.max(0, Number(g.monto) - pagado)
      return { ...g, total_pagado: pagado, saldo_pendiente: saldo }
    })
    .filter((g) => g.saldo_pendiente > 0.01)

  return (
    <SaldosAcumuladosClient
      gastos={gastosConSaldo}
      recurrentes={recurrentes ?? []}
      cuentas={(cuentas ?? []) as unknown as Parameters<typeof SaldosAcumuladosClient>[0]['cuentas']}
    />
  )
}
