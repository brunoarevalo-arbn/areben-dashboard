import { Tabs, type TabItem } from '@/components/ui/tabs'
import { GastosPanel } from '@/components/finanzas/gastos-panel'
import { RecurrentesPanel } from '@/components/finanzas/recurrentes-panel'

const TABS: TabItem[] = [
  { key: 'mes', label: 'Del mes' },
  { key: 'fijos', label: 'Fijos' },
]

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mes?: string; negocio?: string; estado?: string }>
}) {
  const params = await searchParams
  const tab = TABS.some((t) => t.key === params.tab) ? (params.tab as string) : TABS[0].key

  return (
    <div className="space-y-6">
      <Tabs items={TABS} activeKey={tab} />
      {tab === 'mes' ? <GastosPanel params={params} /> : <RecurrentesPanel mes={params.mes} />}
    </div>
  )
}
