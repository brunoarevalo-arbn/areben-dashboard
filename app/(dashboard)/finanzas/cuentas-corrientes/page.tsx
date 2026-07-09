import { redirect } from 'next/navigation'

// Fusionado en el módulo "Pagos y deuda" como pestaña "Cuentas corrientes".
export default function CuentasCorrientesPage() {
  redirect('/finanzas/pagos?tab=cuentas-corrientes')
}
