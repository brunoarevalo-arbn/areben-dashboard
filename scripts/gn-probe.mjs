// Probe de descubrimiento de la API de Gestión Nube.
// Uso:
//   GN_TOKEN='90|xxxx' node scripts/gn-probe.mjs
//   node scripts/gn-probe.mjs 90|xxxx
//
// Pega a cada endpoint candidato y reporta: HTTP status, top-level keys de la
// respuesta, y las keys del primer registro de `data` (para ver los nombres de
// campos reales: montos, cobros, provider, stock, etc.). Read-only (solo GET).

const BASE = 'https://www.gestionnube.com/api/v1'
const token = process.env.GN_TOKEN || process.argv[2]

if (!token) {
  console.error('Falta el token. Uso: GN_TOKEN=... node scripts/gn-probe.mjs')
  process.exit(1)
}

// Primer día del mes actual, para filtros `from`.
const now = new Date()
const primerDiaMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

// Endpoints candidatos según los scopes del token (sales/inventory/costs/products/clients/…).
const ENDPOINTS = [
  `/ventas/obtener?from=${primerDiaMes}&include_details=1&per_page=3`,
  `/inventario/obtener?per_page=3`,
  `/productos/obtener?per_page=3`,
  `/precios/obtener?per_page=3`,
  `/costos/obtener?per_page=3`,
  `/gastos/obtener?per_page=3`,
  `/clientes/obtener?per_page=3`,
  `/cuentas/obtener?per_page=3`,       // accounts:read — "definido, no implementado aún"; confirmar
  `/cobros/obtener?per_page=3`,        // tentativo — ver si existe
  `/comprobantes/obtener?per_page=3`,  // tentativo — facturas emitidas
]

const keysDe = (o) => (o && typeof o === 'object' ? Object.keys(o) : typeof o)

async function probe(path) {
  try {
    const r = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    const line = `\n${r.status}  ${path}`
    if (!r.ok) {
      console.log(`${line}  ← ${r.statusText}`)
      return
    }
    const body = await r.json().catch(() => null)
    console.log(line)
    console.log('   top-level keys:', keysDe(body))
    const data = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : null
    if (data && data.length) {
      console.log('   1er registro keys:', keysDe(data[0]))
      console.log('   1er registro:', JSON.stringify(data[0]).slice(0, 800))
    } else if (body?.data !== undefined) {
      console.log('   data vacío (o no es array)')
    }
    if (body?.meta) console.log('   meta:', JSON.stringify(body.meta))
  } catch (e) {
    console.log(`\nERR  ${path}  ← ${e.message}`)
  }
}

console.log(`Probing Gestión Nube (${BASE}) — token ...${token.slice(-6)}`)
for (const ep of ENDPOINTS) {
  await probe(ep)
  await new Promise((r) => setTimeout(r, 700)) // throttle ~ límite de la API
}
console.log('\n\nListo. Revisá qué endpoints dieron 200 y con qué campos.')
