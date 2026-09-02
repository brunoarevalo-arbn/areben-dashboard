import 'server-only'
import { timingSafeEqual } from 'node:crypto'

// Quién puede entrar por la puerta de servicio del dashboard.
//
// 🔑 **Del otro lado NO hay una persona: hay un servidor.** El Monitor ya verifica a la persona en
// cada request contra el padrón (`api/_auth.js`), y recién después su SERVIDOR llama acá con su
// propia credencial. Por eso esto no valida un usuario: valida que quien llama sea el Monitor.
//
// ⚠️ Lo que se paga por ese diseño: el dashboard confía en lo que le afirma el Monitor. Es
// aceptable porque el Monitor sí verifica a la persona, pero deja toda la carga en el secreto ⇒
// vive SOLO del lado del servidor, nunca en el navegador, de ninguno de los dos repos.
//
// ⛔ Por qué no el token de Google de la persona: no siempre existe. Adentro del panel de WhatsApp
// se entra con usuario y contraseña porque Google no acepta su login en un iframe (da 403), así
// que atar la puerta al token dejaría al panel afuera.

const HEADER = 'x-puente-auth'

/** Compara sin filtrar por el tiempo que tarda. Longitudes distintas ⇒ false, sin comparar. */
function igualSeguro(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

export type ResultadoPuente = { ok: true } | { ok: false; status: number; error: string }

/**
 * Revisa el sobre. Falla CERRADA: si el secreto no está configurado, nadie entra — un deploy sin
 * la variable no puede terminar en una puerta abierta.
 */
export function verificarPuente(request: Request): ResultadoPuente {
  const esperado = process.env.PUENTE_SECRET
  if (!esperado || esperado.length < 32) {
    return {
      ok: false,
      status: 503,
      error: 'La puerta no está configurada (falta PUENTE_SECRET, de 32 caracteres o más).',
    }
  }
  const recibido = request.headers.get(HEADER)
  if (!recibido || !igualSeguro(recibido, esperado)) {
    return { ok: false, status: 401, error: 'Credencial inválida.' }
  }
  return { ok: true }
}
