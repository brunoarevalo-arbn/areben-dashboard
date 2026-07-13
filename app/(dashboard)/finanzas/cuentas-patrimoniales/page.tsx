import { Tabs, type TabItem } from '@/components/ui/tabs'
import { PatrimonioPanel } from '@/components/finanzas/patrimonio-panel'
import { PosicionMercaderiaPanel } from '@/components/finanzas/posicion-mercaderia-panel'
import { SaldosImpositivosPanel } from '@/components/finanzas/saldos-impositivos-panel'
import { BienesPanel } from '@/components/finanzas/bienes-panel'

const TABS: TabItem[] = [
  { key: 'tipo', label: 'Por tipo' },
  { key: 'mercaderia', label: 'Posición de mercadería' },
  { key: 'impositivos', label: 'Impositivos' },
  { key: 'bienes', label: 'Bienes de uso' },
]

export default async function PatrimonioPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mes?: string }>
}) {
  const params = await searchParams
  const tab = TABS.some((t) => t.key === params.tab) ? (params.tab as string) : TABS[0].key

  return (
    <div className="space-y-6">
      <Tabs items={TABS} activeKey={tab} />
      {tab === 'tipo' ? (
        <PatrimonioPanel mes={params.mes} />
      ) : tab === 'mercaderia' ? (
        <PosicionMercaderiaPanel mes={params.mes} />
      ) : tab === 'impositivos' ? (
        <SaldosImpositivosPanel mes={params.mes} />
      ) : (
        <BienesPanel />
      )}
    </div>
  )
}
