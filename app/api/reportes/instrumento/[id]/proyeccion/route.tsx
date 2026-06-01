import { NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient, requireUser } from '@/lib/supabase/server'
import {
  ReporteProyeccionPDF,
  type ReporteProyeccionData,
  type ProyeccionMes,
} from '@/lib/pdf/reporte-proyeccion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function addMonths(dateStr: string, months: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1 + months, d)
}

function dateToYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id: instrumentoId } = await params

  const supabase = await createClient()

  // 1. Instrumento + inversor
  const { data: inst, error: errInst } = await supabase
    .from('instrumentos_inversion')
    .select(`
      id, codigo, moneda, capital_inicial, tasa_mensual, capitalizable,
      fecha_inicio, plazo_dias,
      inversor:inversores(
        nombre, tipo, dni, cuit, domicilio_calle, domicilio_ciudad,
        domicilio_provincia, domicilio_cp, email
      )
    `)
    .eq('id', instrumentoId)
    .single()

  if (errInst || !inst) {
    return new Response('Instrumento no encontrado', { status: 404 })
  }

  const inversor = Array.isArray(inst.inversor) ? inst.inversor[0] : inst.inversor
  if (!inversor) {
    return new Response('Inversor no encontrado', { status: 404 })
  }

  if (!inst.plazo_dias) {
    return new Response(
      'Este instrumento no tiene plazo definido. Editalo en /inversiones y cargá el campo "Plazo" antes de generar la proyección.',
      { status: 400 },
    )
  }

  // 2. Empresa
  const { data: empresa } = await supabase
    .from('configuracion_empresa')
    .select('*')
    .eq('id', 1)
    .single()

  if (!empresa) {
    return new Response('Falta cargar la configuración de empresa. Ingresá en /settings/empresa.', { status: 400 })
  }

  // 3. Cálculo de la proyección
  const capital = Number(inst.capital_inicial)
  const tasa = Number(inst.tasa_mensual)
  const meses = Math.round(inst.plazo_dias / 30)

  const proyeccion: ProyeccionMes[] = []
  let saldoActual = capital
  for (let i = 0; i < meses; i++) {
    const saldoInicio = saldoActual
    // Interés siempre se calcula sobre el saldo inicio del período
    const interes = Math.round(saldoInicio * tasa * 100) / 100
    // Capitalizable: el interés se suma al capital. No cap: el saldo no cambia.
    const saldoCierre = inst.capitalizable ? Math.round((saldoInicio + interes) * 100) / 100 : saldoInicio

    const inicio = addMonths(inst.fecha_inicio, i)
    const finProx = addMonths(inst.fecha_inicio, i + 1)
    const fin = new Date(finProx.getFullYear(), finProx.getMonth(), finProx.getDate() - 1)

    proyeccion.push({
      mes_num: i + 1,
      fecha_inicio: dateToYMD(inicio),
      fecha_fin: dateToYMD(fin),
      saldo_inicio: saldoInicio,
      interes_devengado: interes,
      saldo_cierre: saldoCierre,
    })

    saldoActual = saldoCierre
  }

  const totalIntereses = Math.round(proyeccion.reduce((s, p) => s + p.interes_devengado, 0) * 100) / 100
  const capitalFinal = proyeccion.length > 0 ? proyeccion[proyeccion.length - 1].saldo_cierre : capital
  const totalACobrar = inst.capitalizable ? capitalFinal : Math.round((capital + totalIntereses) * 100) / 100
  const fechaVenc = dateToYMD(addMonths(inst.fecha_inicio, meses))

  // 4. Armar data
  const data: ReporteProyeccionData = {
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
      capital_inicial: capital,
      tasa_mensual: tasa,
      capitalizable: inst.capitalizable,
      fecha_inicio: inst.fecha_inicio,
      plazo_dias: inst.plazo_dias,
      fecha_vencimiento: fechaVenc,
    },
    proyeccion,
    totales: {
      capital_inicial: capital,
      total_intereses: totalIntereses,
      capital_final: capitalFinal,
      total_a_cobrar: totalACobrar,
    },
    generadoEn: new Date().toISOString(),
  }

  const buffer = await renderToBuffer(<ReporteProyeccionPDF data={data} />)
  const slug = inversor.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const filename = `Proyeccion_${slug}_${inst.plazo_dias}dias.pdf`

  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
