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

function addDays(dateStr: string, days: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d + days)
}

function diffDays(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / 86_400_000)
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
      fecha_inicio, fecha_fin, plazo_dias,
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

  // La proyección se guía por la fecha de fin (vencimiento) real del instrumento.
  // Si no está cargada, se cae al plazo en días como respaldo.
  if (!inst.fecha_fin && !inst.plazo_dias) {
    return new Response(
      'Este instrumento no tiene fecha de vencimiento ni plazo definido. Editalo en /inversiones y cargá la fecha de vencimiento (o el campo "Plazo") antes de generar la proyección.',
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
  //
  // Se recorre el plazo REAL (fecha_inicio → fecha_inicio + plazo_dias) armando un tramo
  // por cada mes calendario que entra completo, más un último tramo PRORRATEADO por los
  // días sueltos que sobran. Así un plazo de 15 días muestra ~medio mes de interés y el
  // vencimiento correcto, 45 días = 1 mes + 15 días, y 30/90 días quedan igual que antes.
  // El prorrateo por días es consistente con el motor de períodos.
  const capital = Number(inst.capital_inicial)
  const tasa = Number(inst.tasa_mensual)
  // Vencimiento real: la fecha de fin acordada manda; si falta, se usa inicio + plazo_dias.
  const fechaVencDate = inst.fecha_fin
    ? addDays(inst.fecha_fin, 0)
    : addDays(inst.fecha_inicio, inst.plazo_dias!)
  // Plazo en días para mostrar/nombrar el archivo (derivado de las fechas si no está cargado).
  const plazoDias = inst.plazo_dias ?? diffDays(addDays(inst.fecha_inicio, 0), fechaVencDate)

  const proyeccion: ProyeccionMes[] = []
  let saldoCapital = capital  // capital "vivo": en cap. crece, en no cap. queda fijo
  let interesesAcumulados = 0  // sólo se usa visualmente para no cap. — total adeudado al inversor

  let cursorStr = inst.fecha_inicio
  let mesNum = 0
  // Tope de seguridad por si algún dato quedara inconsistente (plazos hasta ~10 años).
  while (mesNum < 130) {
    const cursorDate = addDays(cursorStr, 0)
    if (cursorDate.getTime() >= fechaVencDate.getTime()) break
    mesNum++

    const proxMesDate = addMonths(cursorStr, 1)
    const finTramoDate = proxMesDate.getTime() < fechaVencDate.getTime() ? proxMesDate : fechaVencDate
    const diasTramo = diffDays(cursorDate, finTramoDate)
    const diasMesCompleto = diffDays(cursorDate, proxMesDate)
    const fraccion = diasMesCompleto > 0 ? diasTramo / diasMesCompleto : 1 // 1 = mes entero

    const saldoInicio = saldoCapital
    const interes = Math.round(saldoInicio * tasa * fraccion * 100) / 100
    interesesAcumulados = Math.round((interesesAcumulados + interes) * 100) / 100

    // saldo_cierre del PDF = monto TOTAL adeudado al inversor al cierre de este tramo.
    // - Capitalizable: capital reinvertido = saldoInicio + interés (el capital crece).
    // - No capitalizable: capital fijo + suma de intereses devengados hasta esta fecha.
    const saldoCierre = inst.capitalizable
      ? Math.round((saldoInicio + interes) * 100) / 100
      : Math.round((capital + interesesAcumulados) * 100) / 100

    // Fecha fin mostrada = último día del tramo (el día previo al inicio del siguiente).
    const finDisplay = new Date(finTramoDate.getFullYear(), finTramoDate.getMonth(), finTramoDate.getDate() - 1)

    proyeccion.push({
      mes_num: mesNum,
      fecha_inicio: dateToYMD(cursorDate),
      fecha_fin: dateToYMD(finDisplay),
      saldo_inicio: saldoInicio,
      interes_devengado: interes,
      saldo_cierre: saldoCierre,
    })

    // Sólo en capitalizable el capital crece para el próximo tramo.
    if (inst.capitalizable) saldoCapital = saldoCierre
    cursorStr = dateToYMD(finTramoDate)
  }

  const totalIntereses = interesesAcumulados
  // Capital al cierre técnico: capitalizable → último saldo de capital. No cap → capital fijo.
  const capitalFinal = inst.capitalizable
    ? (proyeccion.length > 0 ? proyeccion[proyeccion.length - 1].saldo_cierre : capital)
    : capital
  // Total que efectivamente cobra el inversor al vencimiento.
  const totalACobrar = inst.capitalizable
    ? capitalFinal
    : Math.round((capital + totalIntereses) * 100) / 100
  const fechaVenc = dateToYMD(fechaVencDate)

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
      plazo_dias: plazoDias,
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

  // Filename: Proyeccion_<Nombre>_<Codigo>_<fechaInicio_DD-MM-YYYY>_<fechaFin_DD-MM-YYYY>.pdf
  const cleanForFilename = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '') // sacar acentos
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_|_$/g, '')
  const ymdToDmy = (s: string) => {
    const [y, m, d] = s.split('-')
    return `${d}-${m}-${y}`
  }
  const partes = [
    'Proyeccion',
    cleanForFilename(inversor.nombre),
    inst.codigo ? cleanForFilename(inst.codigo) : null,
    ymdToDmy(inst.fecha_inicio),
    ymdToDmy(fechaVenc),
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
