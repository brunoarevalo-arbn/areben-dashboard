import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthPage = request.nextUrl.pathname.startsWith('/login')
  // La vuelta de Google (/auth/callback) llega SIN sesión a propósito: trae el
  // `code` que todavía hay que canjear. Si el guard la tratara como una ruta
  // privada la mandaría al login y el ingreso nunca cerraría (login → Google →
  // callback → login → ...).
  const isOAuthCallback = request.nextUrl.pathname.startsWith('/auth/')
  // `/horas/<token>` es la carga de horas extras del propio empleado: entra SIN sesión
  // a propósito, porque los empleados no tienen usuario del dashboard. La autorización
  // es el token del link, y del otro lado todo lo que llega nace PENDIENTE: sin que
  // alguien lo apruebe no se paga nada. Ver `app/actions/horas-publicas.ts`.
  const isCargaHoras = request.nextUrl.pathname.startsWith('/horas/')

  if (!user && !isAuthPage && !isOAuthCallback && !isCargaHoras) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
