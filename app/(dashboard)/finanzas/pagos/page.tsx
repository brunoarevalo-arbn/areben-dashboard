import { type TabItem } from '@/components/ui/tabs'
import { PagosPanel } from '@/components/finanzas/pagos-panel'
import { PendientesPanel } from '@/components/finanzas/pendientes-panel'

// Las cuentas corrientes (deuda sin fecha fija) ya no son una pestaña aparte:
// viven dentro de Pendientes, en su propio desplegable "Cuenta corriente".
const TABS: TabItem[] = [
  { key: 'pagos', label: 'Pagos del mes' },
  { key: 'pendientes', label: 'Pendientes' },
]

export default async function PagosYDeudaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mes?: string; tipo?: string; instrumento?: string; cuenta?: string }>
}) {
  const params = await searchParams
  // 'cuentas-corrientes' es un tab histórico → cae a Pendientes (donde ahora viven las CC).
  const tab = TABS.some((t) => t.key === params.tab) ? (params.tab as string) : TABS[0].key

  return (
    <div className="space-y-6">
      {tab === 'pagos' ? (
        <PagosPanel params={params} />
      ) : (
        <PendientesPanel />
      )}
    </div>
  )
}
