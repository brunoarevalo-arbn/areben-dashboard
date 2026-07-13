// Stock real (unidades + valorizado) → existencias_marca. Valuación = Σ unidades × unit_cost.
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const mes = process.argv[2] || '2026-07'
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const BASE = 'https://www.gestionnube.com/api/v1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function gn(token, path, t = 4) { for (let i = 0; i < t; i++) { try { const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (r.ok) return r.json() } catch {} await sleep(500 * (i + 1)) } }
const num = (x) => Number(x) || 0
const round2 = (n) => Math.round(n * 100) / 100
const M = (x) => '$' + Math.round(x).toLocaleString('es-AR')

const { data: cuentas } = await supa.from('cuentas_gn').select('*')
for (const c of cuentas) {
  const token = env['GN_TOKEN_' + c.alias.toUpperCase()]
  if (!token) continue
  const marcas = c.marcas
  const marcaBase = marcas.find((m) => m.toUpperCase() !== 'STUNNED') ?? marcas[0]
  const tieneStunned = marcas.length > 1 && marcas.some((m) => m.toUpperCase() === 'STUNNED')

  // Catálogo: product_id -> { provider, costo }
  const catalogo = new Map()
  for (let p = 1; p <= 200; p++) {
    const d = await gn(token, `/productos/obtener?per_page=50&page=${p}`)
    for (const pr of d?.data || []) catalogo.set(pr.id, { provider: (pr.provider || '').toLowerCase(), costo: num(pr.unit_cost) })
    if (!d?.meta?.has_more_pages) break
    await sleep(700)
  }
  const marcaDe = (pid) => (tieneStunned && (catalogo.get(pid)?.provider || '').includes('stunned') ? 'STUNNED' : marcaBase)
  const costoDe = (pid) => catalogo.get(pid)?.costo || 0

  // Inventario: unidades + valorizado por marca
  const agg = new Map()
  for (let p = 1; p <= 200; p++) {
    const d = await gn(token, `/inventario/obtener?per_page=50&page=${p}`)
    for (const row of d?.data || []) {
      const pid = row.product_id
      const marca = pid != null ? marcaDe(pid) : marcas[0]
      const q = num(row.available_quantity)
      const a = agg.get(marca) ?? { unidades: 0, valuacion: 0 }
      a.unidades += q; a.valuacion += q * costoDe(pid)
      agg.set(marca, a)
    }
    if (!d?.meta?.has_more_pages) break
    await sleep(700)
  }
  const filas = [...agg.entries()].map(([marca, a]) => ({ mes, marca, unidades: Math.round(a.unidades), valuacion: round2(a.valuacion), cuenta_gn_id: c.id, fecha_sincronizacion: new Date().toISOString() }))
  const { error } = await supa.from('existencias_marca').upsert(filas, { onConflict: 'mes,marca' })
  console.log(`${c.alias}: ${error ? '✗ ' + error.message : filas.map((f) => `${f.marca} ${f.unidades.toLocaleString('es-AR')}u = ${M(f.valuacion)}`).join(' | ')}`)
}
console.log('Listo.')
