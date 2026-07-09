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
      <Tabs items={TABS} activeKey={activo} />
      {activo === 'facturacion' ? <AfipFacturacionPanel /> : <PlanesAfipPanel />}
    </div>
  )
}
