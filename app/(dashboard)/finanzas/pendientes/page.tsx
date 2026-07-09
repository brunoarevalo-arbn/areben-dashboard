import { redirect } from 'next/navigation'

// Fusionado en el módulo "Pagos y deuda" como pestaña "Pendientes".
export default function PendientesPage() {
  redirect('/finanzas/pagos?tab=pendientes')
}
