import { createClient } from '@/lib/supabase/server'
import { armarCuentas } from '@/lib/acreedores'
import { cuentasPorAcreedor, type AcreedorCuenta } from '@/lib/acreedor-cuentas'
import { AcreedoresClient } from '@/components/finanzas/acreedores-client'

// Cuenta corriente de acreedores (server component).
//
// Trae los gastos que tienen acreedor asignado, sus pagos, los gastos SIN acreedor de los
// últimos meses (para poder sumarlos a una cuenta desde la misma pantalla) y las cuentas
// bancarias de cada acreedor — a dónde transferirle.
export async function AcreedoresPanel() {
  const supabase = await createClient()

  const desde = new Date()
  desde.setMonth(desde.getMonth() - 24)
  const mesDesde = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}`

  const [{ data: gastosCC }, { data: proveedores }, { data: cuentasBanco }, { data: sinAcreedor }, { data: cuentasDestino }] = await Promise.all([
    supabase
      .from('gastos')
      .select('id, concepto, categoria, mes, fecha, monto, moneda, estado, notas, proveedor_id')
      .not('proveedor_id', 'is', null)
      .order('mes', { ascending: true }),
    supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('cuentas_bancarias').select('id, nombre, banco, titular:cuentas_titulares(nombre)').eq('activo', true).order('banco'),
    // Candidatos para sumar a una cuenta. Ventana de 24 meses (hoy son ~600 gastos) para que la
    // lista no crezca sola con los años; solo las columnas que muestra el buscador.
    supabase
      .from('gastos')
      .select('id, concepto, mes, fecha, monto, moneda, proveedor_id')
      .is('proveedor_id', null)
      .gte('mes', mesDesde)
      .order('mes', { ascending: false })
      .limit(1500),
    // Las cuentas AJENAS: a dónde se le transfiere a cada acreedor (migración 080). Se traen
    // todas, archivadas incluidas, porque la ficha las muestra en una solapa aparte.
    supabase
      .from('acreedor_cuentas')
      .select('*')
      .order('created_at', { ascending: true }),
  ])

  // Los pagos del ledger aplicados a esos gastos: `tipo_origen='GASTO'` y `origen_id` = el gasto.
  const ids = (gastosCC ?? []).map((g) => g.id)
  const { data: pagosRaw } = ids.length
    ? await supabase
        .from('pagos')
        .select('id, origen_id, monto, fecha_emision, fecha_debito, debitado, instrumento, notas')
        .eq('tipo_origen', 'GASTO')
        .in('origen_id', ids)
        .order('fecha_emision', { ascending: true })
    : { data: [] }
  const pagos = pagosRaw ?? []

  const cuentas = armarCuentas(
    (gastosCC ?? []).map((g) => ({ ...g, monto: Number(g.monto) })),
    pagos.map((p) => ({ ...p, origen_id: p.origen_id as string, monto: Number(p.monto) })),
    proveedores ?? [],
  )

  // Agrupadas por acreedor y ya ordenadas (la sugerida primero).
  const destinoPorAcreedor = cuentasPorAcreedor((cuentasDestino ?? []) as AcreedorCuenta[])

  return (
    <AcreedoresClient
      cuentas={cuentas}
      cuentasDestino={Object.fromEntries(destinoPorAcreedor)}
      proveedores={proveedores ?? []}
      cuentasBanco={(cuentasBanco ?? []) as unknown as Parameters<typeof AcreedoresClient>[0]['cuentasBanco']}
      sinAcreedor={(sinAcreedor ?? []).map((g) => ({ ...g, monto: Number(g.monto) }))}
    />
  )
}
