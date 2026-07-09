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

    type Agg = { brutas: number; netas: number; cmv: number; cantidad: number }
    const acc = new Map<string, Agg>()
    const add = (m: string, brutas: number, netas: number, cmv: number, cantidad: number) => {
      const a = acc.get(m) ?? { brutas: 0, netas: 0, cmv: 0, cantidad: 0 }
      a.brutas += brutas; a.netas += netas; a.cmv += cmv; a.cantidad += cantidad
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

        // Ingreso con IVA de la venta = Σ line.total − descuentos + envíos.
        // Neto: si la cuenta de cobro es Areben → se factura → se saca el IVA (÷1,21); si no, entero.
        const ingresoConIva = pesoTotal - (Number(v.discount) || 0) + (Number(v.shipping_cost) || 0)
        const netoVenta = esFacturable(v.account_display) ? ingresoConIva / 1.21 : ingresoConIva

        for (const [m, pm] of peso) {
          const frac = pm / pesoTotal
          add(m, pm, netoVenta * frac, (Number(v.total_cost) || 0) * frac, qty.get(m) ?? 0)
        }
      }
      if (!hayMas) break
      if (page === MAX_PAGINAS) console.warn(`[GN] ventas truncadas en ${MAX_PAGINAS} páginas`)
      await sleep(700)
    }

    if (!acc.size) return 'No se encontraron ventas para ese mes'

    const { data: { user } } = await supabase.auth.getUser()
    const filas = [...acc.entries()].map(([marca, a]) => {
      const netas = round2(a.netas)
      const cmv = round2(a.cmv)
      const margen_pesos = round2(netas - cmv)
      return {
        mes,
        marca,
        ventas_brutas: round2(a.brutas),
        devoluciones: 0,
        ventas_netas: netas,
        cmv,
        margen_pesos,
        margen_porcentaje: netas > 0 ? round2((margen_pesos / netas) * 100) : 0,
        cantidad_vendida: Math.round(a.cantidad),
        comisiones: 0,
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

/**
 * Pendiente de facturar: por cada cuenta de cobro Areben (las que se facturan), suma lo
 * cobrado y lo ya facturado (ventas con comprobante) en el mes, para todas las cuentas GN.
 * pendiente = cobrado − facturado. Escribe a facturacion_mes.
 */
export async function sincronizarFacturacionGN(mes: string): Promise<string | null> {
  await requireUser()
  if (!/^\d{4}-\d{2}$/.test(mes)) return 'Mes inválido'

  const supabase = await createClient()
  const { data: cuentasGn } = await supabase.from('cuentas_gn').select('alias')
  const { data: ccRows } = await supabase.from('cuentas_cobro_gn').select('nombre, tipo')
  const arebenSet = new Set((ccRows ?? []).filter((r) => r.tipo === 'areben').map((r) => r.nombre))
  if (!arebenSet.size) return 'No hay cuentas de cobro tipo Areben configuradas'

  try {
    const desde = `${mes}-01`
    type Agg = { cuenta: string; cuenta_gn: string; cobrado: number; facturado: number; n: number; nSin: number }
    const acc = new Map<string, Agg>()
    for (const c of cuentasGn ?? []) {
      const token = tokenParaCuenta(c.alias)
      for (let page = 1; page <= MAX_PAGINAS; page++) {
        const { data, hayMas } = await paginaVentas(token, desde, page)
        for (const v of data) {
          if (!(v.date_sale || '').startsWith(mes)) continue
          if (!v.active || v.archived || v.budget) continue
          const cuenta = (v.account_display || '').trim()
          if (!arebenSet.has(cuenta)) continue // solo cuentas Areben (facturables)
          const key = `${c.alias}::${cuenta}`
          const monto = Number(v.total_price) || 0
          const facturada = !!(String(v.bill_number || '').trim() || v.invoice_number)
          const a = acc.get(key) ?? { cuenta, cuenta_gn: c.alias, cobrado: 0, facturado: 0, n: 0, nSin: 0 }
          a.cobrado += monto
          if (facturada) a.facturado += monto
          else a.nSin++
          a.n++
          acc.set(key, a)
        }
        if (!hayMas) break
        await sleep(700)
      }
    }

    if (!acc.size) return 'No hay ventas en cuentas Areben para ese mes'
    const filas = [...acc.values()].map((a) => ({
      mes,
      cuenta: a.cuenta,
      cuenta_gn: a.cuenta_gn,
      cobrado: round2(a.cobrado),
      facturado: round2(a.facturado),
      pendiente: round2(a.cobrado - a.facturado),
      cantidad: a.n,
      cantidad_sin_facturar: a.nSin,
      fecha_sincronizacion: new Date().toISOString(),
    }))
    const { error } = await supabase.from('facturacion_mes').upsert(filas, { onConflict: 'mes,cuenta,cuenta_gn' })
    if (error) return error.message

    revalidatePath('/finanzas/afip')
    revalidatePath('/')
    return null
  } catch (e) {
    return e instanceof GestionNubeError ? e.message : (e as Error).message
  }
}
