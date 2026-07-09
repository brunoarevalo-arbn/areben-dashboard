import { redirect } from 'next/navigation'

// Fusionado en el módulo Patrimonio como pestaña "Bienes de uso".
export default function BienesPage() {
  redirect('/finanzas/cuentas-patrimoniales?tab=bienes')
}
