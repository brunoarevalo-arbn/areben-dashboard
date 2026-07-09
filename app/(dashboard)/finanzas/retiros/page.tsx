import { redirect } from 'next/navigation'

// Fusionado en el módulo Socios como pestaña "Movimientos".
export default function RetirosPage() {
  redirect('/finanzas/cuenta-socios?tab=movimientos')
}
