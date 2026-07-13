import { getMesActivo } from '@/lib/mes-activo'
import { composicionActivoFijo } from '@/app/actions/composicion-cierre'
import { ComposicionAreaClient } from '@/components/finanzas/composicion-area-client'

// Sección individual "Activo fijo": arranque + gastos categoría "Inversiones" del mes.
export async function ActivoFijoPanel({ mes: mesParam }: { mes?: string }) {
  const mes = mesParam ?? (await getMesActivo())
  const secciones = await composicionActivoFijo(mes)
  return (
    <ComposicionAreaClient
      mes={mes}
      titulo="Activo fijo"
      subtitulo="Saldo inicio (arranque) + gastos con categoría “Inversiones” del mes = saldo cierre. Los gastos-inversión son capex (activo), no reducen el resultado."
      secciones={secciones}
    />
  )
}
