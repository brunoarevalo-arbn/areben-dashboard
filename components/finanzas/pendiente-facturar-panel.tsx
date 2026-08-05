import { createClient } from '@/lib/supabase/server'
import { PendienteFacturarClient } from './pendiente-facturar-client'
import type {
  FacturacionMes,
  FacturacionPeriodo,
  FacturaEmitida,
  FacturacionDetalle,
} from '@/types/database'

// Panel "Facturación" del módulo AFIP: lo cobrado en cuentas Areben durante el mes y las
// facturas que se van emitiendo contra ese saldo.
export async function PendienteFacturarPanel({ mes }: { mes: string }) {
  const supabase = await createClient()
  const [cobrado, periodo, facturas, detalle] = await Promise.all([
    supabase.from('facturacion_mes').select('*').eq('mes', mes).order('cobrado', { ascending: false }),
    supabase.from('facturacion_periodo').select('*').eq('mes', mes).maybeSingle(),
    supabase.from('facturas_emitidas').select('*').eq('mes', mes).order('fecha', { ascending: true }),
    supabase.from('facturacion_detalle').select('*').eq('mes', mes).order('tipo'),
  ])

  return (
    <PendienteFacturarClient
      mes={mes}
      cobrado={(cobrado.data ?? []) as FacturacionMes[]}
      periodo={(periodo.data as FacturacionPeriodo) ?? null}
      facturas={(facturas.data ?? []) as FacturaEmitida[]}
      detalle={(detalle.data ?? []) as FacturacionDetalle[]}
    />
  )
}
