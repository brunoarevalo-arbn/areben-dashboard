'use client'

import { useMemo } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileCheck, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Cheque {
  id: string
  compra_id: string | null
  tipo_origen: string
  monto: number
  instrumento: string
  fecha_emision: string
  fecha_vencimiento: string | null
  numero_cheque: string | null
  banco_emisor: string | null
  numero_cuota: number | null
  total_cuotas: number | null
  notas: string | null
  compra?: {
    descripcion: string
    proveedor?: { nombre: string } | null
  } | null
}

function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const venc = new Date(fecha + 'T00:00:00')
  return Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

function EstadoCheque({ dias }: { dias: number | null }) {
  if (dias === null) return <span className="text-fg-muted text-xs">Sin fecha</span>
  if (dias < 0)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-700 border border-red-500/20">
        <AlertTriangle className="w-3 h-3" />
        Vencido hace {Math.abs(dias)}d
      </span>
    )
  if (dias === 0)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-700 border border-red-500/20">
        <AlertTriangle className="w-3 h-3" />
        Vence hoy
      </span>
    )
  if (dias <= 7)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-700 border border-amber-500/20">
        <Clock className="w-3 h-3" />
        En {dias}d
      </span>
    )
  if (dias <= 30)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
        <Clock className="w-3 h-3" />
        En {dias}d
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-2/50 text-fg-muted border border-[#c8c0b0]/30">
      <CheckCircle2 className="w-3 h-3" />
      En {dias}d
    </span>
  )
}

export function ChequesClient({ cheques }: { cheques: Cheque[] }) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const stats = useMemo(() => {
    const vencidos = cheques.filter((c) => {
      const d = diasHasta(c.fecha_vencimiento)
      return d !== null && d < 0
    })
    const proximos7 = cheques.filter((c) => {
      const d = diasHasta(c.fecha_vencimiento)
      return d !== null && d >= 0 && d <= 7
    })
    const proximos30 = cheques.filter((c) => {
      const d = diasHasta(c.fecha_vencimiento)
      return d !== null && d >= 0 && d <= 30
    })
    const totalCartera = cheques.reduce((s, c) => s + c.monto, 0)
    return {
      totalCartera,
      cantTotal: cheques.length,
      vencidos: { cant: vencidos.length, monto: vencidos.reduce((s, c) => s + c.monto, 0) },
      proximos7: { cant: proximos7.length, monto: proximos7.reduce((s, c) => s + c.monto, 0) },
      proximos30: { cant: proximos30.length, monto: proximos30.reduce((s, c) => s + c.monto, 0) },
    }
  }, [cheques])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg">Cartera de Cheques</h1>
        <p className="text-sm text-fg-muted mt-0.5">
          {cheques.length} cheque{cheques.length !== 1 ? 's' : ''} en cartera
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Total en cartera</p>
          <p className="text-xl font-bold text-fg">{formatCurrency(stats.totalCartera)}</p>
          <p className="text-xs text-fg-soft mt-0.5">{stats.cantTotal} cheques</p>
        </div>
        <div className={cn(
          'bg-surface border rounded-xl p-4',
          stats.vencidos.cant > 0 ? 'border-red-500/30' : 'border-border'
        )}>
          <p className="text-xs text-fg-muted mb-1">Vencidos</p>
          <p className={cn('text-xl font-bold', stats.vencidos.cant > 0 ? 'text-red-700' : 'text-fg')}>
            {formatCurrency(stats.vencidos.monto)}
          </p>
          <p className="text-xs text-fg-soft mt-0.5">{stats.vencidos.cant} cheques</p>
        </div>
        <div className={cn(
          'bg-surface border rounded-xl p-4',
          stats.proximos7.cant > 0 ? 'border-amber-500/30' : 'border-border'
        )}>
          <p className="text-xs text-fg-muted mb-1">Vencen en 7 días</p>
          <p className={cn('text-xl font-bold', stats.proximos7.cant > 0 ? 'text-amber-700' : 'text-fg')}>
            {formatCurrency(stats.proximos7.monto)}
          </p>
          <p className="text-xs text-fg-soft mt-0.5">{stats.proximos7.cant} cheques</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Vencen en 30 días</p>
          <p className="text-xl font-bold text-fg">{formatCurrency(stats.proximos30.monto)}</p>
          <p className="text-xs text-fg-soft mt-0.5">{stats.proximos30.cant} cheques</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Nro. Cheque</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Banco</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Concepto / Proveedor</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Monto</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Emisión</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Vencimiento</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Estado</th>
            </tr>
          </thead>
          <tbody>
            {cheques.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-fg-soft">
                  <FileCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No hay cheques en cartera
                </td>
              </tr>
            ) : (
              cheques.map((c) => {
                const dias = diasHasta(c.fecha_vencimiento)
                const urgente = dias !== null && dias <= 7
                return (
                  <tr
                    key={c.id}
                    className={cn(
                      'border-b border-border/60 hover:bg-surface-2/30',
                      urgente && 'bg-amber-500/5'
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium',
                        c.instrumento === 'ECHEQ'
                          ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                          : 'text-amber-700 bg-amber-500/10 border-amber-500/20'
                      )}>
                        <FileCheck className="w-3 h-3" />
                        {c.instrumento === 'ECHEQ' ? 'E-Cheq' : 'Físico'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-fg-muted text-xs">
                      {c.numero_cheque ?? <span className="text-fg-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-muted">
                      {c.banco_emisor ?? <span className="text-fg-muted">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-fg font-medium truncate max-w-[180px]">
                        {c.compra?.descripcion ?? '—'}
                      </p>
                      <p className="text-xs text-fg-soft">
                        {(c.compra?.proveedor as { nombre: string } | null)?.nombre ?? '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-fg">
                      {formatCurrency(c.monto)}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-muted">
                      {formatDate(c.fecha_emision)}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-muted font-medium">
                      {c.fecha_vencimiento ? formatDate(c.fecha_vencimiento) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoCheque dias={dias} />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          {cheques.length > 0 && (
            <tfoot>
              <tr className="border-t border-border-strong bg-surface-2/50">
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-fg-muted">
                  TOTAL CARTERA
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-fg">
                  {formatCurrency(stats.totalCartera)}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
