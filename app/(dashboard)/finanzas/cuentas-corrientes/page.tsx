import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { CcManualClient } from '@/components/finanzas/cc-manual-client'

// Cuentas Corrientes manuales: deudas/pagos por cliente/proveedor sin depender de una compra.
// (La CC automática — proveedores con compras + servicios — vive en Pagos y deuda.)
export default async function CuentasCorrientesPage() {
  const supabase = await createClient()
  const mes = await getMesActivo()

  const [{ data: cuentas }, { data: movimientos }, { data: tc }] = await Promise.all([
    supabase.from('cc_cuentas').select('*').order('orden').order('nombre'),
    supabase.from('cc_movimientos').select('*').order('fecha', { ascending: false }),
    supabase.from('tipos_cambio_mes').select('tipo_cambio').eq('mes', mes).maybeSingle(),
  ])

  return (
    <CcManualClient
      cuentas={cuentas ?? []}
      movimientos={movimientos ?? []}
      tcMes={tc?.tipo_cambio ? Number(tc.tipo_cambio) : null}
    />
  )
}
