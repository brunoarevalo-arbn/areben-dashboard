import { createClient } from '@/lib/supabase/server'
import { TarjetasClient } from '@/components/finanzas/tarjetas-client'

export const dynamic = 'force-dynamic'

export default async function TarjetasPage() {
  const supabase = await createClient()

  // Ventana últimos 12 meses para gastos/retiros con TC
  const desde = new Date()
  desde.setMonth(desde.getMonth() - 12)
  const desdeMes = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}`

  const [
    { data: tarjetas },
    { data: titulares },
    { data: cuotas },
    { data: cuentas },
    { data: gastosConTarjeta },
    { data: retirosConTarjeta },
    { data: socios },
  ] = await Promise.all([
    supabase
      .from('tarjetas_credito')
      .select('*, titular:cuentas_titulares(*), socio:socios(id, alias, nombre)')
      .order('banco'),
    supabase.from('cuentas_titulares').select('*').eq('activo', true).order('nombre'),
    supabase
      .from('cuotas_tarjeta')
      .select('*, tarjeta:tarjetas_credito(nombre, banco)')
      .order('mes_vencimiento', { ascending: true }),
    supabase.from('cuentas_bancarias').select('id, nombre, banco, titular:cuentas_titulares(nombre)').eq('activo', true).order('banco'),
    supabase
      .from('gastos')
      .select('id, concepto, categoria, monto, mes, fecha, fecha_pago, estado, tarjeta_id, notas')
      .not('tarjeta_id', 'is', null)
      .gte('mes', desdeMes)
      .order('fecha', { ascending: false }),
    supabase
      .from('retiros_socios')
      .select('id, socio, socio_id, monto_pesos, monto_usd, fecha, mes, tarjeta_id, notas')
      .not('tarjeta_id', 'is', null)
      .eq('estado', 'PAGADO')
      .gte('mes', desdeMes)
      .order('fecha', { ascending: false }),
    supabase.from('socios').select('id, alias, nombre').eq('activo', true),
  ])

  return (
    <TarjetasClient
      tarjetas={tarjetas ?? []}
      titulares={titulares ?? []}
      cuotas={cuotas ?? []}
      cuentas={(cuentas ?? []) as unknown as Parameters<typeof TarjetasClient>[0]['cuentas']}
      gastosConTarjeta={gastosConTarjeta ?? []}
      retirosConTarjeta={retirosConTarjeta ?? []}
      socios={socios ?? []}
    />
  )
}
