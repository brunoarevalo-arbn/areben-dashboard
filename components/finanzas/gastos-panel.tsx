import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { GastosClient } from '@/components/finanzas/gastos-client'

// Panel "Del mes" del módulo Gastos (server component).
export async function GastosPanel({
  params,
}: {
  params: { mes?: string; negocio?: string; estado?: string }
}) {
  // Gastos comunes se cargan en el día → mes calendario actual
  const mes = params.mes ?? getCurrentMonth()
  const supabase = await createClient()

  let query = supabase
    .from('gastos')
    .select('*')
    .eq('mes', mes)
    .order('created_at', { ascending: false })

  if (params.negocio) query = query.eq('negocio', params.negocio)
  // El estado ahora es COMPUTADO (Vencido, Cuenta corriente, Pago programado, etc. dependen de
  // los pagos y del concepto, no del estado en la base) → se filtra íntegro client-side.

  const [{ data: gastos }, { data: categorias }, { data: cuentas }, { data: tarjetas }, { data: prorrateoDef }, { data: tiposIva }, { data: configProrrateo }, { data: recurrentes }] = await Promise.all([
    query,
    supabase.from('gastos').select('categoria').order('categoria'),
    supabase.from('cuentas_bancarias').select('id, nombre, banco, titular:cuentas_titulares(nombre)').eq('activo', true).order('banco'),
    supabase.from('tarjetas_credito').select('id, nombre, banco').eq('activo', true).order('banco'),
    supabase.from('prorrateos_default').select('*'),
    supabase.from('tipos_iva').select('*').eq('activo', true).order('orden'),
    supabase.from('configuracion_prorrateo').select('*').eq('activo', true).order('orden'),
    supabase.from('gastos_recurrentes').select('id, concepto, dia_vencimiento, tipo_mes, es_cuenta_corriente'),
  ])

  // Pagos del ledger por gasto (para el estado computado: saldo debitado + cuotas programadas).
  const gastoIds = (gastos ?? []).map((g) => g.id)
  const pagosByGasto: Record<string, { monto: number; debitado: boolean; fecha_vencimiento: string | null }[]> = {}
  if (gastoIds.length > 0) {
    const { data: pagos } = await supabase
      .from('pagos')
      .select('origen_id, monto, debitado, fecha_vencimiento')
      .eq('tipo_origen', 'GASTO')
      .in('origen_id', gastoIds)
    for (const p of pagos ?? []) {
      if (!p.origen_id) continue
      ;(pagosByGasto[p.origen_id] ??= []).push({
        monto: Number(p.monto),
        debitado: !!p.debitado,
        fecha_vencimiento: p.fecha_vencimiento ? String(p.fecha_vencimiento).slice(0, 10) : null,
      })
    }
  }

  const uniqueCategorias = [...new Set(categorias?.map((c) => c.categoria) ?? [])]

  return (
    <GastosClient
      gastos={gastos ?? []}
      mes={mes}
      categorias={uniqueCategorias}
      filtros={{ negocio: params.negocio, estado: params.estado }}
      cuentas={(cuentas ?? []) as unknown as Parameters<typeof GastosClient>[0]['cuentas']}
      tarjetas={tarjetas ?? []}
      prorrateosDefault={prorrateoDef ?? []}
      tiposIva={tiposIva ?? []}
      configProrrateo={configProrrateo ?? []}
      recurrentes={recurrentes ?? []}
      pagosByGasto={pagosByGasto}
      hoy={new Date().toISOString().slice(0, 10)}
    />
  )
}
