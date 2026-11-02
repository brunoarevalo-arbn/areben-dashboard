import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verificarPuente } from '@/lib/puente-auth'
import { clienteDeServicio } from '@/lib/supabase/servicio'
import { aplicarAdelantosDeEmpleado } from '@/lib/adelantos'
import { saldosDeSueldos } from '@/lib/calc/adelantos'

// Puerta de servicio de los adelantos de sueldo (ver `lib/adelantos.ts`).
//
//   GET  /api/puente/adelantos                      → { empleados, aplicados, saldos }
//   POST /api/puente/adelantos  { empleado_id }     → engancha lo pendiente de ese empleado
//
// El GET es lo que el Monitor necesita para dibujar: a quién se le puede adelantar (los empleados
// activos) y cuánto de cada adelanto ya entró en una nómina, y en cuál. ⛔ Lo aplicado se lee de acá
// y no se copia al Monitor: es lo que hace que borrar una liquidación devuelva el adelanto solo.
//
// El POST lo llama el Monitor apenas confirma un adelanto: si la nómina de ese mes ya existe (se
// confirmó tarde), entra en el momento; si no, no pasa nada y entrará al liquidar.
//
// ⛔ Los sueldos en BLANCO quedan afuera de `empleados` y de `saldos` (Darío, 2-nov-2026): se pagan
// siempre desde la cuenta de la empresa, nunca con transferencias de mayoristas.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const sobre = verificarPuente(request)
  if (!sobre.ok) return NextResponse.json({ error: sobre.error }, { status: sobre.status })

  const sb = clienteDeServicio()
  const [empleados, pagos] = await Promise.all([
    sb.from('empleados').select('id, nombre, apellido, alias, cbu, banco').eq('activo', true).neq('tipo_empleado', 'BLANCO').order('nombre'),
    sb.from('pagos').select('adelanto_id, monto, origen_id').not('adelanto_id', 'is', null),
  ])
  const primerError = empleados.error ?? pagos.error
  if (primerError) return NextResponse.json({ error: primerError.message }, { status: 502 })

  const nominaIds = [...new Set((pagos.data ?? []).map((p) => p.origen_id).filter(Boolean))]
  const { data: nominas } = nominaIds.length
    ? await sb.from('nomina_mensual').select('id, mes').in('id', nominaIds)
    : { data: [] }
  const mesDe = new Map((nominas ?? []).map((n: { id: string; mes: string }) => [n.id, n.mes]))

  const nombreDe = (e: { nombre?: string | null; apellido?: string | null }) =>
    `${String(e.nombre ?? '').trim()} ${String(e.apellido ?? '').trim()}`.trim()
  const empleadosPorId = new Map((empleados.data ?? []).map((e) => [e.id, e]))

  // Si esto falla, los adelantos se siguen viendo: `saldos` llega en null y la pantalla no inventa.
  const { data: impagas, error: errorImpagas } = await sb
    .from('nomina_mensual')
    .select('id, empleado_id, mes, neto')
    .eq('estado', 'PENDIENTE')
    .in('empleado_id', [...empleadosPorId.keys()])
  const idsImpagas = (impagas ?? []).map((n) => n.id)
  const { data: pagosImpagas, error: errorPagos } = idsImpagas.length
    ? await sb.from('pagos').select('origen_id, monto').eq('tipo_origen', 'NOMINA').in('origen_id', idsImpagas)
    : { data: [], error: null }
  const pagadoDe = new Map<string, number>()
  for (const p of pagosImpagas ?? []) pagadoDe.set(p.origen_id, (pagadoDe.get(p.origen_id) ?? 0) + Number(p.monto))
  const saldos =
    errorImpagas || errorPagos
      ? null
      : saldosDeSueldos(
          (impagas ?? []).map((n) => ({
            empleado_id: n.empleado_id,
            mes: n.mes,
            neto: Number(n.neto),
            pagado: pagadoDe.get(n.id) ?? 0,
          })),
        ).map((s) => ({ ...s, nombre: nombreDe(empleadosPorId.get(s.empleado_id) ?? {}) }))

  return NextResponse.json({
    empleados: (empleados.data ?? []).map((e) => ({
      id: e.id,
      nombre: nombreDe(e),
      alias: e.alias || null,
      cbu: e.cbu || null,
      banco: e.banco || null,
    })),
    aplicados: (pagos.data ?? []).map((p) => ({
      adelanto_id: p.adelanto_id,
      monto: Number(p.monto),
      mes: mesDe.get(p.origen_id) ?? null,
    })),
    saldos,
  })
}

const cuerpo = z.object({
  empleado_id: z.uuid({ error: 'Falta de qué empleado.' }),
})

export async function POST(request: Request) {
  const sobre = verificarPuente(request)
  if (!sobre.ok) return NextResponse.json({ error: sobre.error }, { status: sobre.status })

  let datos: z.infer<typeof cuerpo>
  try {
    datos = cuerpo.parse(await request.json())
  } catch (e) {
    const detalle = e instanceof z.ZodError ? e.issues[0].message : 'El pedido no se entiende.'
    return NextResponse.json({ error: detalle }, { status: 400 })
  }

  const resultado = await aplicarAdelantosDeEmpleado(clienteDeServicio(), datos.empleado_id)
  return NextResponse.json({ ok: true, ...resultado })
}
