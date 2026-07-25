'use client'

import { useActionState, useState } from 'react'
import { signIn } from '@/app/actions/auth'
import { createClient } from '@/lib/supabase/client'
import { Building2, Loader2 } from 'lucide-react'

const MENSAJES: Record<string, string> = {
  'sin-acceso':
    'Tu cuenta de Google es válida, pero no tiene acceso a este sistema. Pedile el alta a Bruno.',
  google: 'No se pudo completar el ingreso con Google. Probá de nuevo.',
  'sin-codigo': 'El ingreso con Google quedó a medias. Probá de nuevo.',
}

export function LoginForm({ errorInicial }: { errorInicial?: string }) {
  const [error, action, isPending] = useActionState(signIn, null)
  const [googleCargando, setGoogleCargando] = useState(false)
  const [errorGoogle, setErrorGoogle] = useState<string | null>(
    errorInicial ? (MENSAJES[errorInicial] ?? MENSAJES.google) : null
  )

  const entrarConGoogle = async () => {
    setErrorGoogle(null)
    setGoogleCargando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // La pantalla de consentimiento ya es "Interna", así que Google solo
        // acepta cuentas de la organización. `hd` es cinturón y tiradores: evita
        // que el selector siquiera ofrezca una cuenta personal.
        queryParams: { hd: 'arebensrl.com' },
      },
    })
    if (error) {
      setErrorGoogle(MENSAJES.google)
      setGoogleCargando(false)
    }
  }

  const mensajeError = errorGoogle ?? error

  return (
    <div className="w-full max-w-md">
      <div className="bg-surface border border-border rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-fg">Areben Dashboard</h1>
          <p className="text-sm text-fg-muted mt-1">Sistema de gestión financiera</p>
        </div>

        <button
          type="button"
          onClick={entrarConGoogle}
          disabled={googleCargando}
          className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed border border-border-strong text-slate-800 font-medium rounded-lg transition-colors flex items-center justify-center gap-2.5"
        >
          {googleCargando ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <LogoGoogle />
          )}
          Entrar con Google
        </button>

        <p className="text-center text-xs text-fg-muted mt-3">
          Si tenés mail <span className="font-medium">@arebensrl.com</span>, entrá con Google.
        </p>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-fg-soft">o con usuario y contraseña</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form action={action} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-1.5">
              Email
            </label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full px-3.5 py-2.5 bg-surface-2 border border-border-strong rounded-lg text-fg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="hola@areben.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted mb-1.5">
              Contraseña
            </label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 bg-surface-2 border border-border-strong rounded-lg text-fg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="••••••••"
            />
          </div>

          {mensajeError && (
            <div className="px-3.5 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-700">
              {mensajeError}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 px-4 bg-orange-500 hover:bg-orange-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Ingresando...
              </>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-fg-soft mt-6">
          Zattia · Stunned · BDI Accesorios
        </p>
      </div>
    </div>
  )
}

function LogoGoogle() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14Z"
      />
    </svg>
  )
}
