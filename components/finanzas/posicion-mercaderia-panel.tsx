import { getMesActivo } from '@/lib/mes-activo'
import { composicionPosicionMercaderia } from '@/app/actions/composicion-cierre'
import { ComposicionAreaClient } from '@/components/finanzas/composicion-area-client'

// Sección individual "Posición de mercadería": composición del saldo del mes por grupo.
export async function PosicionMercaderiaPanel({ mes: mesParam }: { mes?: string }) {
  const mes = mesParam ?? (await getMesActivo())
  const secciones = await composicionPosicionMercaderia(mes)
  return (
    <ComposicionAreaClient
      mes={mes}
      titulo="Posición de mercadería"
      subtitulo="Saldo inicio (mes anterior) + compras del mes − CMV (Gestión Nube) = saldo cierre. Es un pasivo: el contra-asiento del inventario (arranque negativo)."
      secciones={secciones}
    />
  )
}
