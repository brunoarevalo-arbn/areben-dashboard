import { NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient, requireUser } from '@/lib/supabase/server'
import {
  FichaPlazoFijoPDF,
  type FichaPlazoFijoData,
  type FichaMes,
  type FichaMovimiento,
} from '@/lib/pdf/ficha-plazo-fijo'
import { desgloseDelMes, tasaAnualEquivalente, generarPeriodos } from '@/lib/inversiones-calc'

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
      fecha_inicio, fecha_fin, plazo_dias, estado,
      inversor:inversores(
        nombre, tipo, dni, cuit, domicilio_calle, domicilio_ciudad,
        domicilio_provincia, domicilio_cp, email
      )
    `)
    .eq('id', instrumentoId)
    .single()

  if (!inst) return new Response('No se encontró el plazo fijo.', { status: 404 })

  const inversor = Array.isArray(inst.inversor) ? inst.inversor[0] : inst.inversor
  if (!inversor) return new Response('No se encontró el inversor.', { status: 404 })

  // Solo el tramo vigente. Los meses anteriores son de ciclos ya renovados: sus
  // intereses quedaron adentro del capital actual, mostrarlos los contaría dos veces.
  const mesInicioCiclo = inst.fecha_inicio.substring(0, 7)

  const { data: periodos } = await supabase
    .from('periodos_instrumento')
    .select('mes, saldo_inicio, interes_devengado, movimiento, saldo_cierre, cerrado')
    .eq('instrumento_id', instrumentoId)
    .gte('mes', mesInicioCiclo)
    .order('mes', { ascending: true })

  const detallePlano = (periodos ?? []).map((p) => ({
    mes: p.mes,
    saldo_inicio: Number(p.saldo_inicio ?? 0),
    interes_devengado: Number(p.interes_devengado ?? 0),
    movimiento: Number(p.movimiento ?? 0),
    saldo_cierre: Number(p.saldo_cierre ?? 0),
  }))

  const { data: movsRaw } = await supabase
    .from('movimientos_instrumento')
    .select('fecha, mes, monto, motivo, nota')
    .eq('instrumento_id', instrumentoId)
    .order('mes', { ascending: true })

  // Se filtra en JS y no con .gte(): los movimientos sin día se ubican por su mes, y
  // mezclarlo con la fecha dentro del query complica más de lo que resuelve.
  const movimientos: FichaMovimiento[] = (movsRaw ?? [])
    .filter((m) => (m.fecha ?? `${m.mes}-01`) >= inst.fecha_inicio || m.mes >= mesInicioCiclo)
    .map((m) => ({
      fecha: m.fecha ?? null,
      mes: m.mes,
      monto: Number(m.monto),
      motivo: m.motivo,
      nota: m.nota ?? null,
    }))
    .sort((a, b) => (a.fecha ?? `${a.mes}-00`).localeCompare(b.fecha ?? `${b.mes}-00`))

  // Cómo quedó partido cada mes en el que se movió plata: hasta el día del movimiento
  // rindió un capital, y desde ese día rindió otro. Es lo que le permite al inversor
  // rehacer la cuenta sin preguntar.
  const detalle: FichaMes[] = detallePlano.map((d) => ({
    ...d,
    tramos: desgloseDelMes({
      mes: d.mes,
      saldoInicio: d.saldo_inicio,
      interesMes: d.interes_devengado,
      movimientos: movimientos
        .filter((m) => m.fecha && m.mes === d.mes)
        .map((m) => ({ fecha: m.fecha as string, monto: m.monto })),
      fechaInicio: inst.fecha_inicio,
      fechaFin: inst.fecha_fin,
    }),
  }))

  // Cuánto interés dejó de generar cada retiro por salir antes del vencimiento: se
  // corre el mismo cálculo con y sin ese movimiento y se mira la diferencia.
  const { data: tramosTasa } = await supabase
    .from('tramos_tasa')
    .select('fecha_desde, tasa_mensual')
    .eq('instrumento_id', instrumentoId)
    .order('fecha_desde', { ascending: true })

  const tramosArr = (tramosTasa ?? []).length > 0
    ? (tramosTasa ?? []).map((t) => ({ fecha_desde: t.fecha_desde, tasa_mensual: Number(t.tasa_mensual) }))
    : [{ fecha_desde: inst.fecha_inicio, tasa_mensual: Number(inst.tasa_mensual) }]

  const baseCalc = {
    capitalInicial: Number(inst.capital_inicial),
    fechaInicio: inst.fecha_inicio,
    fechaFin: inst.fecha_fin,
    capitalizable: inst.capitalizable,
    hasta: (inst.fecha_fin ?? new Date().toISOString()).substring(0, 7),
    tramos: tramosArr,
    plazoDias: inst.plazo_dias,
  }
  const sumaInteres = (ms: { mes: string; fecha: string | null; monto: number }[]) =>
    round(generarPeriodos({ ...baseCalc, movimientos: ms }).reduce((s, p) => s + p.interes_devengado, 0))

  const todosLosMovs = movimientos.map((m) => ({ mes: m.mes, fecha: m.fecha, monto: m.monto }))
  const conTodos = sumaInteres(todosLosMovs)
  for (const m of movimientos) {
    if (!m.fecha || m.monto >= 0 || m.motivo === 'devolucion') continue
    const sinEste = sumaInteres(todosLosMovs.filter((x) => !(x.fecha === m.fecha && x.monto === m.monto)))
    const resignado = round(sinEste - conTodos)
    if (resignado > 0.01) m.interesResignado = resignado
  }

  const { data: empresa } = await supabase
    .from('configuracion_empresa')
    .select('*')
    .eq('id', 1)
    .single()

  if (!empresa) {
    return new Response('Falta cargar la configuración de empresa. Ingresá en /settings/empresa.', { status: 400 })
  }

  const intereses = round(detalle.reduce((s, d) => s + d.interes_devengado, 0))
  const movimientosNetos = round(movimientos.reduce((s, m) => s + m.monto, 0))
  const saldoActual = detalle.length > 0
    ? detalle[detalle.length - 1].saldo_cierre
    : round(Number(inst.capital_inicial))

  // A qué día corresponde ese saldo: al vencimiento si el plazo ya llegó hasta ahí,
  // o al último día del último mes calculado. Nunca es "hoy": el mes en curso ya trae
  // devengado todo su interés.
  const ultimoMes = detalle.length > 0 ? detalle[detalle.length - 1].mes : null
  const finDeMes = ultimoMes
    ? (() => { const [y, m] = ultimoMes.split('-').map(Number); const d = new Date(y, m, 0)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
    : null
  const ultimoDiaCalculado = finDeMes && inst.fecha_fin && inst.fecha_fin < finDeMes ? inst.fecha_fin : finDeMes

  const data: FichaPlazoFijoData = {
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
      capital_inicial: Number(inst.capital_inicial),
      tasa_mensual: Number(inst.tasa_mensual),
      capitalizable: inst.capitalizable,
      fecha_inicio: inst.fecha_inicio,
      fecha_fin: inst.fecha_fin ?? null,
      plazo_dias: inst.plazo_dias ?? null,
      estado: inst.estado as 'activo' | 'cerrado' | 'renovado',
    },
    detalle,
    movimientos,
    totales: { intereses, movimientosNetos, saldoActual },
    tasaAnual: tasaAnualEquivalente(Number(inst.tasa_mensual), inst.capitalizable),
    fechaSaldo: ultimoDiaCalculado,
    generadoEn: new Date().toISOString(),
  }

  const buffer = await renderToBuffer(<FichaPlazoFijoPDF data={data} />)

  const cleanForFilename = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_|_$/g, '')
  const ymdToDmy = (s: string) => {
    const [y, m, d] = s.split('-')
    return `${d}-${m}-${y}`
  }
  const partes = [
    'Ficha',
    cleanForFilename(inversor.nombre),
    inst.codigo ? cleanForFilename(inst.codigo) : null,
    ymdToDmy(new Date().toISOString().substring(0, 10)),
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
