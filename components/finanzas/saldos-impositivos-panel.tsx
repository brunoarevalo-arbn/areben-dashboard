import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { SaldosImpositivosClient } from '@/components/finanzas/saldos-impositivos-client'

// Panel "Impositivos" del módulo Patrimonio (cuentas patrimoniales tipo IMPOSITIVO).
export async function SaldosImpositivosPanel({ mes: mesParam }: { mes?: string }) {
  const mes = mesParam ?? (await getMesActivo())
  const supabase = await createClient()

  // Mes anterior — los saldos impositivos casi no se mueven, así que la variación
  // sirve sobre todo para notar el mes que quedó sin cargar.
  const [y, m] = mes.split('-').map(Number)
  const prev = new Date(y, m - 2, 1)
  const mesAnterior = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`

  const [{ data: cuentas }, { data: saldos }, { data: saldosAnteriores }, { data: cierre }] = await Promise.all([
    supabase
      .from('cuentas_patrimoniales')
      .select('*')
      .eq('tipo', 'IMPOSITIVO')
      .order('orden')
      .order('nombre'),
    supabase.from('saldos_cuentas_patrim').select('*').eq('mes', mes),
    supabase.from('saldos_cuentas_patrim').select('cuenta_id, saldo_cierre').eq('mes', mesAnterior),
    supabase.from('cierres_mensuales').select('cerrado').eq('mes', mes).maybeSingle(),
  ])

  return (
    <SaldosImpositivosClient
      mes={mes}
      cuentas={cuentas ?? []}
      saldos={saldos ?? []}
      saldosAnteriores={saldosAnteriores ?? []}
      mesConfirmado={cierre?.cerrado ?? false}
    />
  )
}
