import { createClient } from '@/lib/supabase/server'
import { getCurrentMonth } from '@/lib/utils'
import { PagosClient } from '@/components/finanzas/pagos-client'

// Panel "Pagos del mes" del módulo Pagos y deuda (ledger de salidas de caja del mes).
export async function PagosPanel({
  params,
}: {
  params: { mes?: string; tipo?: string; instrumento?: string; cuenta?: string }
}) {
  const mes = params.mes ?? getCurrentMonth()
  const supabase = await createClient()

  // Se traen TODOS los pagos (dataset chico) y el filtrado por mes/tipo/instrumento/cuenta
  // + búsqueda global se hace client-side, para poder buscar en todos los meses a la vez.
  const query = supabase
    .from('pagos')
    .select('*')
    .order('fecha_emision', { ascending: false })

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
