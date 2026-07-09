import { Tabs, type TabItem } from '@/components/ui/tabs'
import { AfipFacturacionPanel } from '@/components/finanzas/afip-facturacion-panel'
import { PlanesAfipPanel } from '@/components/finanzas/planes-afip-panel'

const TABS: TabItem[] = [
  { key: 'facturacion', label: 'Facturación' },
  { key: 'planes', label: 'Planes de pago' },
]

export const dynamic = 'force-dynamic'

export default async function AfipPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const activo = TABS.some((t) => t.key === tab) ? (tab as string) : TABS[0].key

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg">AFIP</h1>
        <p className="text-sm text-fg-muted mt-0.5">Facturación pendiente y planes de pago</p>
      </div>

      <Tabs items={TABS} activeKey={activo} />

      {activo === 'facturacion' ? <AfipFacturacionPanel /> : <PlanesAfipPanel />}
    </div>
  )
}
