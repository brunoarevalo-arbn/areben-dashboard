import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Vuelta del flujo de OAuth (Google). Supabase redirige acá con un `code` que
 * hay que canjear por la sesión, o con `error_description` si algo falló.
 *
 * El caso de error que más importa: los signups están cerrados a propósito, así
 * que alguien de @arebensrl.com que autentica bien pero NO tiene usuario dado de
 * alta llega con "Signups not allowed". No es un error del sistema — es la
 * respuesta correcta — y por eso se traduce a un mensaje entendible en vez de
 * mostrar el crudo de Supabase.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const errorDescription = searchParams.get('error_description')

  if (errorDescription) {
    return NextResponse.redirect(`${origin}/login?error=${mensajeDe(errorDescription)}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    return NextResponse.redirect(`${origin}/login?error=${mensajeDe(error.message)}`)
  }

  return NextResponse.redirect(`${origin}/login?error=sin-codigo`)
}

function mensajeDe(raw: string): string {
  return /signups? not allowed|signup is disabled/i.test(raw) ? 'sin-acceso' : 'google'
}
