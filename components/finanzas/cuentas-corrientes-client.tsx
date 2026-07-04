'use client'

import { useState, Fragment } from 'react'
import Link from 'next/link'
import { formatCurrency, formatMonth, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Wallet, ArrowLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Detalle {
  id: string
  mes: string
  monto: number
  pagado: number
  saldo: number
  estado: string
}

interface Cuenta {
  recurrente_id: string
  nombre: string
  activo: boolean
  moneda: 'ARS' | 'USD'
  devengado: number
  pagado: number
  saldo: number
  ultimoPago: string | null
  detalles: Detalle[]
}

export function CuentasCorrientesClient({ cuentas }: { cuentas: Cuenta[] }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const totalSaldo = cuentas.reduce((s, c) => s + c.saldo, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Wallet className="w-6 h-6 text-amber-700" />
            Cuentas corrientes
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">
            Cuánto le debés a cada proveedor / servicio (saldo que se arrastra, sin fecha fija de pago)
          </p>
        </div>
        <Link
          href="/finanzas/pendientes"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm text-fg-muted hover:text-fg border border-border rounded-lg hover:bg-surface-2/60 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Pendientes
        </Link>
      </div>

      {/* Total */}
      <div className="bg-surface border border-amber-500/20 rounded-xl p-5">
        <p className="text-xs text-fg-muted mb-1">Total que debés en cuentas corrientes</p>
        <p className="text-2xl font-bold text-amber-700">{formatCurrency(totalSaldo)}</p>
        <p className="text-xs text-fg-soft mt-1">{cuentas.length} proveedor(es) / servicio(s) con saldo pendiente</p>
      </div>

      {cuentas.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <p className="text-sm text-fg-muted">No hay cuentas corrientes con saldo pendiente. 🎉</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/40">
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Proveedor / Servicio</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Devengado</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Pagado</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Saldo</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Últ. pago</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => {
                const open = abierto === c.recurrente_id
                return (
                  <Fragment key={c.recurrente_id}>
                    <tr
                      className="border-b border-border/60 hover:bg-surface-2/30 cursor-pointer"
                      onClick={() => setAbierto(open ? null : c.recurrente_id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-fg">{c.nombre}</span>
                          {!c.activo && <Badge variant="default">inactivo</Badge>}
                        </div>
                        <p className="text-xs text-fg-soft">{c.detalles.length} mes(es) cargado(s)</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-fg-muted">{formatCurrency(c.devengado, c.moneda)}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-700">{formatCurrency(c.pagado, c.moneda)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-amber-700">{formatCurrency(c.saldo, c.moneda)}</td>
                      <td className="px-4 py-3 text-right text-xs text-fg-soft">{c.ultimoPago ? formatDate(c.ultimoPago) : '—'}</td>
                      <td className="px-2 py-3 text-right">
                        <ChevronRight className={cn('w-4 h-4 text-fg-soft transition-transform', open && 'rotate-90')} />
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-surface-2/20">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="space-y-1">
                            {c.detalles.map((d) => (
                              <div key={d.id} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                                <span className="text-fg-muted">{formatMonth(d.mes)}</span>
                                <div className="flex items-center gap-4 font-mono">
                                  <span className="text-fg-soft">dev {formatCurrency(d.monto, c.moneda)}</span>
                                  <span className="text-green-700">pag {formatCurrency(d.pagado, c.moneda)}</span>
                                  <span className={cn('font-semibold', d.saldo > 0 ? 'text-amber-700' : 'text-fg-soft')}>
                                    saldo {formatCurrency(d.saldo, c.moneda)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
