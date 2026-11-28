import { NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient, requireUser } from '@/lib/supabase/server'
import {
  ComprobanteDevolucionPDF,
  type ComprobanteDevolucionData,
  type DevolucionMes,
} from '@/lib/pdf/comprobante-devolucion'
import { detalleComprobanteDevolucion } from '@/lib/inversiones-calc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const round = (n: number) => Math.round(n * 100) / 100

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id: instrumentoId } = await params

  const supabase = await createClient()

  const { data: inst } = await supabase
    .from('instrumentos_inversion')
    .select(`
      id, codigo, moneda, capital_inicial, tasa_mensual, capitalizable,
      fecha_inicio, fecha_fin, estado, notas,
      inversor:inversores(
        nombre, tipo, dni, cuit, domicilio_calle, domicilio_ciudad,
        domicilio_provincia, domicilio_cp, email
      )
    `)
    .eq('id', instrumentoId)
    .single()

  if (!inst) return new Response('Instrumento no encontrado', { status: 404 })

  const inversor = Array.isArray(inst.inversor) ? inst.inversor[0] : inst.inversor
  if (!inversor) return new Response('Inversor no encontrado', { status: 404 })

  if (inst.estado !== 'cerrado') {
    return new Response(
      'Este instrumento todavía no está cerrado. El comprobante se emite después de devolverle la plata al inversor (botón "Devolver y cerrar").',
      { status: 400 },
    )
  }

  // Los períodos del ciclo vigente. Los meses anteriores son de ciclos ya renovados:
  // sus intereses se capitalizaron dentro del capital, no se vuelven a mostrar.
  const mesInicioCiclo = inst.fecha_inicio.substring(0, 7)
  const { data: periodos } = await supabase
    .from('periodos_instrumento')
    .select('mes, saldo_inicio, interes_devengado, movimiento, fecha_movimiento, saldo_cierre')
    .eq('instrumento_id', instrumentoId)
    .gte('mes', mesInicioCiclo)
    .order('mes', { ascending: true })

  const filas = periodos ?? []
  if (filas.length === 0) {
    return new Response('El instrumento no tiene períodos cargados en este ciclo.', { status: 400 })
  }

  // La fila del pago es la última: se llevó todo el saldo y dejó el instrumento en cero.
  const filaPago = filas[filas.length - 1]

  // Lo que se le pagó sale del movimiento que dejó "Devolver y cerrar", no de la fila del
  // mes: si ese mes además tuvo un retiro, la fila los junta y el total saldría inflado.
  const { data: movsRaw } = await supabase
    .from('movimientos_instrumento')
    .select('fecha, mes, monto, motivo, origen')
    .eq('instrumento_id', instrumentoId)
  const movDevolucion = (movsRaw ?? []).find((m) => m.origen === 'devolucion_cierre')
  const total = round(movDevolucion ? -Number(movDevolucion.monto) : -Number(filaPago.movimiento ?? 0))
  if (total <= 0) {
    return new Response(
      'No se encontró el movimiento de la devolución en este instrumento. Si se cerró a mano, volvé a abrirlo y usá "Devolver y cerrar".',
      { status: 400 },
    )
  }

  // El día del pago quedó guardado en la fila (mig 069). Los cerrados a mano antes de
  // eso no lo tienen: se cae al vencimiento, o al último día del mes del movimiento.
  const ultimoDiaDelMes = `${filaPago.mes}-${String(
    new Date(Number(filaPago.mes.split('-')[0]), Number(filaPago.mes.split('-')[1]), 0).getDate(),
  ).padStart(2, '0')}`
  const fechaPago: string = movDevolucion?.fecha ?? filaPago.fecha_movimiento ?? inst.fecha_fin ?? ultimoDiaDelMes

  // Al cerrar, fecha_fin pasa a ser el día del pago: el vencimiento pactado queda en la
  // nota que escribe "Devolver y cerrar".
  const notaCierre = (inst.notas ?? '').split('\n').reverse().find((l: string) => l.startsWith(`[${fechaPago}] Devuelto y cerrado`)) ?? ''
  const vencia = notaCierre.match(/vencía el (\d{4}-\d{2}-\d{2})/)?.[1] ?? null
  const anticipada = notaCierre.includes('anticipada') || (!!inst.fecha_fin && fechaPago < inst.fecha_fin)

  const { data: tramosTasa } = await supabase
    .from('tramos_tasa')
    .select('fecha_desde, tasa_mensual')
    .eq('instrumento_id', instrumentoId)
  const calc = detalleComprobanteDevolucion({
    capitalInicial: Number(inst.capital_inicial),
    fechaInicio: inst.fecha_inicio,
    fechaPago,
    totalPagado: total,
    movimientos: (movsRaw ?? [])
      .filter((m) => m.origen !== 'devolucion_cierre')
      .map((m) => ({ fecha: m.fecha ?? null, mes: m.mes, monto: Number(m.monto), motivo: m.motivo })),
    tramosTasa: (tramosTasa ?? []).length
      ? tramosTasa!.map((t) => ({ fecha_desde: t.fecha_desde, tasa_mensual: Number(t.tasa_mensual) }))
      : [{ fecha_desde: inst.fecha_inicio, tasa_mensual: Number(inst.tasa_mensual) }],
  })
  const { capital, intereses } = calc

  const detalle: DevolucionMes[] = []

  const { data: empresa } = await supabase
    .from('configuracion_empresa')
    .select('*')
    .eq('id', 1)
    .single()

  if (!empresa) {
    return new Response('Falta cargar la configuración de empresa. Ingresá en /settings/empresa.', { status: 400 })
  }

  const data: ComprobanteDevolucionData = {
    empresa: {
      razon_social: empresa.razon_social,
      nombre_fantasia: empresa.nombre_fantasia ?? null,
      cuit: empresa.cuit ?? null,
      condicion_iva: empresa.condicion_iva ?? null,
      domicilio_calle: empresa.domicilio_calle ?? null,
      domicilio_ciudad: empresa.domicilio_ciudad ?? null,
      domicilio_provincia: empresa.domicilio_provincia ?? null,
      domicilio_cp: empresa.domicilio_cp ?? null,
      email: empresa.email ?? null,
      telefono: empresa.telefono ?? null,
      sitio_web: empresa.sitio_web ?? null,
    },
    inversor: {
      nombre: inversor.nombre,
      tipo: inversor.tipo as 'persona_fisica' | 'empresa',
      dni: inversor.dni ?? null,
      cuit: inversor.cuit ?? null,
      domicilio_calle: inversor.domicilio_calle ?? null,
      domicilio_ciudad: inversor.domicilio_ciudad ?? null,
      domicilio_provincia: inversor.domicilio_provincia ?? null,
      domicilio_cp: inversor.domicilio_cp ?? null,
      email: inversor.email ?? null,
    },
    instrumento: {
      codigo: inst.codigo ?? null,
      moneda: inst.moneda as 'ARS' | 'USD',
      tasa_mensual: Number(inst.tasa_mensual),
      capitalizable: inst.capitalizable,
      fecha_inicio: inst.fecha_inicio,
      fecha_vencimiento: vencia ?? (anticipada ? null : inst.fecha_fin ?? null),
    },
    devolucion: { fecha_pago: fechaPago, capital, intereses, total, anticipada },
    detalle,
    movimientos: calc.movimientos,
    tramos: calc.tramos,
    generadoEn: new Date().toISOString(),
  }

  const buffer = await renderToBuffer(<ComprobanteDevolucionPDF data={data} />)

  const cleanForFilename = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_|_$/g, '')
  const ymdToDmy = (s: string) => {
    const [y, m, d] = s.split('-')
    return `${d}-${m}-${y}`
  }
  const partes = [
    'Devolucion',
    cleanForFilename(inversor.nombre),
    inst.codigo ? cleanForFilename(inst.codigo) : null,
    ymdToDmy(fechaPago),
  ].filter(Boolean)

  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${partes.join('_')}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
