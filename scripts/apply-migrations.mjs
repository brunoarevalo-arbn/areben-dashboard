// Aplica migraciones SQL a la base (via DATABASE_URL de .env.local).
// Uso: node scripts/apply-migrations.mjs 044_estado_sector_mes ...
// Idempotentes (IF NOT EXISTS / ON CONFLICT), seguro re-correr.
import { readFileSync } from 'fs'
import pg from 'pg'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const raw = env.DATABASE_URL
if (!raw) { console.error('Falta DATABASE_URL'); process.exit(1) }

// Parse robusto (la contraseña puede tener caracteres especiales sin encodear)
const afterProto = raw.slice(raw.indexOf('://') + 3)
const at = afterProto.lastIndexOf('@')
const userpass = afterProto.slice(0, at)
const hostpart = afterProto.slice(at + 1)
const ci = userpass.indexOf(':')
const user = userpass.slice(0, ci)
const password = userpass.slice(ci + 1)
const [hostport, dbname] = [hostpart.slice(0, hostpart.indexOf('/')), hostpart.slice(hostpart.indexOf('/') + 1)]
const [host, port] = hostport.split(':')

const files = process.argv.slice(2)
if (!files.length) { console.error('Pasá los nombres de migración'); process.exit(1) }

const client = new pg.Client({
  user, password, host, port: Number(port), database: dbname.split('?')[0],
  ssl: { rejectUnauthorized: false },
})
await client.connect()
console.log(`Conectado (${user}@${host}).\n`)

for (const f of files) {
  const sql = readFileSync(`supabase/migrations/${f}.sql`, 'utf8')
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    console.log(`✓ ${f}`)
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.log(`✗ ${f}: ${e.message}`)
  }
}

await client.end()
console.log('\nListo.')
