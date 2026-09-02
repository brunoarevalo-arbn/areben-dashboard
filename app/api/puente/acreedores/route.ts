import { NextResponse } from 'next/server'
import { verificarPuente } from '@/lib/puente-auth'
import { clienteDeServicio } from '@/lib/supabase/servicio'
import { armarCuentas } from '@/lib/acreedores'
import { cuentasPorAcreedor, type AcreedorCuenta } from '@/lib/acreedor-cuentas'
import { armarPuenteAcreedores } from '@/lib/puente-acreedores'

// Puerta de servicio: a quién le debemos, cuánto y a qué cuenta transferirle.
//
//   GET /api/puente/acreedores      header  x-puente-auth: <PUENTE_SECRET>
//
// La llama el SERVIDOR del Monitor para mostrar la cuenta corriente de los acreedores adentro del
// Monitor, sin copiar los datos: el saldo se lee, no se duplica.
//
// 🔑 **El saldo se calcula acá.** El Monitor ya lee otras tablas del dashboard directo con la
// service key (`api/_norte.js`), pero ésas son reglas guardadas; el saldo de un acreedor es una
// resta con criterios (qué pago cuenta, cuál está solo agendado, cómo se corta en cero). Si las dos
// apps la hacen por separado, el día que una cambie un criterio van a mostrar números distintos.
// Por eso la puerta devuelve el resultado y no las tablas.
//
// ⛔ Solo LEE. No escribe una fila, y por eso no chequea el mes cerrado ni toca `pagos`. La puerta
// de escritura es otra y viene después (paso 3 del planteo).
//
// Es la primera ruta `/api/` del dashboard: `proxy.ts` la deja pasar sin sesión a propósito,
// igual que a `/horas/<token>`. Quien la protege es el sobre, no la cookie.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const sobre = verificarPuente(request)
  if (!sobre.ok) {
    return NextResponse.json({ error: sobre.error }, { status: sobre.status })
  }

  try {
    const sb = clienteDeServicio()

    const [gastos, proveedores, bancarias] = await Promise.all([
      sb
        .from('gastos')
        .select('id, concepto, categoria, mes, fecha, monto, moneda, estado, notas, proveedor_id')
        .not('proveedor_id', 'is', null)
        .order('mes', { ascending: true }),
      sb.from('proveedores').select('id, nombre'),
      sb.from('acreedor_cuentas').select('*').eq('activa', true),
    ])

    const primerError = gastos.error ?? proveedores.error ?? bancarias.error
    if (primerError) {
      return NextResponse.json({ error: primerError.message }, { status: 502 })
    }

    const ids = (gastos.data ?? []).map((g) => g.id)
    // Sin gastos con acreedor no hay a quién deberle: se contesta vacío en vez de pedir `in ()`.
    const pagos = ids.length
      ? await sb
          .from('pagos')
          .select('id, origen_id, monto, fecha_emision, fecha_debito, debitado, instrumento, notas')
          .eq('tipo_origen', 'GASTO')
          .in('origen_id', ids)
      : { data: [], error: null }
    if (pagos.error) {
      return NextResponse.json({ error: pagos.error.message }, { status: 502 })
    }

    const cuentas = armarCuentas(
      (gastos.data ?? []).map((g) => ({ ...g, monto: Number(g.monto) })),
      (pagos.data ?? []).map((p) => ({
        ...p,
        origen_id: p.origen_id as string,
        monto: Number(p.monto),
      })),
      proveedores.data ?? [],
    )

    const acreedores = armarPuenteAcreedores(
      cuentas,
      cuentasPorAcreedor((bancarias.data ?? []) as AcreedorCuenta[]),
    )

    return NextResponse.json(
      { generado: new Date().toISOString(), acreedores },
      // Que no se cachee en ningún lado: el saldo cambia con cada pago y el que lo mira está
      // por decidir a quién mandarle plata.
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: detalle }, { status: 500 })
  }
}
