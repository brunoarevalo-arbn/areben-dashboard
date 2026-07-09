import { type TabItem } from '@/components/ui/tabs'
import { getMesActivo } from '@/lib/mes-activo'
import { PendienteFacturarPanel } from '@/components/finanzas/pendiente-facturar-panel'
import { PlanesAfipPanel } from '@/components/finanzas/planes-afip-panel'

const TABS: TabItem[] = [
  { key: 'facturacion', label: 'Facturación' },
  { key: 'planes', label: 'Planes de pago' },
]

export const dynamic = 'force-dynamic'

export default async function AfipPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mes?: string }>
}) {
  const params = await searchParams
  const activo = TABS.some((t) => t.key === params.tab) ? (params.tab as string) : TABS[0].key
  const mes = params.mes ?? (await getMesActivo())

  return (
    <div className="space-y-6">
      {activo === 'facturacion' ? <PendienteFacturarPanel mes={mes} /> : <PlanesAfipPanel />}
    </div>
  )
}
