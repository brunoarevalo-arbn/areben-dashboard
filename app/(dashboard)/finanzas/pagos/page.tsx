import { type TabItem } from '@/components/ui/tabs'
import { PagosPanel } from '@/components/finanzas/pagos-panel'
import { PendientesPanel } from '@/components/finanzas/pendientes-panel'
import { CuentasCorrientesPanel } from '@/components/finanzas/cuentas-corrientes-panel'

const TABS: TabItem[] = [
  { key: 'pagos', label: 'Pagos del mes' },
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'cuentas-corrientes', label: 'Cuentas corrientes' },
]

export default async function PagosYDeudaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mes?: string; tipo?: string; instrumento?: string; cuenta?: string }>
}) {
  const params = await searchParams
  const tab = TABS.some((t) => t.key === params.tab) ? (params.tab as string) : TABS[0].key

  return (
    <div className="space-y-6">
      {tab === 'pagos' ? (
        <PagosPanel params={params} />
      ) : tab === 'pendientes' ? (
        <PendientesPanel />
      ) : (
        <CuentasCorrientesPanel />
      )}
    </div>
  )
}
