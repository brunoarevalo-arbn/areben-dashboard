import { NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient, requireUser } from '@/lib/supabase/server'
import {
  ReporteProyeccionPDF,
  type ReporteProyeccionData,
  type ProyeccionMes,
  type ProyeccionMovimiento,
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

/**
 * Suma de (capital vigente × 1 día) a lo largo de un tramo. Es el mismo criterio con el
 * que el motor devenga de verdad: la plata que entra a mitad del tramo rinde sólo por los
 * días que estuvo, no por el tramo entero. Con capital constante da capital × días, así que
 * la proyección de un instrumento sin movimientos no cambia respecto de antes.
 */
function capitalPorDias(
  desde: Date,
  dias: number,
  capitalBase: number,
  movs: { fecha: string; monto: number }[],
): number {
  let total = 0
  for (let t = 0; t < dias; t++) {
    const dia = dateToYMD(new Date(desde.getTime() + t * 86_400_000))
    let capital = capitalBase
    for (const m of movs) if (m.fecha <= dia) capital += m.monto
    total += capital
  }
  return total
}

const ETIQUETA_MOTIVO: Record<string, string> = {
  aporte_nuevo: 'Aporte',
  retiro_parcial: 'Retiro',
  devolucion: 'Devolución',
  ajuste: 'Ajuste',
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

  // Los movimientos del ciclo vigente. Sin esto la proyección se armaba sólo con el capital
  // inicial y la plata que el inversor puso o retiró después no aparecía por ningún lado.
  const { data: movsRaw } = await supabase
    .from('movimientos_instrumento')
    .select('mes, fecha, monto, motivo')
    .eq('instrumento_id', instrumentoId)

  const venceYMD = dateToYMD(fechaVencDate)
  const movimientos = (movsRaw ?? [])
    // Sin día cargado se ubica al arranque de su mes: es lo único que se puede afirmar.
    .map((m) => ({ fecha: (m.fecha ?? `${m.mes}-01`) as string, monto: Number(m.monto), motivo: String(m.motivo) }))
    .filter((m) => m.fecha >= inst.fecha_inicio && m.fecha < venceYMD)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))

  const movsParaCalculo = movimientos.map((m) => ({ fecha: m.fecha, monto: m.monto }))
  const netoMovimientos = Math.round(movimientos.reduce((s, m) => s + m.monto, 0) * 100) / 100

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

    // Capital vigente al arrancar el tramo y a lo largo de él: el interés se calcula sobre
    // capital × días, así un aporte del día 1 rinde todo el tramo y uno de mitad de mes no.
    const movsHastaInicio = movsParaCalculo
      .filter((m) => m.fecha <= dateToYMD(cursorDate))
      .reduce((acc, m) => acc + m.monto, 0)
    const saldoInicio = Math.round((saldoCapital + movsHastaInicio) * 100) / 100
    const acumCapitalDias = capitalPorDias(cursorDate, diasTramo, saldoCapital, movsParaCalculo)
    const interes = diasMesCompleto > 0
      ? Math.round((tasa * acumCapitalDias / diasMesCompleto) * 100) / 100
      : Math.round(saldoInicio * tasa * fraccion * 100) / 100
    interesesAcumulados = Math.round((interesesAcumulados + interes) * 100) / 100

    // Movimientos que caen DENTRO del tramo: al cierre ya están adentro del saldo.
    const movsHastaFin = movsParaCalculo
      .filter((m) => m.fecha < dateToYMD(finTramoDate))
      .reduce((acc, m) => acc + m.monto, 0)

    // saldo_cierre del PDF = monto TOTAL adeudado al inversor al cierre de este tramo.
    // - Capitalizable: capital reinvertido = saldo + interés (el capital crece).
    // - No capitalizable: capital + movimientos + suma de intereses devengados.
    const saldoCierre = inst.capitalizable
      ? Math.round((saldoCapital + movsHastaFin + interes) * 100) / 100
      : Math.round((capital + movsHastaFin + interesesAcumulados) * 100) / 100

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

    // Sólo en capitalizable el capital crece. Se descuentan los movimientos porque el
    // bucle los vuelve a sumar en el tramo siguiente (viven en `movsParaCalculo`).
    if (inst.capitalizable) saldoCapital = Math.round((saldoCierre - movsHastaFin) * 100) / 100
    cursorStr = dateToYMD(finTramoDate)
  }

  const totalIntereses = interesesAcumulados
  // El capital que el inversor tiene puesto = el del arranque + lo que aportó o retiró después.
  const capitalInvertido = Math.round((capital + netoMovimientos) * 100) / 100
  // Capital al cierre técnico: capitalizable → último saldo. No cap → el capital invertido.
  const capitalFinal = inst.capitalizable
    ? (proyeccion.length > 0 ? proyeccion[proyeccion.length - 1].saldo_cierre : capitalInvertido)
    : capitalInvertido
  // Total que efectivamente cobra el inversor al vencimiento.
  const totalACobrar = inst.capitalizable
    ? capitalFinal
    : Math.round((capitalInvertido + totalIntereses) * 100) / 100
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
    // Sólo el día, la etiqueta y el monto: la nota del movimiento es de adentro de casa
    // y este PDF se le entrega al inversor.
    movimientos: movimientos.map((m): ProyeccionMovimiento => ({
      fecha: m.fecha,
      etiqueta: ETIQUETA_MOTIVO[m.motivo] ?? 'Movimiento',
      monto: m.monto,
    })),
    totales: {
      capital_inicial: capital,
      neto_movimientos: netoMovimientos,
      capital_invertido: capitalInvertido,
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
