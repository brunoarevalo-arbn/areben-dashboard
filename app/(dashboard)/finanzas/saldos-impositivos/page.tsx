import { redirect } from 'next/navigation'

// Fusionado en el módulo Patrimonio como pestaña "Impositivos".
export default async function SaldosImpositivosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const { mes } = await searchParams
  redirect(`/finanzas/cuentas-patrimoniales?tab=impositivos${mes ? `&mes=${mes}` : ''}`)
}
