import { CuentaSociosPanel } from '@/components/finanzas/cuenta-socios-panel'

export default async function SociosPage({
  searchParams,
}: {
  searchParams: Promise<{ socio?: string }>
}) {
  const params = await searchParams
  return (
    <div className="space-y-6">
      <CuentaSociosPanel socioInicial={params.socio} />
    </div>
  )
}
