import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { PagosClient } from '@/components/finanzas/pagos-client'

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; tipo?: string; instrumento?: string; cuenta?: string }>
}) {
  const params = await searchParams
  const mes = params.mes ?? getCurrentMonth()

  const supabase = await createClient()

  // Rango del mes
  const desde = `${mes}-01`
  const [y, m] = mes.split('-').map(Number)
  const hasta = new Date(y, m, 0).toISOString().split('T')[0]

  let query = supabase
    .from('pagos')
    .select('*')
    .gte('fecha_emision', desde)
    .lte('fecha_emision', hasta)
    .order('fecha_emision', { ascending: false })

  if (params.tipo) query = query.eq('tipo_origen', params.tipo)
  if (params.instrumento) query = query.eq('instrumento', params.instrumento)
  if (params.cuenta) query = query.eq('cuenta_id', params.cuenta)

  const [{ data: pagos }, { data: cuentas }, { data: compras }, { data: gastos }, { data: nominas }, { data: cuotas }] = await Promise.all([
    query,
    supabase.from('cuentas_bancarias').select('id, nombre, banco, titular:cuentas_titulares(nombre)').order('banco'),
    supabase.from('compras').select('id, descripcion, proveedor:proveedores(nombre)'),
    supabase.from('gastos').select('id, concepto, categoria'),
    supabase.from('nomina_mensual').select('id, mes, empleado:empleados(nombre, apellido)'),
    supabase.from('cuotas_tarjeta').select('id, concepto, cuota_numero, cuotas_total, tarjeta:tarjetas_credito(nombre, banco)'),
  ])

  return (
    <PagosClient
      mes={mes}
      pagos={(pagos ?? []) as Parameters<typeof PagosClient>[0]['pagos']}
      filtros={{ tipo: params.tipo, instrumento: params.instrumento, cuenta: params.cuenta }}
      cuentas={cuentas ?? []}
      compras={(compras ?? []) as Parameters<typeof PagosClient>[0]['compras']}
      gastos={gastos ?? []}
      nominas={(nominas ?? []) as Parameters<typeof PagosClient>[0]['nominas']}
      cuotas={(cuotas ?? []) as Parameters<typeof PagosClient>[0]['cuotas']}
    />
  )
}
