// Puebla ventas_gn_agg (analítica) desde GN. Una pasada por cuenta desde una fecha.
// Uso: node scripts/sync-analitica-gn.mjs [YYYY-MM-DD desde]   (default 2025-07-01)
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const DESDE = process.argv[2] || '2025-07-01'
const mesMin = DESDE.slice(0, 7)
// El `from` de la API se comporta raro en algunas cuentas → traemos desde muy atrás
// y filtramos el mes en memoria (por date_sale).
const API_FROM = '2020-01-01'
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const BASE = 'https://www.gestionnube.com/api/v1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function gn(token, path, t = 4) { for (let i = 0; i < t; i++) { try { const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (r.ok) return r.json() } catch {} await sleep(500 * (i + 1)) } }
const num = (x) => Number(x) || 0
const round2 = (n) => Math.round(n * 100) / 100

const { data: cuentas } = await supa.from('cuentas_gn').select('*')
const { data: cc } = await supa.from('cuentas_cobro_gn').select('nombre, tipo')
const arebenSet = new Set((cc || []).filter((r) => r.tipo === 'areben').map((r) => r.nombre))

const acc = new Map() // key -> fila
for (const c of cuentas) {
  const token = env['GN_TOKEN_' + c.alias.toUpperCase()]
  if (!token) continue
  const marcas = c.marcas
  const marcaBase = marcas.find((m) => m.toUpperCase() !== 'STUNNED') ?? marcas[0]
  const tieneStunned = marcas.length > 1 && marcas.some((m) => m.toUpperCase() === 'STUNNED')
  const stunnedIds = new Set()
  if (tieneStunned) { for (let p = 1; p <= 20; p++) { const d = await gn(token, `/productos/obtener?q=stunned&per_page=50&page=${p}`); for (const pr of d?.data || []) if ((pr.provider || '').toLowerCase().includes('stunned')) stunnedIds.add(pr.id); if (!d?.meta?.has_more_pages) break; await sleep(700) } }
  const marcaDe = (pid) => (tieneStunned && stunnedIds.has(pid) ? 'STUNNED' : marcaBase)

  let ventas = 0, page = 1, fallos = 0
  while (page <= 500) {
    const d = await gn(token, `/ventas/obtener?from=${API_FROM}&include_details=1&per_page=100&page=${page}`, 6)
    if (!d) { fallos++; if (fallos > 8) { console.warn(`${c.alias}: CORTÓ en pág ${page} por fallos de la API`); break } await sleep(2500); continue }
    fallos = 0
    for (const v of d.data || []) {
      const mes = (v.date_sale || '').slice(0, 7)
      if (!mes || mes < mesMin) continue
      if (!v.active || v.archived || v.budget) continue
      const lineas = v.items || v.detalles || []; if (!lineas.length) continue
      ventas++
      const canal = (v.channel || '').trim()
      const cuentaCobro = (v.account_display || '').trim()
      const saleType = (v.sale_type || '').trim()
      const facturable = arebenSet.has(cuentaCobro)
      const facturada = !!(String(v.bill_number || '').trim() || v.invoice_number)
      const pesoTotal = lineas.reduce((s, l) => s + num(l.total), 0) || 1
      for (const l of lineas) {
        const marca = marcaDe(l.product_id)
        const w = num(l.total) / pesoTotal
        const descL = num(v.discount) * w, envioL = num(v.shipping_cost) * w, cmvL = num(v.total_cost) * w
        const netoBase = num(l.total) - descL + envioL
        const neto = facturable ? netoBase / 1.21 : netoBase
        const key = [mes, c.alias, marca, canal, cuentaCobro, saleType].join('||')
        const a = acc.get(key) ?? { mes, cuenta_gn: c.alias, marca, canal, cuenta_cobro: cuentaCobro, sale_type: saleType, ventas_con_iva: 0, ventas_netas: 0, cmv: 0, descuentos: 0, envios: 0, cantidad: 0, monto_facturado: 0 }
        a.ventas_con_iva += num(l.total); a.ventas_netas += neto; a.cmv += cmvL; a.descuentos += descL; a.envios += envioL; a.cantidad += num(l.quantity); a.monto_facturado += facturada ? num(l.total) : 0
        acc.set(key, a)
      }
    }
    const ultima = d.data[d.data.length - 1]
    if (ultima && (ultima.date_sale || '') < DESDE) break // newest-first: ya pasamos el rango
    if (!d.meta?.has_more_pages) break
    page++
    await sleep(700)
  }
  console.log(`${c.alias}: ${ventas} ventas procesadas`)
}

const filas = [...acc.values()].map((a) => ({ ...a, ventas_con_iva: round2(a.ventas_con_iva), ventas_netas: round2(a.ventas_netas), cmv: round2(a.cmv), descuentos: round2(a.descuentos), envios: round2(a.envios), cantidad: Math.round(a.cantidad), monto_facturado: round2(a.monto_facturado), fecha_sincronizacion: new Date().toISOString() }))
// upsert en lotes
for (let i = 0; i < filas.length; i += 500) {
  const { error } = await supa.from('ventas_gn_agg').upsert(filas.slice(i, i + 500), { onConflict: 'mes,cuenta_gn,marca,canal,cuenta_cobro,sale_type' })
  if (error) { console.log('✗', error.message); break }
}
console.log(`\n${filas.length} filas de analítica cargadas (${mesMin} → hoy).`)
