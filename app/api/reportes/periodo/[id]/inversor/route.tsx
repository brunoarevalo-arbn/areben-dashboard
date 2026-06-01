import { NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient, requireUser } from '@/lib/supabase/server'
import { ReporteInversorPDF, type ReporteInversorData } from '@/lib/pdf/reporte-periodo-inversor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id: periodoId } = await params

  const supabase = await createClient()

  // 1. Datos del período + instrumento + inversor (con datos formales nuevos)
  const { data: periodo, error } = await supabase
    .from('periodos_instrumento')
    .select(`
      id, mes, saldo_inicio, interes_devengado, movimiento, saldo_cierre,
      instrumento:instrumentos_inversion(
        id, codigo, moneda, capitalizable, tipo, fecha_inicio, tasa_mensual,
        inversor:inversores(
          nombre, tipo, dni, cuit, domicilio_calle, domicilio_ciudad,
          domicilio_provincia, domicilio_cp, email
        )
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

  // 2. Datos de la empresa (singleton)
  const { data: empresa } = await supabase
    .from('configuracion_empresa')
    .select('*')
    .eq('id', 1)
    .single()

  if (!empresa) {
    return new Response('Falta cargar la configuración de empresa. Ingresá en /settings/empresa.', { status: 400 })
  }

  // 3. Tasa aplicada (mismo cálculo que el reporte interno)
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

  // 4. Armar shape para el componente
  const data: ReporteInversorData = {
    empresa: {
      razon_social: empresa.razon_social,
      nombre_fantasia: empresa.nombre_fantasia ?? null,
      cuit: empresa.cuit ?? null,
      condicion_iva: empresa.condicion_iva ?? null,
      domicilio_calle: empresa.domicilio_calle ?? null,
      domicilio_ciudad: empresa.domicilio_ciudad ?? null,
      domicilio_provincia: empresa.domicilio_provincia ?? null,
      domicilio_cp: empresa.domicilio_cp ?? null,
      domicilio_pais: empresa.domicilio_pais ?? null,
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
      capitalizable: inst.capitalizable,
      tipo: (inst.tipo ?? 'INVERSION_PRIVADA') as 'INVERSION_PRIVADA' | 'CREDITO_BANCARIO',
      fecha_inicio: inst.fecha_inicio,
    },
    periodo: {
      mes: periodo.mes,
      saldo_inicio: Number(periodo.saldo_inicio),
      interes_devengado: Number(periodo.interes_devengado),
      movimiento: Number(periodo.movimiento ?? 0),
      saldo_cierre: Number(periodo.saldo_cierre),
    },
    tasa_aplicada: tasaAplicada,
    generadoEn: new Date().toISOString(),
  }

  const buffer = await renderToBuffer(<ReporteInversorPDF data={data} />)

  // Filename: Comprobante_<Nombre>_<Codigo>_<fechaInicio>_<fechaFin>.pdf
  const cleanForFilename = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '') // sacar acentos
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_|_$/g, '')
  const partes = [
    'Comprobante',
    cleanForFilename(inversor.nombre),
    inst.codigo ? cleanForFilename(inst.codigo) : null,
    `${periodo.mes}-01`,
    fechaCorte,
  ].filter(Boolean)
  const filename = `${partes.join('_')}.pdf`

  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
