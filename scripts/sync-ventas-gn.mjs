// Sincroniza ventas/CMV de GN → datos_ventas_gn (replica sincronizarVentasGN para correr por CLI).
// Uso: node scripts/sync-ventas-gn.mjs [YYYY-MM]
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const mes = process.argv[2] || '2026-07'
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const BASE = 'https://www.gestionnube.com/api/v1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function gn(token, path, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (r.ok) return r.json() } catch {}
    await sleep(500 * (i + 1))
  }
  throw new Error('GN no respondió: ' + path)
}
const num = (x) => Number(x) || 0
const round2 = (n) => Math.round(n * 100) / 100
const M = (n) => '$' + Math.round(n).toLocaleString('es-AR')

const { data: cuentas } = await supa.from('cuentas_gn').select('*').order('alias')
const { data: cc } = await supa.from('cuentas_cobro_gn').select('nombre, tipo')
const ccMap = new Map((cc || []).map((r) => [r.nombre, r.tipo]))
const esFacturable = (nombre) => ccMap.get((nombre || '').trim()) === 'areben'
const { data: com } = await supa.from('comision_medio_pago').select('medio, porcentaje')
const comMap = new Map((com || []).map((r) => [r.medio, Number(r.porcentaje)]))
const pctComision = (medio) => (comMap.get((medio || '').trim()) ?? 0) / 100
console.log(`Sincronizando ventas de ${mes}...\n`)

for (const c of cuentas) {
  const token = env['GN_TOKEN_' + c.alias.toUpperCase()]
  if (!token) { console.log(`${c.alias}: ✗ falta token`); continue }
  const marcas = c.marcas
  const marcaBase = marcas.find((m) => m.toUpperCase() !== 'STUNNED') ?? marcas[0]
  const tieneStunned = marcas.length > 1 && marcas.some((m) => m.toUpperCase() === 'STUNNED')
  const stunnedIds = new Set()
  if (tieneStunned) {
    for (let p = 1; p <= 20; p++) {
      const d = await gn(token, `/productos/obtener?q=stunned&per_page=50&page=${p}`)
      for (const pr of d.data || []) if ((pr.provider || '').toLowerCase().includes('stunned')) stunnedIds.add(pr.id)
      if (!d.meta?.has_more_pages) break
      await sleep(700)
    }
  }
  const marcaDe = (pid) => (tieneStunned && stunnedIds.has(pid) ? 'STUNNED' : marcaBase)

  const acc = new Map()
  const add = (m, p) => {
    const a = acc.get(m) ?? { brutas: 0, iva: 0, envios: 0, descuentos: 0, cmv: 0, comisiones: 0, cantidad: 0, netasBlanco: 0, netasNegro: 0 }
    a.brutas += p.brutas ?? 0; a.iva += p.iva ?? 0; a.envios += p.envios ?? 0; a.descuentos += p.descuentos ?? 0
    a.cmv += p.cmv ?? 0; a.comisiones += p.comisiones ?? 0; a.cantidad += p.cantidad ?? 0; a.netasBlanco += p.netasBlanco ?? 0; a.netasNegro += p.netasNegro ?? 0
    acc.set(m, a)
  }
  for (let p = 1; p <= 200; p++) {
    const d = await gn(token, `/ventas/obtener?from=${mes}-01&include_details=1&per_page=100&page=${p}`)
    for (const v of d.data || []) {
      if (!(v.date_sale || '').startsWith(mes)) continue
      if (!v.active || v.archived || v.budget) continue
      const lineas = v.items || v.detalles || []; if (!lineas.length) continue
      const peso = new Map(), qty = new Map()
      for (const l of lineas) { const m = marcaDe(l.product_id); peso.set(m, (peso.get(m) ?? 0) + num(l.total)); qty.set(m, (qty.get(m) ?? 0) + num(l.quantity)) }
      const pt = [...peso.values()].reduce((s, x) => s + x, 0) || 1
      const facturable = esFacturable(v.account_display)
      const discount = num(v.discount), shipping = num(v.shipping_cost), cost = num(v.total_cost)
      const comVenta = (pt - discount + shipping) * pctComision(v.payment_method)
      for (const [m, pm] of peso) {
        const f = pm / pt
        const iva = facturable ? (pm * 0.21) / 1.21 : 0
        const env = shipping * f, desc = discount * f
        const neta = pm - iva + env - desc
        add(m, { brutas: pm, iva, envios: env, descuentos: desc, cmv: cost * f, comisiones: comVenta * f, cantidad: qty.get(m) ?? 0, netasBlanco: facturable ? neta : 0, netasNegro: facturable ? 0 : neta })
      }
    }
    if (!d.meta?.has_more_pages) break
    await sleep(700)
  }

  const filas = [...acc.entries()].map(([marca, a]) => {
    const netas = round2(a.netasBlanco + a.netasNegro), cmv = round2(a.cmv), mp = round2(netas - cmv)
    return { mes, marca, ventas_brutas: round2(a.brutas), devoluciones: 0, ventas_netas: netas, iva_debito: round2(a.iva), envios: round2(a.envios), descuentos: round2(a.descuentos), ventas_netas_blanco: round2(a.netasBlanco), ventas_netas_negro: round2(a.netasNegro), cmv, margen_pesos: mp, margen_porcentaje: netas > 0 ? round2((mp / netas) * 100) : 0, cantidad_vendida: Math.round(a.cantidad), comisiones: round2(a.comisiones), fecha_sincronizacion: new Date().toISOString(), sincronizado_por: 'gn-sync' }
  })
  if (!filas.length) { console.log(`${c.alias}: sin ventas en ${mes}`); continue }
  const { error } = await supa.from('datos_ventas_gn').upsert(filas, { onConflict: 'mes,marca' })
  if (error) console.log(`${c.alias}: ✗ ${error.message}`)
  else console.log(`${c.alias}: ✓ ${filas.map((f) => `${f.marca} netas ${M(f.ventas_netas)} / CMV ${M(f.cmv)} (${f.cantidad_vendida}u)`).join('  |  ')}`)
}
console.log('\nListo.')
