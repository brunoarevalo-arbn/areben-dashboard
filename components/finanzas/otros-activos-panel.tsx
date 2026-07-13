import { getMesActivo } from '@/lib/mes-activo'
import { composicionOtrosActivos } from '@/app/actions/composicion-cierre'
import { ComposicionAreaClient } from '@/components/finanzas/composicion-area-client'

// Sección individual "Otros activos": cuentas OTRO_ACTIVO manuales (ej. depósito en garantía).
export async function OtrosActivosPanel({ mes: mesParam }: { mes?: string }) {
  const mes = mesParam ?? (await getMesActivo())
  const secciones = await composicionOtrosActivos(mes)
  return (
    <ComposicionAreaClient
      mes={mes}
      titulo="Otros activos"
      subtitulo="Activos manuales del patrimonio (ej. depósito en garantía). Saldo inicio + ajuste del mes = saldo cierre."
      secciones={secciones}
    />
  )
}
