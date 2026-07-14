import { redirect } from 'next/navigation'

// Fusionado en el módulo Socios (cuenta corriente + alta + conversión + pagos).
export default function RetirosPage() {
  redirect('/finanzas/cuenta-socios')
}
