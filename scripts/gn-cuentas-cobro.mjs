// Lista las cuentas de cobro (account_display) distintas que aparecen en GN, por cuenta GN.
// Read-only. Uso: node scripts/gn-cuentas-cobro.mjs [YYYY-MM-DD desde]
import { readFileSync } from 'fs'
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const desde = process.argv[2] || '2026-05-01'
const BASE = 'https://www.gestionnube.com/api/v1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function gn(token, path, tries = 4) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (r.ok) return r.json() } catch {} await sleep(500 * (i + 1)) }
}
const n = (x) => Number(x) || 0
const M = (x) => '$' + Math.round(x).toLocaleString('es-AR')

const cuentas = [['ZATTIA', env.GN_TOKEN_ZATTIA], ['BDI', env.GN_TOKEN_BDI]]
console.log(`Cuentas de cobro (account_display) desde ${desde}:\n`)
for (const [alias, token] of cuentas) {
  if (!token) { console.log(`${alias}: sin token`); continue }
  const acc = new Map()
  for (let p = 1; p <= 100; p++) {
    const d = await gn(token, `/ventas/obtener?from=${desde}&per_page=100&page=${p}`)
    for (const v of d?.data || []) {
      if (!v.active || v.archived || v.budget) continue
      const k = (v.account_display || '(sin cuenta)').trim()
      const a = acc.get(k) || { n: 0, total: 0, facturadas: 0 }
      a.n++; a.total += n(v.total_price)
      if (String(v.bill_number || '').trim() || v.invoice_number) a.facturadas++
      acc.set(k, a)
    }
    if (!d?.meta?.has_more_pages) break
    await sleep(700)
  }
  console.log(`━━━ Cuenta GN: ${alias} ━━━`)
  for (const [k, a] of [...acc.entries()].sort((x, y) => y[1].total - x[1].total)) {
    console.log(`  • ${k.padEnd(22)}  ${a.n} ventas · ${M(a.total)} · ${a.facturadas}/${a.n} facturadas`)
  }
  console.log('')
}
console.log('Clasificá cada una: AREBEN (factura+IVA) / PROPIA (Bruno-Darío) / EFECTIVO.')
