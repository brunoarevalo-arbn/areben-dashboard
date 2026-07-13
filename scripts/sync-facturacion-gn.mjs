// Pendiente de facturar → facturacion_mes (replica sincronizarFacturacionGN por CLI).
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

const { data: cuentasGn } = await supa.from('cuentas_gn').select('alias')
const { data: cc } = await supa.from('cuentas_cobro_gn').select('nombre, tipo')
const arebenSet = new Set((cc || []).filter((r) => r.tipo === 'areben').map((r) => r.nombre))
const acc = new Map()
for (const c of cuentasGn) {
  const token = env['GN_TOKEN_' + c.alias.toUpperCase()]
  if (!token) continue
  for (let p = 1; p <= 100; p++) {
    const d = await gn(token, `/ventas/obtener?from=${mes}-01&per_page=100&page=${p}`)
    for (const v of d?.data || []) {
      if (!(v.date_sale || '').startsWith(mes)) continue
      if (!v.active || v.archived || v.budget) continue
      const cuenta = (v.account_display || '').trim()
      if (!arebenSet.has(cuenta)) continue
      const monto = num(v.total_price)
      const fact = !!(String(v.bill_number || '').trim() || v.invoice_number)
      const key = `${c.alias}::${cuenta}`
      const a = acc.get(key) ?? { cuenta, cuenta_gn: c.alias, cobrado: 0, facturado: 0, n: 0, nSin: 0 }
      a.cobrado += monto; if (fact) a.facturado += monto; else a.nSin++; a.n++
      acc.set(key, a)
    }
    if (!d?.meta?.has_more_pages) break
    await sleep(700)
  }
}
const filas = [...acc.values()].map((a) => ({ mes, cuenta: a.cuenta, cuenta_gn: a.cuenta_gn, cobrado: round2(a.cobrado), facturado: round2(a.facturado), pendiente: round2(a.cobrado - a.facturado), cantidad: a.n, cantidad_sin_facturar: a.nSin, fecha_sincronizacion: new Date().toISOString() }))
const { error } = await supa.from('facturacion_mes').upsert(filas, { onConflict: 'mes,cuenta,cuenta_gn' })
console.log(error ? '✗ ' + error.message : `Pendiente de facturar ${mes}:`)
for (const f of filas.sort((x, y) => y.pendiente - x.pendiente)) console.log(`  [${f.cuenta_gn}] ${f.cuenta.padEnd(24)} pendiente ${M(f.pendiente)} (${f.cantidad_sin_facturar}/${f.cantidad} s/fact)`)
