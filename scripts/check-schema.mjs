import { resolve } from 'node:path'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: resolve(process.cwd(), '.env.local') })

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()

const r = await client.query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND ((table_name = 'empleados' AND column_name IN ('horas_mensuales','corresponde_aguinaldo','porcentaje_aguinaldo'))
      OR (table_name = 'nomina_mensual' AND column_name IN ('porcentaje_extras','monto_recibo_oficial','adicional_no_registrado','valor_hora_real'))
      OR (table_name = 'compras' AND column_name IN ('saldo_pendiente','monto_total','iva'))
      OR table_name IN ('pagos','eventos_empleado'))
  ORDER BY table_name, column_name
`)

console.table(r.rows)
await client.end()
