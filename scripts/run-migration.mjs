#!/usr/bin/env node
/**
 * Ejecuta archivos SQL de migración contra la DB definida en DATABASE_URL.
 * Uso: node scripts/run-migration.mjs <archivo.sql> [archivo2.sql ...]
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: resolve(process.cwd(), '.env.local') })

const url = process.env.DATABASE_URL
if (!url) {
  console.error('❌ Falta DATABASE_URL en .env.local')
  process.exit(1)
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Uso: node scripts/run-migration.mjs <archivo.sql>')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  console.log('✅ Conectado a Supabase')

  for (const file of files) {
    const path = resolve(process.cwd(), file)
    const sql = readFileSync(path, 'utf8')
    console.log(`\n→ Ejecutando ${file}...`)
    try {
      await client.query(sql)
      console.log(`   ✓ OK`)
    } catch (err) {
      console.error(`   ✗ Error: ${err.message}`)
      console.error(`     (detail: ${err.detail ?? '-'})`)
      throw err
    }
  }

  console.log('\n✅ Migraciones aplicadas')
} catch (err) {
  console.error('\n❌ Falló:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
