// Réplica por CLI de sincronizarFacturacionGN (app/actions/gestion-nube.ts).
// Lo cobrado en cuentas Areben durante el mes, sacado de los COBROS de GN
// (include_payments=1: monto, fecha y cuenta de cada uno), no del total de la venta.
// Uso: node scripts/sync-facturacion-gn.mjs 2026-07
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const mes = process.argv[2] || '2026-07'
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const BASE = 'https://www.gestionnube.com/api/v1'
const VENTANA_MESES = 1

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const num = (x) => Number(x) || 0
const round2 = (n) => Math.round(n * 100) / 100
const M = (x) => '$' + Math.round(x).toLocaleString('es-AR')

const mesMenos = (m, n) => { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 1 - n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const ultimoDia = (m) => { const [y, mm] = m.split('-').map(Number); return `${m}-${String(new Date(y, mm, 0).getDate()).padStart(2, '0')}` }

async function gn(token, path, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }).catch(() => null)
    if (r?.ok) return r.json()
    if (r?.status === 429) { const b = await r.json().catch(() => ({})); await sleep(Math.max(5000, (b.retry_after || 0) * 1000 + 1000)); continue }
    await sleep(500 * (i + 1))
  }
  return null
}

const { data: periodo } = await supa.from('facturacion_periodo').select('estado').eq('mes', mes).maybeSingle()
if (periodo?.estado === 'cerrado') { console.log(`✗ ${mes} está cerrado (cobrado congelado). Reabrilo para resincronizar.`); process.exit(1) }

const { data: cuentasGn } = await supa.from('cuentas_gn').select('alias')
const { data: cc } = await supa.from('cuentas_cobro_gn').select('nombre, tipo')
const tipoDe = new Map((cc || []).map((r) => [r.nombre, r.tipo]))

const desde = `${mesMenos(mes, VENTANA_MESES)}-01`
const hasta = ultimoDia(mes)
const acc = new Map()
const sinClasificar = new Map()
const facturasGn = []
const compraPendiente = []

for (const c of cuentasGn || []) {
  const token = env['GN_TOKEN_' + c.alias.toUpperCase()]
  if (!token) { console.log(`  ⚠ sin token para ${c.alias}`); continue }
  for (let p = 1; p <= 200; p++) {
    const d = await gn(token, `/ventas/obtener?from=${desde}&to=${hasta}&include_details=1&include_payments=1&per_page=100&page=${p}`)
    if (!d) { console.log(`  ⚠ ${c.alias} página ${p} no respondió`); break }
    for (const v of d.data || []) {
      if (!v.active || v.archived || v.budget) continue
      let tocaElMes = false
      for (const pago of v.payments || []) {
        if (!(pago.date_payment || '').startsWith(mes)) continue
        const cuenta = (pago.account_name || '').trim() || '(cobro sin cuenta)'
        const monto = num(pago.amount)
        const tipo = tipoDe.get(cuenta)
        if (!tipo) { const s = sinClasificar.get(cuenta) || { monto: 0, n: 0 }; s.monto += monto; s.n++; sinClasificar.set(cuenta, s); continue }
        if (tipo !== 'areben') continue
        tocaElMes = true
        const key = `${c.alias}::${cuenta}`
        const a = acc.get(key) || { cuenta, cuenta_gn: c.alias, cobrado: 0, n: 0 }
        a.cobrado += monto; a.n++; acc.set(key, a)
      }
      if (!tocaElMes) continue
      const numero = String(v.invoice_number || v.bill_number || '').trim()
      if (numero) facturasGn.push({ id: v.id, numero, fecha: v.date_sale, monto: round2(num(v.total_price)), alias: c.alias })
      if ((v.sale_state || '') === 'Compra Pendiente') compraPendiente.push({ numero: v.number, monto: round2(num(v.total_price)), alias: c.alias, facturada: !!numero })
    }
    if (!d.meta?.has_more_pages) break
    await sleep(700)
  }
}

if (!acc.size) { console.log('✗ No hay cobros en cuentas Areben para ese mes'); process.exit(1) }

await supa.from('facturacion_mes').delete().eq('mes', mes)
const filas = [...acc.values()].map((a) => ({
  mes, cuenta: a.cuenta, cuenta_gn: a.cuenta_gn,
  cobrado: round2(a.cobrado), cantidad: a.n, fecha_sincronizacion: new Date().toISOString(),
}))
const { error } = await supa.from('facturacion_mes').insert(filas)
if (error) { console.log('✗ ' + error.message); process.exit(1) }

await supa.from('facturas_emitidas').delete().eq('mes', mes).eq('origen', 'gn')
if (facturasGn.length) {
  await supa.from('facturas_emitidas').insert(facturasGn.map((f) => ({
    mes, numero: f.numero, fecha: f.fecha, monto: f.monto,
    origen: 'gn', cuenta_gn: f.alias, venta_gn_id: f.id, notas: 'Ya facturada en Gestión Nube',
  })))
}

await supa.from('facturacion_detalle').delete().eq('mes', mes)
const detalle = [
  ...compraPendiente.filter((v) => v.facturada).map((v) => ({
    mes, tipo: 'compra_pendiente_facturada', referencia: `${v.alias} · venta ${v.numero}`,
    detalle: 'Venta en «Compra Pendiente» que ya está facturada en GN', monto: v.monto, cantidad: null,
  })),
  ...[...sinClasificar.entries()].map(([cuenta, s]) => ({
    mes, tipo: 'cuenta_sin_clasificar', referencia: cuenta,
    detalle: 'Cobra en GN pero no está en el catálogo de cuentas de cobro: hoy no se factura',
    monto: round2(s.monto), cantidad: s.n,
  })),
]
if (detalle.length) await supa.from('facturacion_detalle').insert(detalle)

const total = filas.reduce((s, f) => s + f.cobrado, 0)
console.log(`\nCobrado en cuentas Areben — ${mes}: ${M(total)}\n`)
for (const f of filas.sort((a, b) => b.cobrado - a.cobrado)) {
  console.log(`  [${f.cuenta_gn}] ${f.cuenta.padEnd(40)} ${M(f.cobrado).padStart(14)}  (${f.cantidad} cobros)`)
}
if (facturasGn.length) console.log(`\nFacturas que GN ya tiene: ${facturasGn.length} · ${M(facturasGn.reduce((s, f) => s + f.monto, 0))}`)
if (sinClasificar.size) {
  console.log('\n⚠ Cuentas de cobro sin clasificar (no se facturan):')
  for (const [k, s] of sinClasificar) console.log(`   ${k.padEnd(42)} ${M(s.monto)} · ${s.n} cobros`)
}
if (compraPendiente.filter((v) => v.facturada).length) {
  console.log('\nVentas en «Compra Pendiente» ya facturadas:')
  for (const v of compraPendiente.filter((x) => x.facturada)) console.log(`   [${v.alias}] venta ${v.numero} · ${M(v.monto)}`)
}
