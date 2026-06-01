'use client'

import { useActionState } from 'react'
import { signIn } from '@/app/actions/auth'
import { Building2, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [error, action, isPending] = useActionState(signIn, null)

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

          {error && (
            <div className="px-3.5 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-700">
              {error}
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
