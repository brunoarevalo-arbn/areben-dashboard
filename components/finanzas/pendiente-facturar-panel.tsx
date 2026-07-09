import { createClient } from '@/lib/supabase/server'
import { PendienteFacturarClient } from './pendiente-facturar-client'
import type { FacturacionMes } from '@/types/database'

// Panel "Facturación" del módulo AFIP: pendiente de facturar por cuenta Areben.
export async function PendienteFacturarPanel({ mes }: { mes: string }) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('facturacion_mes')
    .select('*')
    .eq('mes', mes)
    .order('pendiente', { ascending: false })

  return <PendienteFacturarClient facturacion={(data ?? []) as FacturacionMes[]} mes={mes} />
}
