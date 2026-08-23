import type { Metadata } from 'next'
import { estadoPorToken } from '@/app/actions/horas-publicas'
import { CargaHorasClient } from '@/components/horas/carga-horas-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Cargar horas extras',
  // El link se comparte por WhatsApp: que no lo indexe nadie.
  robots: { index: false, follow: false },
}

export default async function CargaHorasPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const estado = await estadoPorToken(token)

  // Token inexistente, revocado, o empleado dado de baja. No es un 404 ni una vuelta al
  // login: del otro lado hay alguien esperando cargar sus horas, y necesita saber qué hacer.
  if (!estado) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 bg-bg">
        <div className="w-full max-w-sm text-center space-y-3">
          <h1 className="text-lg font-semibold text-fg">Este link ya no está activo</h1>
          <p className="text-sm text-fg-muted">
            Pedile uno nuevo a administración y volvé a intentar.
          </p>
        </div>
      </main>
    )
  }

  return <CargaHorasClient token={token} estado={estado} />
}
