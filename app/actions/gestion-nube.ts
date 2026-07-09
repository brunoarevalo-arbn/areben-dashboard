'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CuentaGN } from '@/types/database'
import {
  tokenParaCuenta,
  paginaProductos,
  paginaInventario,
  clasificarMarca,
  GestionNubeError,
} from '@/lib/gestion-nube/client'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const MAX_PAGINAS = 100 // backstop anti loop; si se corta, se avisa

async function getCuenta(alias: string): Promise<CuentaGN | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('cuentas_gn').select('*').eq('alias', alias).maybeSingle()
  return (data as CuentaGN) ?? null
}

/** Verifica que el token de la cuenta funcione (una llamada liviana) y actualiza estado. */
export async function probarCuentaGN(alias: string): Promise<string | null> {
  await requireUser()
  const cuenta = await getCuenta(alias)
  if (!cuenta) return 'Cuenta GN desconocida'

  const supabase = await createClient()
  try {
    const token = tokenParaCuenta(alias)
    await paginaProductos(token, 1) // si el token es inválido, tira 401/403
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
 * Construye el mapa product_id -> provider recorriendo el catálogo de productos.
 * Necesario solo para cuentas con varias marcas (ej. ZATTIA + STUNNED), para
 * clasificar cada existencia por proveedor. Para cuentas de una sola marca no se llama.
 */
async function mapaProviderPorProducto(token: string): Promise<Map<number, string>> {
  const mapa = new Map<number, string>()
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const { data, hayMas } = await paginaProductos(token, page)
    for (const p of data) mapa.set(p.id, p.provider || '')
    if (!hayMas) break
    if (page === MAX_PAGINAS) console.warn(`[GN] catálogo de productos truncado en ${MAX_PAGINAS} páginas`)
    await sleep(700)
  }
  return mapa
}

/**
 * Sincroniza el STOCK REAL de una cuenta GN hacia existencias_marca (por marca/mes).
 * Suma available_quantity de inventario/obtener, clasificando cada producto a su marca
 * (por `provider` cuando la cuenta cubre varias marcas, ej. STUNNED dentro de ZATTIA).
 * NO toca el saldo contable de inventario: es un dato paralelo.
 */
export async function sincronizarStockGN(alias: string, mes: string): Promise<string | null> {
  await requireUser()
  if (!/^\d{4}-\d{2}$/.test(mes)) return 'Mes inválido'

  const cuenta = await getCuenta(alias)
  if (!cuenta) return 'Cuenta GN desconocida'
  if (!cuenta.marcas?.length) return 'La cuenta no tiene marcas configuradas'

  try {
    const token = tokenParaCuenta(alias)
    const multiMarca = cuenta.marcas.length > 1
    const providerPorProducto = multiMarca ? await mapaProviderPorProducto(token) : null

    // Sumar unidades por marca recorriendo el inventario
    const unidadesPorMarca = new Map<string, number>()
    for (const m of cuenta.marcas) unidadesPorMarca.set(m, 0)

    for (let page = 1; page <= MAX_PAGINAS; page++) {
      const { data, hayMas } = await paginaInventario(token, page)
      for (const row of data) {
        const provider = row.product_id != null ? providerPorProducto?.get(row.product_id) : undefined
        const marca = clasificarMarca(cuenta.marcas, provider)
        unidadesPorMarca.set(marca, (unidadesPorMarca.get(marca) ?? 0) + (Number(row.available_quantity) || 0))
      }
      if (!hayMas) break
      if (page === MAX_PAGINAS) console.warn(`[GN] inventario truncado en ${MAX_PAGINAS} páginas`)
      await sleep(700)
    }

    // Upsert por (mes, marca)
    const supabase = await createClient()
    const filas = [...unidadesPorMarca.entries()].map(([marca, unidades]) => ({
      mes,
      marca,
      unidades,
      cuenta_gn_id: cuenta.id,
      fecha_sincronizacion: new Date().toISOString(),
    }))
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
 * PENDIENTE: la API de ventas devuelve líneas con product_id/quantity, pero los
 * campos de MONTO (ventas netas, CMV, comisiones) aún no están confirmados.
 * Antes de implementarlo, correr `node scripts/gn-probe.mjs` con el token para ver
 * los nombres reales de los campos de monto en /ventas/obtener, y mapearlos acá.
 */
export async function sincronizarVentasGN(alias: string, mes: string): Promise<string | null> {
  await requireUser()
  return `Sincronización de ventas de "${alias}" (${mes}) pendiente: correr scripts/gn-probe.mjs con el token para confirmar los campos de monto de la API de GN antes de mapearlos.`
}
