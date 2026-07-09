import { redirect } from 'next/navigation'

// Fusionado en el módulo AFIP como pestaña "Planes de pago".
export default function PlanesAfipPage() {
  redirect('/finanzas/afip?tab=planes')
}
