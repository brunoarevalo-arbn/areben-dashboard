import { redirect } from 'next/navigation'

// Reemplazado por "Cuentas corrientes" (deuda sin fecha) dentro de "Pagos y deuda".
export default function SaldosAcumuladosPage() {
  redirect('/finanzas/pagos?tab=cuentas-corrientes')
}
