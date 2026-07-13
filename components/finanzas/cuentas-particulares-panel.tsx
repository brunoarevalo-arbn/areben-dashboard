import { getMesActivo } from '@/lib/mes-activo'
import { composicionCuentasParticulares } from '@/app/actions/composicion-cierre'
import { ComposicionAreaClient } from '@/components/finanzas/composicion-area-client'

// Sección individual "Cuentas particulares": arranque + retiros dolarizados del socio del mes.
export async function CuentasParticularesPanel({ mes: mesParam }: { mes?: string }) {
  const mes = mesParam ?? (await getMesActivo())
  const secciones = await composicionCuentasParticulares(mes)
  return (
    <ComposicionAreaClient
      mes={mes}
      titulo="Cuentas particulares"
      subtitulo="Saldo inicio (arranque) + retiros dolarizados del socio del mes = saldo cierre. Los retiros se dolarizan al cerrar el mes."
      secciones={secciones}
    />
  )
}
