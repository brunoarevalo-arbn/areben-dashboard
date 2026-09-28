import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verificarPuente } from '@/lib/puente-auth'
import { clienteDeServicio } from '@/lib/supabase/servicio'
import { aplicarAdelantosDeEmpleado } from '@/lib/adelantos'

// Puerta de servicio de los adelantos de sueldo (ver `lib/adelantos.ts`).
//
//   GET  /api/puente/adelantos                      → { empleados, aplicados }
//   POST /api/puente/adelantos  { empleado_id }     → engancha lo pendiente de ese empleado
//
// El GET es lo que el Monitor necesita para dibujar: a quién se le puede adelantar (los empleados
// activos) y cuánto de cada adelanto ya entró en una nómina, y en cuál. ⛔ Lo aplicado se lee de acá
// y no se copia al Monitor: es lo que hace que borrar una liquidación devuelva el adelanto solo.
//
// El POST lo llama el Monitor apenas confirma un adelanto: si la nómina de ese mes ya existe (se
// confirmó tarde), entra en el momento; si no, no pasa nada y entrará al liquidar.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const sobre = verificarPuente(request)
  if (!sobre.ok) return NextResponse.json({ error: sobre.error }, { status: sobre.status })

  const sb = clienteDeServicio()
  const [empleados, pagos] = await Promise.all([
    sb.from('empleados').select('id, nombre, apellido, cbu, banco').eq('activo', true).order('nombre'),
    sb.from('pagos').select('adelanto_id, monto, origen_id').not('adelanto_id', 'is', null),
  ])
  const primerError = empleados.error ?? pagos.error
  if (primerError) return NextResponse.json({ error: primerError.message }, { status: 502 })

  const nominaIds = [...new Set((pagos.data ?? []).map((p) => p.origen_id).filter(Boolean))]
  const { data: nominas } = nominaIds.length
    ? await sb.from('nomina_mensual').select('id, mes').in('id', nominaIds)
    : { data: [] }
  const mesDe = new Map((nominas ?? []).map((n: { id: string; mes: string }) => [n.id, n.mes]))

  return NextResponse.json({
    empleados: (empleados.data ?? []).map((e) => ({
      id: e.id,
      nombre: `${String(e.nombre ?? '').trim()} ${String(e.apellido ?? '').trim()}`.trim(),
      cbu: e.cbu || null,
      banco: e.banco || null,
    })),
    aplicados: (pagos.data ?? []).map((p) => ({
      adelanto_id: p.adelanto_id,
      monto: Number(p.monto),
      mes: mesDe.get(p.origen_id) ?? null,
    })),
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
