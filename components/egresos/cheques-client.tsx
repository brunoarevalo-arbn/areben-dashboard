'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { debitarCheque } from '@/app/actions/compras'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useSort, SortTh } from '@/components/ui/sortable'
import {
  FileCheck, AlertTriangle, Clock, CheckCircle2, Search, X, Loader2, Wallet,
} from 'lucide-react'
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
  cuit_beneficiario: string | null
  cuenta_id: string | null
  debitado: boolean
  fecha_debito: string | null
  numero_cuota: number | null
  total_cuotas: number | null
  notas: string | null
  compra?: {
    descripcion: string
    proveedor?: { nombre: string } | null
  } | null
  cuenta?: { id: string; nombre: string; banco: string } | null
}

interface Cuenta {
  id: string
  nombre: string
  banco: string
}

type SortKey = 'fecha_vencimiento' | 'monto' | 'numero_cheque' | 'banco_emisor' | 'proveedor' | 'cuenta'
type EstadoFiltro = 'PENDIENTE' | 'PAGADO' | 'TODOS'

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
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-fg-soft/10 text-fg-soft border border-border">
      En {dias}d
    </span>
  )
}

export function ChequesClient({ cheques, cuentas }: { cheques: Cheque[]; cuentas: Cuenta[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>('PENDIENTE')
  const { sortKey, sortDir, toggleSort, sortRows } = useSort<SortKey>('fecha_vencimiento', 'asc')
  const [cobrarTarget, setCobrarTarget] = useState<Cheque | null>(null)

  const chequesFiltrados = useMemo(() => {
    const filtrados = cheques.filter((c) => {
      if (estadoFiltro === 'PENDIENTE' && c.debitado) return false
      if (estadoFiltro === 'PAGADO' && !c.debitado) return false
      if (search) {
        const q = search.toLowerCase()
        const haystack = [
          c.numero_cheque,
          c.banco_emisor,
          c.cuit_beneficiario,
          c.compra?.descripcion,
          (c.compra?.proveedor as { nombre: string } | null)?.nombre,
          c.cuenta?.nombre,
          c.cuenta?.banco,
          String(c.monto),
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
    return sortRows(filtrados, (c, k): string | number => {
      switch (k) {
        case 'fecha_vencimiento': return c.fecha_vencimiento ?? '9999-99-99'
        case 'monto': return Number(c.monto)
        case 'numero_cheque': return (c.numero_cheque ?? '').toLowerCase()
        case 'banco_emisor': return ((c.cuenta?.banco ?? c.banco_emisor) ?? '').toLowerCase()
        case 'proveedor': return ((c.compra?.proveedor as { nombre: string } | null)?.nombre ?? '').toLowerCase()
        case 'cuenta': return (c.cuenta?.nombre ?? '').toLowerCase()
        default: return ''
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cheques, estadoFiltro, search, sortKey, sortDir])

  // KPIs (sobre todos los cheques, no los filtrados — son el "panorama")
  const pendientes = cheques.filter((c) => !c.debitado)
  const stats = {
    totalCartera: pendientes.reduce((s, c) => s + Number(c.monto), 0),
    cantTotal: pendientes.length,
    vencidos: {
      cant: pendientes.filter((c) => {
        const d = diasHasta(c.fecha_vencimiento)
        return d !== null && d < 0
      }).length,
      monto: pendientes.filter((c) => {
        const d = diasHasta(c.fecha_vencimiento)
        return d !== null && d < 0
      }).reduce((s, c) => s + Number(c.monto), 0),
    },
    proximos7: {
      cant: pendientes.filter((c) => {
        const d = diasHasta(c.fecha_vencimiento)
        return d !== null && d >= 0 && d <= 7
      }).length,
      monto: pendientes.filter((c) => {
        const d = diasHasta(c.fecha_vencimiento)
        return d !== null && d >= 0 && d <= 7
      }).reduce((s, c) => s + Number(c.monto), 0),
    },
    proximos30: {
      cant: pendientes.filter((c) => {
        const d = diasHasta(c.fecha_vencimiento)
        return d !== null && d >= 0 && d <= 30
      }).length,
      monto: pendientes.filter((c) => {
        const d = diasHasta(c.fecha_vencimiento)
        return d !== null && d >= 0 && d <= 30
      }).reduce((s, c) => s + Number(c.monto), 0),
    },
  }

  const totalFiltrado = chequesFiltrados.reduce((s, c) => s + Number(c.monto), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg">Cartera de Cheques</h1>
        <p className="text-sm text-fg-muted mt-0.5">
          {chequesFiltrados.length === cheques.length
            ? `${cheques.length} cheque${cheques.length !== 1 ? 's' : ''} en cartera`
            : `${chequesFiltrados.length} de ${cheques.length} cheques`}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Total cartera (pendientes)</p>
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
      <div className="bg-surface border border-border rounded-xl">
        {/* Filtros */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-soft pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar (nº cheque, banco, proveedor, CUIT, monto)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg pl-9 pr-9 py-2 text-sm text-fg placeholder:text-fg-soft focus:outline-none focus:border-orange-500/60"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-surface text-fg-soft hover:text-fg"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-1">
              {([
                { v: 'PENDIENTE' as const, label: 'Pendientes', color: 'amber' },
                { v: 'PAGADO' as const, label: 'Pagados', color: 'green' },
                { v: 'TODOS' as const, label: 'Todos', color: 'orange' },
              ]).map(({ v, label, color }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setEstadoFiltro(v)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium border transition-colors',
                    estadoFiltro === v
                      ? color === 'green'
                        ? 'bg-green-500/15 border-green-500/40 text-green-700'
                        : color === 'amber'
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-700'
                          : 'bg-orange-500/15 border-orange-500/40 text-orange-600'
                      : 'bg-surface-2 border-border text-fg-muted hover:text-fg'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {([
                  { key: 'fecha_vencimiento', label: 'Vencimiento', align: 'left' },
                  { key: 'numero_cheque', label: 'Nº cheque', align: 'left' },
                  { key: 'banco_emisor', label: 'Tipo / Banco', align: 'left' },
                  { key: 'cuenta', label: 'Cuenta emisora', align: 'left' },
                  { key: 'proveedor', label: 'Concepto / Beneficiario', align: 'left' },
                  { key: 'monto', label: 'Monto', align: 'right', numeric: true },
                ] as { key: SortKey; label: string; align: 'left' | 'right'; numeric?: boolean }[]).map((col) => (
                  <SortTh key={col.key} col={col.key} label={col.label} align={col.align} numeric={col.numeric}
                    sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                ))}
                <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {chequesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-fg-soft">
                    <FileCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    {cheques.length === 0 ? 'No hay cheques en cartera' : 'Sin resultados con los filtros activos'}
                  </td>
                </tr>
              ) : (
                chequesFiltrados.map((c) => {
                  const dias = c.debitado ? null : diasHasta(c.fecha_vencimiento)
                  const urgente = dias !== null && dias <= 7
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        'border-b border-border/60 hover:bg-surface-2/30',
                        urgente && !c.debitado && 'bg-amber-500/5',
                        c.debitado && 'opacity-60',
                      )}
                    >
                      <td className="px-4 py-3 text-xs text-fg-muted font-medium whitespace-nowrap">
                        {c.fecha_vencimiento ? formatDate(c.fecha_vencimiento) : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-fg text-xs">
                        {c.numero_cheque ?? <span className="text-fg-muted">—</span>}
                      </td>
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
                      <td className="px-4 py-3 text-xs text-fg-muted">
                        {c.cuenta ? (
                          <>
                            <p className="text-fg font-medium">{c.cuenta.banco}</p>
                            <p className="text-xs text-fg-soft">{c.cuenta.nombre}</p>
                          </>
                        ) : (
                          <span className="text-fg-soft">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-fg font-medium truncate max-w-[200px]">
                          {c.compra?.descripcion ?? '—'}
                        </p>
                        <p className="text-xs text-fg-soft">
                          {(c.compra?.proveedor as { nombre: string } | null)?.nombre ?? '—'}
                          {c.cuit_beneficiario && (
                            <span className="ml-1 text-fg-muted font-mono">· CUIT {c.cuit_beneficiario}</span>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-fg whitespace-nowrap">
                        {formatCurrency(c.monto)}
                      </td>
                      <td className="px-4 py-3">
                        {c.debitado ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-700 border border-green-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            Pagado {c.fecha_debito && `· ${formatDate(c.fecha_debito)}`}
                          </span>
                        ) : (
                          <EstadoCheque dias={dias} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!c.debitado && (
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => setCobrarTarget(c)}
                            disabled={isPending}
                            title="Marcar el cheque como pagado (debitado de la cuenta emisora)"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            Marcar pagado
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {chequesFiltrados.length > 0 && (
              <tfoot>
                <tr className="border-t border-border-strong bg-surface-2/50">
                  <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-fg-muted">
                    TOTAL {estadoFiltro === 'PENDIENTE' ? 'PENDIENTES' : estadoFiltro === 'PAGADO' ? 'PAGADOS' : 'FILTRADO'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-fg whitespace-nowrap">
                    {formatCurrency(totalFiltrado)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal marcar pagado */}
      <Modal
        open={!!cobrarTarget}
        onOpenChange={(o) => { if (!o) setCobrarTarget(null) }}
        title={`Marcar cheque como pagado`}
        className="max-w-md"
      >
        {cobrarTarget && (
          <MarcarPagadoForm
            cheque={cobrarTarget}
            cuentas={cuentas}
            onClose={() => { setCobrarTarget(null); router.refresh() }}
          />
        )}
      </Modal>
    </div>
  )
}

// ─── MarcarPagadoForm ────────────────────────────────────────────────────────

function MarcarPagadoForm({ cheque, cuentas, onClose }: { cheque: Cheque; cuentas: Cuenta[]; onClose: () => void }) {
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [cuentaId, setCuentaId] = useState(cheque.cuenta_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        await debitarCheque(cheque.id, fecha, cuentaId || undefined)
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-2 rounded-lg p-3 space-y-1">
        <p className="text-sm text-fg">
          Cheque <span className="font-mono font-medium">{cheque.numero_cheque ?? 's/n'}</span>
          {' '}por <span className="font-mono font-medium">{formatCurrency(cheque.monto)}</span>
        </p>
        {cheque.cuenta && (
          <p className="text-xs text-fg-soft">
            Se debitará de: {cheque.cuenta.banco} — {cheque.cuenta.nombre}
          </p>
        )}
        {cheque.compra?.proveedor && (
          <p className="text-xs text-fg-soft">
            Para: {(cheque.compra.proveedor as { nombre: string }).nombre}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-fg-muted">Fecha en que se debitó</label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          required
          className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-fg-muted">Origen de los fondos</label>
        <select
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
          className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
        >
          <option value="">— Sin especificar —</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.banco} · {c.nombre}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="button" variant="success" onClick={submit} disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Marcar pagado
        </Button>
      </div>
    </div>
  )
}
