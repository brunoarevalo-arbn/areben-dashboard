import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { SaldosClient } from '@/components/finanzas/saldos-client'

export default async function SaldosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? await getMesActivo()
  const supabase = await createClient()

  // Mes anterior — para mostrar la variación de cada cuenta y cazar saldos olvidados
  const [y, m] = mes.split('-').map(Number)
  const prev = new Date(y, m - 2, 1)
  const mesAnterior = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`

  const [
    { data: titulares },
    { data: cuentas },
    { data: saldos },
    { data: saldosAnteriores },
    { data: tc },
    { data: activosManuales },
    { data: cierre },
  ] = await Promise.all([
    supabase.from('cuentas_titulares').select('*').eq('activo', true).order('nombre'),
    supabase
      .from('cuentas_bancarias')
      .select('*, titular:cuentas_titulares(*)')
      .order('banco'),
    supabase.from('saldos_cuentas').select('*').eq('mes', mes),
    supabase.from('saldos_cuentas').select('cuenta_id, saldo_ars, saldo_usd').eq('mes', mesAnterior),
    supabase.from('tipos_cambio_mes').select('*').eq('mes', mes).maybeSingle(),
    supabase
      .from('activos_manuales')
      .select('*, titular:cuentas_titulares(*)')
      .eq('mes', mes)
      .order('created_at'),
    // Si el cierre del mes está confirmado, los saldos se dan por revisados
    supabase.from('cierres_mensuales').select('cerrado').eq('mes', mes).maybeSingle(),
  ])

  return (
    <SaldosClient
      mes={mes}
      titulares={titulares ?? []}
      cuentas={cuentas ?? []}
      saldos={saldos ?? []}
      saldosAnteriores={saldosAnteriores ?? []}
      mesConfirmado={cierre?.cerrado ?? false}
      tipoCambio={tc}
      activosManuales={activosManuales ?? []}
    />
  )
}
