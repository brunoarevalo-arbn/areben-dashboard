// Seed idempotente de Saldos Impositivos para el cierre de ABRIL 2026 (2026-04).
// Crea cada impuesto (tipo IMPOSITIVO, signo_pn=1) si no existe y fija su saldo del mes.
// Posición: monto positivo = a favor (activo); negativo = a pagar (pasivo).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

// Cargar creds desde ~/Bruno/.areben-db.env
const env = {}
for (const line of readFileSync(`${homedir()}/Bruno/.areben-db.env`, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) env[m[1]] = m[2].trim()
}
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan creds en ~/Bruno/.areben-db.env'); process.exit(1) }

const db = createClient(url, key, { auth: { persistSession: false } })
const MES = '2026-04'

// nombre, orden, saldo_cierre firmado (positivo=a favor, negativo=a pagar)
const IMPUESTOS = [
  { nombre: 'IVA técnico',                     orden: 1, cierre:  11914478 },
  { nombre: 'IVA libre',                       orden: 2, cierre:  32394878.52 },
  { nombre: 'Saldo Ganancias',                 orden: 3, cierre:  7384880.11 },
  { nombre: 'Impuesto a las Ganancias a pagar',orden: 4, cierre: -7384880.11 },
  { nombre: 'IIBB AREBEN',                     orden: 5, cierre:  151587.22 },
  { nombre: 'DREI AREBEN',                     orden: 6, cierre: -492624 },
]

for (const imp of IMPUESTOS) {
  // ¿existe ya la cuenta (por nombre + tipo)?
  const { data: existente, error: e1 } = await db
    .from('cuentas_patrimoniales')
    .select('id')
    .eq('tipo', 'IMPOSITIVO')
    .eq('nombre', imp.nombre)
    .maybeSingle()
  if (e1) { console.error('lookup', imp.nombre, e1.message); process.exit(1) }

  let cuentaId = existente?.id
  if (!cuentaId) {
    const { data: creada, error: e2 } = await db
      .from('cuentas_patrimoniales')
      .insert({ nombre: imp.nombre, tipo: 'IMPOSITIVO', signo_pn: 1, moneda: 'ARS', orden: imp.orden, activo: true })
      .select('id').single()
    if (e2) { console.error('insert', imp.nombre, e2.message); process.exit(1) }
    cuentaId = creada.id
    console.log(`+ creado: ${imp.nombre}`)
  } else {
    // asegurar orden
    await db.from('cuentas_patrimoniales').update({ orden: imp.orden }).eq('id', cuentaId)
    console.log(`= existe: ${imp.nombre}`)
  }

  const { error: e3 } = await db.from('saldos_cuentas_patrim').upsert(
    { cuenta_id: cuentaId, mes: MES, saldo_inicio: 0, movimiento: imp.cierre, saldo_cierre: imp.cierre },
    { onConflict: 'cuenta_id,mes' },
  )
  if (e3) { console.error('saldo', imp.nombre, e3.message); process.exit(1) }
  const pos = imp.cierre >= 0 ? 'a favor' : 'a pagar'
  console.log(`   ${MES}: ${pos} $${Math.abs(imp.cierre).toLocaleString('es-AR')}`)
}

// Resumen
const favor = IMPUESTOS.filter(i => i.cierre > 0).reduce((s, i) => s + i.cierre, 0)
const pagar = IMPUESTOS.filter(i => i.cierre < 0).reduce((s, i) => s + Math.abs(i.cierre), 0)
console.log(`\nTotal a favor: $${favor.toLocaleString('es-AR')}`)
console.log(`Total a pagar: $${pagar.toLocaleString('es-AR')}`)
console.log(`Posición neta abril: $${(favor - pagar).toLocaleString('es-AR')}`)
console.log('\nListo ✅')
