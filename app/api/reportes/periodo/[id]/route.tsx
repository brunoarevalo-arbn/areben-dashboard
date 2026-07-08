import { NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient, requireUser } from '@/lib/supabase/server'
import { ReportePeriodoPDF, type ReportePeriodoData } from '@/lib/pdf/reporte-periodo'

// Forzar runtime Node (react-pdf no funciona en edge)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id: periodoId } = await params

  const supabase = await createClient()

  // 1. Cargar período + instrumento + inversor
  const { data: periodo, error } = await supabase
    .from('periodos_instrumento')
    .select(`
      id, mes, saldo_inicio, interes_devengado, movimiento, saldo_cierre,
      cerrado, fecha_cierre,
      instrumento:instrumentos_inversion(
        id, codigo, moneda, capital_inicial, capitalizable, tipo,
        fecha_inicio, acreedor_nombre, tasa_mensual,
        inversor:inversores(nombre, tipo)
      )
    `)
    .eq('id', periodoId)
    .single()

  if (error || !periodo) {
    return new Response('Período no encontrado', { status: 404 })
  }

  const inst = Array.isArray(periodo.instrumento) ? periodo.instrumento[0] : periodo.instrumento
  if (!inst) {
    return new Response('Instrumento no encontrado', { status: 404 })
  }

  const inversor = Array.isArray(inst.inversor) ? inst.inversor[0] : inst.inversor
  if (!inversor) {
    return new Response('Inversor no encontrado', { status: 404 })
  }

  // 2. Buscar tramo de tasa aplicable al mes del período (la más reciente con fecha_desde <= último día del mes)
  const [yStr, mStr] = periodo.mes.split('-')
  const ultimoDia = new Date(Number(yStr), Number(mStr), 0).getDate()
  const fechaCorte = `${periodo.mes}-${String(ultimoDia).padStart(2, '0')}`

  const { data: tramos } = await supabase
    .from('tramos_tasa')
    .select('tasa_mensual, fecha_desde')
    .eq('instrumento_id', inst.id)
    .lte('fecha_desde', fechaCorte)
    .order('fecha_desde', { ascending: false })
    .limit(1)

  const tasaAplicada = tramos && tramos.length > 0
    ? Number(tramos[0].tasa_mensual)
    : Number(inst.tasa_mensual)

  // 3. Buscar gasto auto-generado de este período (si existe)
  const { data: gasto } = await supabase
    .from('gastos')
    .select('id, monto, moneda, monto_origen, moneda_origen, tipo_cambio_aplicado, estado')
    .eq('periodo_instrumento_id', periodoId)
    .maybeSingle()

  // 4. Armar el shape para el componente
  const data: ReportePeriodoData = {
    inversor: {
      nombre: inversor.nombre,
      tipo: inversor.tipo as 'persona_fisica' | 'empresa',
    },
    instrumento: {
      id: inst.id,
      codigo: inst.codigo,
      moneda: inst.moneda as 'ARS' | 'USD',
      capital_inicial: Number(inst.capital_inicial),
      capitalizable: inst.capitalizable,
      tipo: (inst.tipo ?? 'INVERSION_PRIVADA') as 'INVERSION_PRIVADA' | 'CREDITO_BANCARIO',
      fecha_inicio: inst.fecha_inicio,
      acreedor_nombre: inst.acreedor_nombre,
    },
    periodo: {
      id: periodo.id,
      mes: periodo.mes,
      saldo_inicio: Number(periodo.saldo_inicio),
      interes_devengado: Number(periodo.interes_devengado),
      movimiento: Number(periodo.movimiento ?? 0),
      saldo_cierre: Number(periodo.saldo_cierre),
      cerrado: periodo.cerrado,
      fecha_cierre: periodo.fecha_cierre,
    },
    gasto: gasto
      ? {
          id: gasto.id,
          monto: Number(gasto.monto),
          moneda: gasto.moneda as 'ARS' | 'USD',
          monto_origen: gasto.monto_origen !== null ? Number(gasto.monto_origen) : null,
          moneda_origen: (gasto.moneda_origen ?? null) as 'ARS' | 'USD' | null,
          tipo_cambio_aplicado: gasto.tipo_cambio_aplicado !== null ? Number(gasto.tipo_cambio_aplicado) : null,
          estado: gasto.estado as 'PENDIENTE' | 'PAGADO' | 'VENCIDO' | 'DEVENGADO',
        }
      : null,
    tasa_aplicada: tasaAplicada,
    generadoEn: new Date().toISOString(),
  }

  // 5. Renderizar a PDF
  const buffer = await renderToBuffer(<ReportePeriodoPDF data={data} />)

  // Nombre del archivo: Reporte_<acreedor>_<mes>.pdf
  const acreedor = data.instrumento.tipo === 'CREDITO_BANCARIO' && data.instrumento.acreedor_nombre
    ? data.instrumento.acreedor_nombre
    : data.inversor.nombre
  const slug = acreedor.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const filename = `Reporte_${slug}_${periodo.mes}.pdf`

  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
