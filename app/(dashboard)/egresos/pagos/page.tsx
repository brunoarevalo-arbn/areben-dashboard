import { redirect } from 'next/navigation'

// Duplicado del ledger de pagos → unificado en Finanzas › Pagos y deuda.
export default function EgresosPagosPage() {
  redirect('/finanzas/pagos')
}
