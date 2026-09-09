// Sonda de las horas extras. Se conecta con el DATABASE_URL de .env.local, igual que
// scripts/apply-migrations.mjs.
//
//   node scripts/horas-probe.mjs          → sólo lee (escala de las columnas, qué hay cargado)
//   node scripts/horas-probe.mjs cargar   → ejerce `horas_cargar_por_token` con 20 min, 1 min y
//                                           15 min sobre el primer empleado con link, y BORRA lo
//                                           que cargó. Es el oráculo de la migración 081: antes
//                                           de aplicarla, "1 min" tiene que salir RECHAZADO.
//
// ⚠️ El modo `cargar` ESCRIBE en la base compartida (aunque después borre). No es un test.
import { readFileSync } from 'fs'
import pg from 'pg'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n')
  .filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
  .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const raw = env.DATABASE_URL
const afterProto = raw.slice(raw.indexOf('://')+3)
const at = afterProto.lastIndexOf('@')
const userpass = afterProto.slice(0,at), hostpart = afterProto.slice(at+1)
const ci = userpass.indexOf(':')
const [hostport, dbname] = [hostpart.slice(0,hostpart.indexOf('/')), hostpart.slice(hostpart.indexOf('/')+1)]
const [host, port] = hostport.split(':')
const client = new pg.Client({ user: userpass.slice(0,ci), password: userpass.slice(ci+1), host,
  port: Number(port), database: dbname.split('?')[0], ssl:{rejectUnauthorized:false} })
await client.connect()

const q = async (label, sql, params) => {
  try { const r = await client.query(sql, params); console.log(label, JSON.stringify(r.rows)) }
  catch (e) { console.log(label, 'ERROR:', e.message) }
}

await q('escala columnas:', `select table_name, column_name, numeric_precision, numeric_scale
  from information_schema.columns
  where (table_name='horas_extras_registros' and column_name='cantidad')
     or (table_name='nomina_mensual' and column_name='horas_extras') order by 1`)

await q('cargas existentes:', `select count(*) n, min(cantidad) min, max(cantidad) max,
  count(*) filter (where cantidad <> round(cantidad,2)) con_mas_de_2_decimales
  from horas_extras_registros`)

await q('tokens vivos:', `select count(*) n from empleados where token_horas is not null and activo`)

if (process.argv[2] === 'cargar') {
  const { rows } = await client.query(
    `select nombre, apellido, token_horas from empleados where token_horas is not null and activo order by nombre limit 1`)
  const t = rows[0]
  console.log('probando con:', t.nombre, t.apellido)
  const hoy = (await client.query(`select (now() at time zone 'America/Argentina/Buenos_Aires')::date d`)).rows[0].d
  for (const [etiqueta, cantidad] of [['20 min (0.3333)', 0.3333], ['1 min (0.0167)', 0.0167], ['15 min (0.25)', 0.25]]) {
    try {
      const r = await client.query(`select horas_cargar_por_token($1,$2,$3,$4) id`,
        [t.token_horas, hoy, cantidad, 'SONDA — borrar'])
      const leido = await client.query(`select cantidad from horas_extras_registros where id=$1`, [r.rows[0].id])
      console.log(`  ${etiqueta}: OK, guardado como ${leido.rows[0].cantidad}`)
      await client.query(`select horas_borrar_por_token($1,$2)`, [t.token_horas, r.rows[0].id])
      console.log(`  ${etiqueta}: borrado`)
    } catch (e) { console.log(`  ${etiqueta}: RECHAZADO — ${e.message}`) }
  }
  const sobra = await client.query(`select count(*) n from horas_extras_registros where notas='SONDA — borrar'`)
  console.log('sondas que quedaron sin borrar:', sobra.rows[0].n)
}
await client.end()
