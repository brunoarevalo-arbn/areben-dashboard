import { type TabItem } from '@/components/ui/tabs'
import { RetirosPanel } from '@/components/finanzas/retiros-panel'
import { CuentaSociosPanel } from '@/components/finanzas/cuenta-socios-panel'

const TABS: TabItem[] = [
  { key: 'movimientos', label: 'Movimientos' },
  { key: 'estado', label: 'Estado de cuenta' },
]

export default async function SociosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; socio?: string }>
}) {
  const params = await searchParams
  const tab = TABS.some((t) => t.key === params.tab) ? (params.tab as string) : TABS[0].key

  return (
    <div className="space-y-6">
      {tab === 'movimientos' ? <RetirosPanel /> : <CuentaSociosPanel socioInicial={params.socio} />}
    </div>
  )
}
