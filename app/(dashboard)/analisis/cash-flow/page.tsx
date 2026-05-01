import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { CashFlowClient } from '@/components/analisis/cash-flow-client'

export default async function CashFlowPage() {
  const supabase = await createClient()
  const mes = getCurrentMonth()

  const [{ data: gastos }, { data: saldo }] = await Promise.all([
    supabase.from('gastos').select('concepto, monto, estado, mes, negocio').gte('mes', mes).lte('mes', `${mes.split('-')[0]}-12`),
    supabase.from('saldos_mensuales').select('*').eq('mes', mes).maybeSingle(),
  ])

  return <CashFlowClient gastos={gastos ?? []} saldoInicial={saldo} mesPivot={mes} />
}
