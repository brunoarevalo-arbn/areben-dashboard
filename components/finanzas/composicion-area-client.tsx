'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/input'
import { formatCurrency, formatDate, getMonthOptions } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { SeccionComposicion } from '@/app/actions/composicion-cierre'

/**
 * Vista genérica de "composición de un área": por cada sección muestra
 * saldo inicio → movimientos del mes (fecha · concepto · monto) → saldo cierre.
 * Reutilizable para posición de mercadería, activo fijo, cuentas particulares, etc.
 */
export function ComposicionAreaClient({
  mes,
  titulo,
  subtitulo,
  secciones,
}: {
  mes: string
  titulo: string
  subtitulo?: string
  secciones: SeccionComposicion[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setMes(nuevo: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', nuevo)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-fg">{titulo}</h2>
          {subtitulo && <p className="text-sm text-fg-soft mt-0.5">{subtitulo}</p>}
        </div>
        <Select options={getMonthOptions(24)} value={mes} onChange={(e) => setMes(e.target.value)} className="w-44" />
      </div>

      {secciones.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-fg-soft">
          No hay datos para {mes}.
        </div>
      ) : (
        secciones.map((s) => (
          <div key={s.titulo} className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-surface-2/50 border-b border-border flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-fg">{s.titulo}</h3>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-fg-soft">Saldo inicio <span className="font-mono text-fg-muted">{formatCurrency(s.saldoInicio, s.moneda)}</span></span>
                <span className="text-fg-soft">Saldo cierre <span className="font-mono font-semibold text-fg">{formatCurrency(s.saldoCierre, s.moneda)}</span></span>
              </div>
            </div>
            {s.movimientos.length === 0 ? (
              <p className="px-4 py-4 text-sm text-fg-soft">Sin movimientos en el mes.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-fg-soft border-b border-border">
                      <th className="text-left font-medium px-4 py-2">Fecha</th>
                      <th className="text-left font-medium px-4 py-2">Concepto</th>
                      <th className="text-right font-medium px-4 py-2">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr className="text-fg-soft">
                      <td className="px-4 py-2" />
                      <td className="px-4 py-2 italic">Saldo inicio</td>
                      <td className="px-4 py-2 text-right font-mono">{formatCurrency(s.saldoInicio, s.moneda)}</td>
                    </tr>
                    {s.movimientos.map((mv, i) => (
                      <tr key={i} className="hover:bg-surface-2/30">
                        <td className="px-4 py-2 text-fg-soft whitespace-nowrap">{formatDate(mv.fecha)}</td>
                        <td className="px-4 py-2 text-fg-muted">{mv.concepto}</td>
                        <td className={cn('px-4 py-2 text-right font-mono', mv.monto >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                          {mv.monto >= 0 ? '+' : ''}{formatCurrency(mv.monto, s.moneda)}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold border-t border-border-strong">
                      <td className="px-4 py-2" />
                      <td className="px-4 py-2">Saldo cierre</td>
                      <td className="px-4 py-2 text-right font-mono">{formatCurrency(s.saldoCierre, s.moneda)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
