import { redirect } from 'next/navigation'

// Fusionado en el módulo Gastos como pestaña "Fijos".
export default function RecurrentesPage() {
  redirect('/finanzas/gastos?tab=fijos')
}
