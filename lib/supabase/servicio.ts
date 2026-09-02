import 'server-only'
import { createClient as crearSupabase } from '@supabase/supabase-js'

// El cliente que NO pasa por la RLS. Es la llave maestra de la base.
//
// ⛔ **Solo se usa detrás de la puerta de servicio** (`app/api/puente/*`), y solo DESPUÉS de que
// `verificarPuente` haya validado el sobre. Ningún server action, ninguna pantalla y ningún
// componente lo importa: todos ésos tienen sesión y entran con `lib/supabase/server.ts`, que sí
// respeta la RLS.
//
// Por qué hace falta: a la puerta la llama el SERVIDOR del Monitor, no una persona, así que no hay
// cookie de sesión y la RLS `authenticated_all` le cierra todo. Las otras dos formas de entrar sin
// sesión que ya existen en el repo no sirven acá:
//
//   - `/horas/<token>` usa funciones `security definer` con `grant execute to anon`. Acá no sirve:
//     la anon key es pública (viaja en el bundle del navegador), así que cualquiera podría llamar a
//     esa función y sacar los CBU de los acreedores.
//   - `/auth/callback` no lee datos.
//
// ⚠️ Esta clave YA existe y ya está desplegada: es la misma que el Monitor tiene cargada como
// `DASHBOARD_SUPABASE_SERVICE_KEY` para leer las reglas de contribución (`api/_norte.js`). Lo que
// cambia es que ahora también vive del lado del dashboard. No va nunca al navegador: este archivo
// es `server-only` y la variable no lleva el prefijo `NEXT_PUBLIC_`.

export function clienteDeServicio() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY: la puerta de servicio no puede leer la base.')
  }
  return crearSupabase(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
