import { redirect } from 'next/navigation'

// Las cuentas corrientes (deuda sin fecha) ahora viven dentro de Pendientes.
export default function SaldosAcumuladosPage() {
  redirect('/finanzas/pagos?tab=pendientes')
}
