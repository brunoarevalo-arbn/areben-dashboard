'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CuentaGN } from '@/types/database'
import {
  tokenParaCuenta,
  buscarProductos,
  paginaProductos,
  paginaInventario,
  paginaVentas,
  GestionNubeError,
} from '@/lib/gestion-nube/client'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const MAX_PAGINAS = 200 // backstop anti loop; si se corta, se avisa
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Resultado de una sincronización. `ok: true` con mensaje es un aviso, no un error:
 * la sincronización anduvo pero hay algo para mirar (una cuenta sin clasificar, por ejemplo).
 */
export type ResultadoSync = { ok: boolean; mensaje?: string }

async function getCuenta(alias: string): Promise<CuentaGN | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('cuentas_gn').select('*').eq('alias', alias).maybeSingle()
  return (data as CuentaGN) ?? null
}

/**
 * ¿La cuenta necesita separar STUNNED? (cubre varias marcas, una de ellas STUNNED).
 * Devuelve { marcaBase, stunnedIds } — marcaBase = la marca por defecto (ej. ZATTIA);
 * stunnedIds = product_id cuyo provider es STUNNED (vía /productos/obtener?q=stunned).
 */
async function resolverMarcas(cuenta: CuentaGN, token: string) {
  const marcaBase = cuenta.marcas.find((m) => m.toUpperCase() !== 'STUNNED') ?? cuenta.marcas[0]
  const tieneStunned = cuenta.marcas.length > 1 && cuenta.marcas.some((m) => m.toUpperCase() === 'STUNNED')
  const stunnedIds = new Set<number>()
  if (tieneStunned) {
    for (let page = 1; page <= 20; page++) {
      const { data, hayMas } = await buscarProductos(token, 'stunned', page)
      for (const p of data) if ((p.provider || '').toLowerCase().includes('stunned')) stunnedIds.add(p.id)
      if (!hayMas) break
      await sleep(700)
    }
  }
  const marcaDe = (productId: number) => (stunnedIds.has(productId) ? 'STUNNED' : marcaBase)
  return { marcaBase, marcaDe }
}

/** Verifica que el token de la cuenta funcione (una llamada liviana) y actualiza estado. */
export async function probarCuentaGN(alias: string): Promise<string | null> {
  await requireUser()
  const cuenta = await getCuenta(alias)
  if (!cuenta) return 'Cuenta GN desconocida'

  const supabase = await createClient()
  try {
    const token = tokenParaCuenta(alias)
    await paginaInventario(token, 1) // si el token es inválido, tira 401/403
    await supabase
      .from('cuentas_gn')
      .update({ estado: 'OK', fecha_ultimo_test: new Date().toISOString() })
      .eq('id', cuenta.id)
    return null
  } catch (e) {
    const msg = e instanceof GestionNubeError ? e.message : (e as Error).message
    await supabase
      .from('cuentas_gn')
      .update({ estado: 'ERROR', fecha_ultimo_test: new Date().toISOString(), notas: msg })
      .eq('id', cuenta.id)
    return msg
  }
}

/**
 * Sincroniza el STOCK REAL de una cuenta GN hacia existencias_marca (por marca/mes).
 * Suma available_quantity de inventario/obtener, clasificando cada producto a su marca
 * (STUNNED por provider dentro de la cuenta ZATTIA). NO toca el saldo contable de inventario.
 */
export async function sincronizarStockGN(alias: string, mes: string): Promise<string | null> {
  await requireUser()
  if (!/^\d{4}-\d{2}$/.test(mes)) return 'Mes inválido'

  const cuenta = await getCuenta(alias)
  if (!cuenta) return 'Cuenta GN desconocida'
  if (!cuenta.marcas?.length) return 'La cuenta no tiene marcas configuradas'

  try {
    const token = tokenParaCuenta(alias)
    // Catálogo product_id -> { provider (marca), costo } para clasificar y valorizar.
    const catalogo = new Map<number, { provider: string; costo: number }>()
    for (let page = 1; page <= MAX_PAGINAS; page++) {
      const { data, hayMas } = await paginaProductos(token, page)
      for (const p of data) catalogo.set(p.id, { provider: (p.provider || '').toLowerCase(), costo: Number(p.unit_cost) || 0 })
      if (!hayMas) break
      if (page === MAX_PAGINAS) console.warn(`[GN] catálogo truncado en ${MAX_PAGINAS} páginas`)
      await sleep(700)
    }
    const tieneStunned = cuenta.marcas.length > 1 && cuenta.marcas.some((m) => m.toUpperCase() === 'STUNNED')
    const marcaBase = cuenta.marcas.find((m) => m.toUpperCase() !== 'STUNNED') ?? cuenta.marcas[0]
    const clasificar = (pid: number) => (tieneStunned && (catalogo.get(pid)?.provider || '').includes('stunned') ? 'STUNNED' : marcaBase)

    const agg = new Map<string, { unidades: number; valuacion: number }>()
    for (let page = 1; page <= MAX_PAGINAS; page++) {
      const { data, hayMas } = await paginaInventario(token, page)
      for (const row of data) {
        const pid = row.product_id
        const marca = pid != null ? clasificar(pid) : cuenta.marcas[0]
        const q = Number(row.available_quantity) || 0
        const a = agg.get(marca) ?? { unidades: 0, valuacion: 0 }
        a.unidades += q
        a.valuacion += q * (pid != null ? catalogo.get(pid)?.costo ?? 0 : 0)
        agg.set(marca, a)
      }
      if (!hayMas) break
      if (page === MAX_PAGINAS) console.warn(`[GN] inventario truncado en ${MAX_PAGINAS} páginas`)
      await sleep(700)
    }

    const supabase = await createClient()
    const filas = [...agg.entries()].map(([marca, a]) => ({
      mes,
      marca,
      unidades: Math.round(a.unidades),
      valuacion: round2(a.valuacion),
      cuenta_gn_id: cuenta.id,
      fecha_sincronizacion: new Date().toISOString(),
    }))
    if (!filas.length) return 'No se encontró inventario'
    const { error } = await supabase.from('existencias_marca').upsert(filas, { onConflict: 'mes,marca' })
    if (error) return error.message

    revalidatePath('/')
    return null
  } catch (e) {
    return e instanceof GestionNubeError ? e.message : (e as Error).message
  }
}

/**
 * Sincroniza VENTAS/CMV de una cuenta GN hacia datos_ventas_gn (por marca/mes).
 * Toma cada venta del mes (activa, no archivada, no presupuesto — los cambios entran
 * como ventas aparte con su signo y se netean solos), y aprovecha que las líneas traen
 * revenue por línea para PARTIR la venta por marca (STUNNED vs ZATTIA) proporcional al
 * peso de cada marca en la venta. Usa los totales autoritativos de GN (net_price,
 * total_price, total_cost) apportionados por ese peso.
 *
 * devoluciones=0 (muy pocas; los cambios ya se netean). comisiones=0 por ahora:
 * viven a nivel "cuenta de cobro", que requiere el endpoint accounts (no implementado aún).
 */
export async function sincronizarVentasGN(alias: string, mes: string): Promise<string | null> {
  await requireUser()
  if (!/^\d{4}-\d{2}$/.test(mes)) return 'Mes inválido'

  // No re-sincronizar un mes ya cerrado: el cierre congela el CMV/ventas de GN. Si se pisara,
  // la posición de mercadería (que lee datos_ventas_gn.cmv en vivo) movería un cierre pasado.
  // Para actualizar, reabrir el cierre primero.
  const supabaseCierre = await createClient()
  const { data: cierre } = await supabaseCierre
    .from('cierres_mensuales')
    .select('cerrado')
    .eq('mes', mes)
    .maybeSingle()
  if (cierre?.cerrado) return `El mes ${mes} está cerrado — no se sincroniza (reabrí el cierre para actualizar el CMV).`

  const cuenta = await getCuenta(alias)
  if (!cuenta) return 'Cuenta GN desconocida'
  if (!cuenta.marcas?.length) return 'La cuenta no tiene marcas configuradas'

  try {
    const token = tokenParaCuenta(alias)
    const { marcaDe } = await resolverMarcas(cuenta, token)
    const desde = `${mes}-01`

    // Clasificación de cuentas de cobro: solo 'areben' se factura → lleva IVA (÷1,21).
    const supabase = await createClient()
    const { data: ccRows } = await supabase.from('cuentas_cobro_gn').select('nombre, tipo')
    const ccMap = new Map((ccRows ?? []).map((r) => [r.nombre, r.tipo as string]))
    const esFacturable = (nombre: string) => ccMap.get((nombre || '').trim()) === 'areben'

    // Comisiones: % configurable por medio de pago (GN no las expone).
    const { data: comRows } = await supabase.from('comision_medio_pago').select('medio, porcentaje')
    const comMap = new Map((comRows ?? []).map((r) => [r.medio, Number(r.porcentaje)]))
    const pctComision = (medio: string) => (comMap.get((medio || '').trim()) ?? 0) / 100

    // Desglose estilo P&L de GN, por marca: bruto (con IVA), IVA débito (solo blanco),
    // envíos, descuentos, CMV, y el split blanco/negro de las ventas netas.
    type Agg = { brutas: number; iva: number; envios: number; descuentos: number; cmv: number; comisiones: number; cantidad: number; netasBlanco: number; netasNegro: number }
    const acc = new Map<string, Agg>()
    const add = (m: string, p: Partial<Agg>) => {
      const a = acc.get(m) ?? { brutas: 0, iva: 0, envios: 0, descuentos: 0, cmv: 0, comisiones: 0, cantidad: 0, netasBlanco: 0, netasNegro: 0 }
      a.brutas += p.brutas ?? 0; a.iva += p.iva ?? 0; a.envios += p.envios ?? 0; a.descuentos += p.descuentos ?? 0
      a.cmv += p.cmv ?? 0; a.comisiones += p.comisiones ?? 0; a.cantidad += p.cantidad ?? 0; a.netasBlanco += p.netasBlanco ?? 0; a.netasNegro += p.netasNegro ?? 0
      acc.set(m, a)
    }

    for (let page = 1; page <= MAX_PAGINAS; page++) {
      const { data, hayMas } = await paginaVentas(token, desde, page)
      for (const v of data) {
        if (!(v.date_sale || '').startsWith(mes)) continue
        if (!v.active || v.archived || v.budget) continue
        const lineas = v.items ?? v.detalles ?? []
        if (!lineas.length) continue

        // Peso por marca = Σ line.total (con IVA, neto del descuento de línea); cantidad por marca.
        const peso = new Map<string, number>()
        const qty = new Map<string, number>()
        for (const l of lineas) {
          const m = marcaDe(l.product_id)
          peso.set(m, (peso.get(m) ?? 0) + (Number(l.total) || 0))
          qty.set(m, (qty.get(m) ?? 0) + (Number(l.quantity) || 0))
        }
        const pesoTotal = [...peso.values()].reduce((s, x) => s + x, 0) || 1

        // La venta es blanco (Areben → se factura, lleva IVA) o negro (efectivo/propias → entera).
        // IVA débito = 21% del bruto (÷1,21) solo si es facturable; envíos/descuentos se prorratean
        // por marca. Ventas netas = bruto − IVA + envíos − descuentos.
        const facturable = esFacturable(v.account_display)
        const discount = Number(v.discount) || 0
        const shipping = Number(v.shipping_cost) || 0
        const cost = Number(v.total_cost) || 0
        // Comisión de la venta = % del medio de pago sobre el total cobrado (con IVA).
        const comVenta = (pesoTotal - discount + shipping) * pctComision(v.payment_method)

        for (const [m, pm] of peso) {
          const frac = pm / pesoTotal
          const iva = facturable ? (pm * 0.21) / 1.21 : 0
          const env = shipping * frac
          const desc = discount * frac
          const neta = pm - iva + env - desc
          add(m, {
            brutas: pm,
            iva,
            envios: env,
            descuentos: desc,
            cmv: cost * frac,
            comisiones: comVenta * frac,
            cantidad: qty.get(m) ?? 0,
            netasBlanco: facturable ? neta : 0,
            netasNegro: facturable ? 0 : neta,
          })
        }
      }
      if (!hayMas) break
      if (page === MAX_PAGINAS) console.warn(`[GN] ventas truncadas en ${MAX_PAGINAS} páginas`)
      await sleep(700)
    }

    if (!acc.size) return 'No se encontraron ventas para ese mes'

    const { data: { user } } = await supabase.auth.getUser()
    const filas = [...acc.entries()].map(([marca, a]) => {
      const netas = round2(a.netasBlanco + a.netasNegro)
      const cmv = round2(a.cmv)
      const margen_pesos = round2(netas - cmv)
      return {
        mes,
        marca,
        ventas_brutas: round2(a.brutas),
        devoluciones: 0,
        ventas_netas: netas,
        iva_debito: round2(a.iva),
        envios: round2(a.envios),
        descuentos: round2(a.descuentos),
        ventas_netas_blanco: round2(a.netasBlanco),
        ventas_netas_negro: round2(a.netasNegro),
        cmv,
        margen_pesos,
        margen_porcentaje: netas > 0 ? round2((margen_pesos / netas) * 100) : 0,
        cantidad_vendida: Math.round(a.cantidad),
        comisiones: round2(a.comisiones),
        fecha_sincronizacion: new Date().toISOString(),
        sincronizado_por: user?.email ?? 'gn-sync',
      }
    })
    const { error } = await supabase.from('datos_ventas_gn').upsert(filas, { onConflict: 'mes,marca' })
    if (error) return error.message

    revalidatePath('/analisis/ventas')
    revalidatePath('/analisis/pl-marca')
    revalidatePath('/')
    return null
  } catch (e) {
    return e instanceof GestionNubeError ? e.message : (e as Error).message
  }
}

// Cuánto se retrocede para buscar cobros de ventas viejas: un cobro de julio sobre una venta
// de junio es cobro de julio, y si la ventana no llega a junio esa plata no se ve.
// Medido en abril-agosto 2026: el desfasaje entre mes de cobro y mes de venta es CERO — nadie
// está a cuenta corriente (`total_due` da $0 en todas las ventas). Un mes alcanza y sobra;
// subirlo multiplica las páginas contra una API que limita por tasa. Si algún día se vende a
// 30/60 días, esto hay que subirlo.
const VENTANA_MESES = 1

/** 'YYYY-MM' menos n meses. */
function mesMenos(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 - n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
/** Último día del mes, 'YYYY-MM-DD'. */
function ultimoDia(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

/**
 * Lo cobrado en cuentas Areben durante el mes, por cuenta de cobro y cuenta GN.
 *
 * Se apoya en los COBROS (`payments[]`, con `include_payments=1`), no en el total de la
 * venta. Eso importa por dos razones:
 *  - una venta se puede cobrar en dos cuentas (GN la etiqueta "2 Cuentas" y `account_display`
 *    deja de servir para atribuir la plata: hay que ir cobro por cobro);
 *  - el cobro tiene su propia fecha, así que se imputa por MES DE COBRO. El contador pide
 *    facturar lo que entra a la cuenta, no lo que se vendió.
 *
 * De paso deja en facturas_emitidas las pocas facturas que GN sí tiene (mayoristas con CAE),
 * para no facturarlas dos veces, y en facturacion_detalle lo que conviene mirar a mano.
 */
export async function sincronizarFacturacionGN(mes: string): Promise<ResultadoSync> {
  await requireUser()
  if (!/^\d{4}-\d{2}$/.test(mes)) return { ok: false, mensaje: 'Mes inválido' }

  const supabase = await createClient()

  // Con el mes cerrado el cobrado está congelado: se está facturando contra ese número.
  const { data: periodo } = await supabase
    .from('facturacion_periodo')
    .select('estado')
    .eq('mes', mes)
    .maybeSingle()
  if (periodo?.estado === 'cerrado') {
    return {
      ok: false,
      mensaje: 'El mes está cerrado y el cobrado quedó congelado. Reabrilo si necesitás volver a sincronizar.',
    }
  }

  const { data: cuentasGn } = await supabase.from('cuentas_gn').select('alias')
  const { data: ccRows } = await supabase.from('cuentas_cobro_gn').select('nombre, tipo')
  const tipoDe = new Map((ccRows ?? []).map((r) => [r.nombre, r.tipo as string]))
  if (![...tipoDe.values()].includes('areben')) {
    return { ok: false, mensaje: 'No hay cuentas de cobro tipo Areben configuradas' }
  }

  try {
    const desde = `${mesMenos(mes, VENTANA_MESES)}-01`
    const hasta = ultimoDia(mes)

    type Agg = { cuenta: string; cuenta_gn: string; cobrado: number; n: number }
    const acc = new Map<string, Agg>()
    // Cuentas que aparecen cobrando y no están en el catálogo: caen como no-facturables
    // sin que nadie lo decida, así que se avisan en vez de pasar en silencio.
    const sinClasificar = new Map<string, { monto: number; n: number }>()
    const facturasGn: Array<{ id: number; numero: string; fecha: string; monto: number; alias: string }> = []
    const compraPendiente: Array<{ numero: number; monto: number; alias: string; facturada: boolean }> = []
    let truncado = false

    for (const c of cuentasGn ?? []) {
      const token = tokenParaCuenta(c.alias)
      for (let page = 1; page <= MAX_PAGINAS; page++) {
        const { data, hayMas } = await paginaVentas(token, desde, page, { hasta, cobros: true })
        for (const v of data) {
          if (!v.active || v.archived || v.budget) continue

          // ¿Algún cobro de esta venta cae en el mes y en una cuenta Areben? Y cuánto.
          let arebenDeLaVenta = 0
          for (const pago of v.payments ?? []) {
            if (!(pago.date_payment || '').startsWith(mes)) continue
            // GN devuelve cobros sin cuenta; se avisan igual que una cuenta desconocida.
            const cuenta = (pago.account_name || '').trim() || '(cobro sin cuenta)'
            const monto = Number(pago.amount) || 0
            const tipo = tipoDe.get(cuenta)
            if (!tipo) {
              const s = sinClasificar.get(cuenta) ?? { monto: 0, n: 0 }
              s.monto += monto
              s.n++
              sinClasificar.set(cuenta, s)
              continue
            }
            if (tipo !== 'areben') continue // propias y efectivo no se facturan
            arebenDeLaVenta += monto
            const key = `${c.alias}::${cuenta}`
            const a = acc.get(key) ?? { cuenta, cuenta_gn: c.alias, cobrado: 0, n: 0 }
            a.cobrado += monto
            a.n++
            acc.set(key, a)
          }

          if (!arebenDeLaVenta) continue

          // Las que GN sí tiene facturadas: el número viene en invoice_number (bill_number
          // está vacío hasta en esas).
          // 🔑 El monto que descuenta es SOLO lo que entró a cuentas Areben en el mes, no el
          // total de la venta: si la venta se cobró mitad en efectivo, esa mitad nunca estuvo
          // en el saldo y descontarla dejaría el pendiente corto. Los dos lados de la resta
          // tienen que medir lo mismo — lo que entra a la cuenta.
          const numero = String(v.invoice_number || v.bill_number || '').trim()
          if (numero) {
            facturasGn.push({
              id: v.id,
              numero,
              fecha: v.date_sale,
              monto: round2(arebenDeLaVenta),
              alias: c.alias,
            })
          }
          if ((v.sale_state || '') === 'Compra Pendiente') {
            compraPendiente.push({
              numero: v.number,
              monto: round2(Number(v.total_price) || 0),
              alias: c.alias,
              facturada: !!numero,
            })
          }
        }
        if (!hayMas) break
        if (page === MAX_PAGINAS) truncado = true
        await sleep(700)
      }
    }

    if (!acc.size) return { ok: false, mensaje: 'No hay cobros en cuentas Areben para ese mes' }

    // Reemplazo completo del mes: si una cuenta se reclasifica o deja de tener cobros, la
    // fila vieja tiene que desaparecer, no quedar pegada mostrando datos que ya no existen.
    await supabase.from('facturacion_mes').delete().eq('mes', mes)
    const { error } = await supabase.from('facturacion_mes').insert(
      [...acc.values()].map((a) => ({
        mes,
        cuenta: a.cuenta,
        cuenta_gn: a.cuenta_gn,
        cobrado: round2(a.cobrado),
        cantidad: a.n,
        fecha_sincronizacion: new Date().toISOString(),
      })),
    )
    if (error) return { ok: false, mensaje: error.message }

    // Las facturas de GN se refrescan; las cargadas a mano no se tocan nunca.
    // Va por upsert contra venta_gn_id: una venta cobrada en dos meses distintos cae en la
    // ventana de los dos, y con un insert pelado el índice único haría fallar el lote entero.
    // Así la factura queda en el último mes sincronizado y nunca se cuenta dos veces.
    await supabase.from('facturas_emitidas').delete().eq('mes', mes).eq('origen', 'gn')
    if (facturasGn.length) {
      const { error: errFac } = await supabase.from('facturas_emitidas').upsert(
        facturasGn.map((f) => ({
          mes,
          numero: f.numero,
          fecha: f.fecha,
          monto: f.monto,
          origen: 'gn',
          cuenta_gn: f.alias,
          venta_gn_id: f.id,
          notas: 'Ya facturada en Gestión Nube',
        })),
        { onConflict: 'venta_gn_id,mes' },
      )
      // Si esto falla en silencio, el mes queda mostrando $0 facturado y todo como pendiente.
      if (errFac) return { ok: false, mensaje: `No se pudieron guardar las facturas de GN: ${errFac.message}` }
    }

    // Detalle técnico para seguimiento.
    await supabase.from('facturacion_detalle').delete().eq('mes', mes)
    const detalle = [
      ...compraPendiente
        .filter((v) => v.facturada)
        .map((v) => ({
          mes,
          tipo: 'compra_pendiente_facturada',
          referencia: `${v.alias} · venta ${v.numero}`,
          detalle: 'Venta en «Compra Pendiente» que ya está facturada en GN',
          monto: v.monto,
          cantidad: null,
        })),
      ...[...sinClasificar.entries()].map(([cuenta, s]) => ({
        mes,
        tipo: 'cuenta_sin_clasificar',
        referencia: cuenta,
        detalle: 'Cobra en GN pero no está en el catálogo de cuentas de cobro: hoy no se factura',
        monto: round2(s.monto),
        cantidad: s.n,
      })),
    ]
    if (detalle.length) {
      const { error: errDet } = await supabase.from('facturacion_detalle').insert(detalle)
      if (errDet) console.warn('[GN] no se pudo guardar el detalle técnico:', errDet.message)
    }

    revalidatePath('/finanzas/afip')
    revalidatePath('/')

    const avisos: string[] = []
    if (sinClasificar.size) {
      avisos.push(
        `${sinClasificar.size} cuenta(s) de cobro sin clasificar: ${[...sinClasificar.keys()].join(', ')}. ` +
          'Cargalas en Configuración → Cuentas de cobro.',
      )
    }
    if (truncado) avisos.push(`Se cortó en ${MAX_PAGINAS} páginas: puede faltar información.`)
    return { ok: true, mensaje: avisos.length ? avisos.join(' ') : undefined }
  } catch (e) {
    return { ok: false, mensaje: e instanceof GestionNubeError ? e.message : (e as Error).message }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// El proceso de facturación del mes
// ═══════════════════════════════════════════════════════════════════════════
// Se calcula lo cobrado → se CIERRA (queda congelado) → se van cargando las facturas
// emitidas desde AFIP y el saldo baja. La factura es de Areben, no de la marca: un solo
// saldo por mes para las dos cuentas GN.

/** Total cobrado del mes según el último desglose sincronizado. */
async function cobradoDelMes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mes: string,
): Promise<number> {
  const { data } = await supabase.from('facturacion_mes').select('cobrado').eq('mes', mes)
  return round2((data ?? []).reduce((s, r) => s + Number(r.cobrado), 0))
}

/**
 * Cierra el cálculo del mes: congela el cobrado para empezar a facturar contra ese número.
 * Sin congelar, una sincronización posterior movería el total a mitad del proceso.
 */
export async function cerrarCalculoFacturacion(mes: string): Promise<ResultadoSync> {
  await requireUser()
  if (!/^\d{4}-\d{2}$/.test(mes)) return { ok: false, mensaje: 'Mes inválido' }

  const supabase = await createClient()
  const cobrado = await cobradoDelMes(supabase, mes)
  if (!cobrado) return { ok: false, mensaje: 'No hay nada cobrado en el mes: sincronizá antes de cerrar.' }

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('facturacion_periodo').upsert(
    {
      mes,
      estado: 'cerrado',
      cobrado_congelado: cobrado,
      cerrado_por: user?.email ?? null,
      cerrado_at: new Date().toISOString(),
    },
    { onConflict: 'mes' },
  )
  if (error) return { ok: false, mensaje: error.message }

  revalidatePath('/finanzas/afip')
  return { ok: true }
}

/**
 * Reabre el mes. Hace falta cuando aparece una venta cargada tarde en GN: sin esto el mes
 * queda trabado con un cobrado incompleto y no hay forma de corregirlo.
 * Las facturas ya cargadas no se tocan.
 */
export async function reabrirCalculoFacturacion(mes: string): Promise<ResultadoSync> {
  await requireUser()
  if (!/^\d{4}-\d{2}$/.test(mes)) return { ok: false, mensaje: 'Mes inválido' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('facturacion_periodo')
    .update({ estado: 'abierto', cobrado_congelado: null, cerrado_por: null, cerrado_at: null })
    .eq('mes', mes)
  if (error) return { ok: false, mensaje: error.message }

  revalidatePath('/finanzas/afip')
  return { ok: true }
}

/** Carga una factura emitida contra el saldo del mes. */
export async function agregarFactura(input: {
  mes: string
  numero: string
  fecha: string
  monto: number
  notas?: string
}): Promise<ResultadoSync> {
  await requireUser()
  if (!/^\d{4}-\d{2}$/.test(input.mes)) return { ok: false, mensaje: 'Mes inválido' }
  if (!(input.monto > 0)) return { ok: false, mensaje: 'El monto tiene que ser mayor a cero' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('facturas_emitidas').insert({
    mes: input.mes,
    numero: input.numero.trim() || null,
    fecha: input.fecha || null,
    monto: round2(input.monto),
    notas: input.notas?.trim() || null,
    origen: 'manual',
    cargado_por: user?.email ?? null,
  })
  if (error) return { ok: false, mensaje: error.message }

  revalidatePath('/finanzas/afip')
  return { ok: true }
}

/** Borra una factura cargada a mano. Las de origen GN no se borran: las maneja el sync. */
export async function eliminarFactura(id: string): Promise<ResultadoSync> {
  await requireUser()

  const supabase = await createClient()
  const { error } = await supabase.from('facturas_emitidas').delete().eq('id', id).eq('origen', 'manual')
  if (error) return { ok: false, mensaje: error.message }

  revalidatePath('/finanzas/afip')
  return { ok: true }
}
