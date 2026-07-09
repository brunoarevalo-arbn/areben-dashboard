// Cliente de la API de Gestión Nube (https://www.gestionnube.com/api/v1).
// Portado de areben-produccion, adaptado a MULTI-CUENTA: el token se pasa por
// parámetro (no hay un único GESTIONNUBE_TOKEN global). Cada cuenta tiene su
// token en una env var GN_TOKEN_<ALIAS> (ej. GN_TOKEN_BDI, GN_TOKEN_ZATTIA).
//
// La API es inestable (500 intermitentes) y solo banca páginas chicas
// (per_page <= 50), así que todo va con retry/backoff.

const BASE = 'https://www.gestionnube.com/api/v1'

export class GestionNubeError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Token Bearer de una cuenta, leído de env GN_TOKEN_<ALIAS>. */
export function tokenParaCuenta(alias: string): string {
  const key = `GN_TOKEN_${alias.toUpperCase()}`
  const t = process.env[key]
  if (!t) throw new GestionNubeError(`Falta ${key} en el entorno`)
  return t
}

/** GET crudo contra GN con retry/backoff. `token` es el Bearer de la cuenta. */
export async function gnGet<T = unknown>(token: string, path: string, tries = 4): Promise<T> {
  let last = ''
  for (let i = 0; i < tries; i++) {
    let r: Response
    try {
      r = await fetch(`${BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
    } catch (e) {
      last = (e as Error).message
      await sleep(400 * (i + 1))
      continue
    }
    if (r.ok) return r.json() as Promise<T>
    if (r.status === 401) throw new GestionNubeError('Token inválido o expirado (401)')
    if (r.status === 403) throw new GestionNubeError('El token no tiene permiso para este endpoint (403)')
    last = `HTTP ${r.status}`
    await sleep(500 * (i + 1))
  }
  throw new GestionNubeError(
    `Gestión Nube no respondió (${last}). Su API está inestable, probá de nuevo en un rato.`,
  )
}

// ─── Tipos (según el cliente de producción; los montos se confirman con el probe) ───

export interface GnProducto {
  id: number
  code: string
  name: string
  category: string
  provider: string // proveedor — clave para separar STUNNED dentro de la cuenta ZATTIA
}
interface Paginado<T> { data: T[]; meta?: { has_more_pages?: boolean; total?: number } }

export interface GnInventarioRow {
  product_id?: number
  product_code: string
  product_name: string
  size_name: string
  store_name: string
  available_quantity: number
}

export interface GnVentaLinea {
  product_id: number
  quantity: number
  total: number      // revenue neto de la línea (excl IVA), post-descuento
  subtotal?: number
  size?: string
  size_info?: { name?: string }
}
export interface GnVenta {
  id: number
  date_sale: string
  net_price: number     // ventas netas (sin IVA) de toda la venta
  total_price: number   // total (con IVA/envío)
  total_cost: number    // CMV de la venta
  vat_amount: number
  total_payment: number // cobrado
  total_due: number     // falta cobrar
  active: boolean
  archived: boolean
  budget: boolean
  items?: GnVentaLinea[]
  detalles?: GnVentaLinea[]
}

/** Una página del catálogo de productos (incluye `provider`). */
export async function paginaProductos(
  token: string,
  page: number,
): Promise<{ data: GnProducto[]; hayMas: boolean; total: number }> {
  const d = await gnGet<Paginado<GnProducto>>(token, `/productos/obtener?per_page=50&page=${page}`)
  return { data: d.data || [], hayMas: !!d.meta?.has_more_pages, total: d.meta?.total ?? 0 }
}

/** Busca productos por texto (matchea nombre/código/proveedor). Una página. */
export async function buscarProductos(
  token: string,
  q: string,
  page: number,
): Promise<{ data: GnProducto[]; hayMas: boolean }> {
  const d = await gnGet<Paginado<GnProducto>>(
    token,
    `/productos/obtener?q=${encodeURIComponent(q)}&per_page=50&page=${page}`,
  )
  return { data: d.data || [], hayMas: !!d.meta?.has_more_pages }
}

/** Una página de inventario (stock por talle/tienda). */
export async function paginaInventario(
  token: string,
  page: number,
): Promise<{ data: GnInventarioRow[]; hayMas: boolean }> {
  const d = await gnGet<Paginado<GnInventarioRow>>(token, `/inventario/obtener?per_page=50&page=${page}`)
  return { data: d.data || [], hayMas: !!d.meta?.has_more_pages }
}

/** Una página de ventas desde `from` (YYYY-MM-DD), con líneas de detalle. */
export async function paginaVentas(
  token: string,
  fromISO: string,
  page: number,
): Promise<{ data: GnVenta[]; hayMas: boolean }> {
  const d = await gnGet<Paginado<GnVenta>>(
    token,
    `/ventas/obtener?from=${fromISO}&include_details=1&per_page=100&page=${page}`,
  )
  return { data: d.data || [], hayMas: !!d.meta?.has_more_pages }
}

// ─── Clasificación de marca por proveedor (cuenta ZATTIA cubre ZATTIA + STUNNED) ───

/**
 * Dada una cuenta y el `provider` de un producto, devuelve la marca.
 * - Cuenta con una sola marca (ej. BDI) → esa marca.
 * - Cuenta con varias (ZATTIA + STUNNED) → si el provider contiene 'stunned' → STUNNED,
 *   si no → la primera marca (ZATTIA).
 */
export function clasificarMarca(marcasCuenta: string[], provider: string | undefined): string {
  if (marcasCuenta.length === 1) return marcasCuenta[0]
  const p = (provider || '').toLowerCase()
  const stunned = marcasCuenta.find((m) => m.toUpperCase() === 'STUNNED')
  if (stunned && p.includes('stunned')) return stunned
  return marcasCuenta.find((m) => m.toUpperCase() !== 'STUNNED') ?? marcasCuenta[0]
}
