import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { RecurrentesClient } from '@/components/finanzas/recurrentes-client'

// Panel "Fijos" (recurrentes = plantillas que generan gastos) del módulo Gastos.
export async function RecurrentesPanel({ mes: mesParam }: { mes?: string }) {
  const mes = mesParam ?? (await getMesActivo())
  const supabase = await createClient()

  const [{ data: recurrentes }, { data: cuentas }, { data: tarjetas }, { data: prorrateoDef }, { data: gastosMes }, { data: tiposIva }, { data: configProrrateo }] = await Promise.all([
    supabase
      .from('gastos_recurrentes')
      .select('*')
      .eq('activo', true)
      .order('concepto'),
    supabase.from('cuentas_bancarias').select('id, nombre, banco, titular:cuentas_titulares(nombre)').eq('activo', true).order('banco'),
    supabase.from('tarjetas_credito').select('id, nombre, banco').eq('activo', true).order('banco'),
    supabase.from('prorrateos_default').select('*'),
    supabase.from('gastos').select('id, recurrente_id, mes, monto, estado').eq('mes', mes),
    supabase.from('tipos_iva').select('*').eq('activo', true).order('orden'),
    supabase.from('configuracion_prorrateo').select('*').eq('activo', true).order('orden'),
  ])

  return (
    <RecurrentesClient
      mes={mes}
      recurrentes={recurrentes ?? []}
      cuentas={(cuentas ?? []) as unknown as Parameters<typeof RecurrentesClient>[0]['cuentas']}
      tarjetas={tarjetas ?? []}
      prorrateosDefault={prorrateoDef ?? []}
      gastosMes={gastosMes ?? []}
      tiposIva={tiposIva ?? []}
      configProrrateo={configProrrateo ?? []}
    />
  )
}
