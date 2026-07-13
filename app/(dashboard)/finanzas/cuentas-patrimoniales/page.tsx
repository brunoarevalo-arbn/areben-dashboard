import { PatrimonioPanel } from '@/components/finanzas/patrimonio-panel'
import { PosicionMercaderiaPanel } from '@/components/finanzas/posicion-mercaderia-panel'
import { ActivoFijoPanel } from '@/components/finanzas/activo-fijo-panel'
import { CuentasParticularesPanel } from '@/components/finanzas/cuentas-particulares-panel'
import { OtrosActivosPanel } from '@/components/finanzas/otros-activos-panel'
import { SaldosImpositivosPanel } from '@/components/finanzas/saldos-impositivos-panel'
import { BienesPanel } from '@/components/finanzas/bienes-panel'

// La navegación entre áreas es por el sidebar (sub-ítems de Patrimonio → ?tab=…), sin barra de tabs.
export default async function PatrimonioPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mes?: string }>
}) {
  const params = await searchParams
  const tab = params.tab ?? 'tipo'

  return (
    <div className="space-y-6">
      {tab === 'mercaderia' ? (
        <PosicionMercaderiaPanel mes={params.mes} />
      ) : tab === 'activo-fijo' ? (
        <ActivoFijoPanel mes={params.mes} />
      ) : tab === 'cuentas-particulares' ? (
        <CuentasParticularesPanel mes={params.mes} />
      ) : tab === 'otros-activos' ? (
        <OtrosActivosPanel mes={params.mes} />
      ) : tab === 'impositivos' ? (
        <SaldosImpositivosPanel mes={params.mes} />
      ) : tab === 'bienes' ? (
        <BienesPanel />
      ) : (
        <PatrimonioPanel mes={params.mes} />
      )}
    </div>
  )
}
