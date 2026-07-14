import { getVencimientosDelMes } from '@/app/actions/vencimientos'
import { getMesActivo } from '@/lib/mes-activo'
import { VencimientosClient } from '@/components/finanzas/vencimientos-client'

export default async function VencimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? (await getMesActivo())
  const grupos = await getVencimientosDelMes(mes)
  return (
    <div className="space-y-6">
      <VencimientosClient mes={mes} grupos={grupos} />
    </div>
  )
}
