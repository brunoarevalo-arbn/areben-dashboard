'use client'

import { useState, useMemo } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Banknote, Building2, CreditCard, FileCheck, ArrowDownCircle,
  Filter, Search, Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Pago {
  id: string
  compra_id: string | null
  tipo_origen: string
  monto: number
  moneda: string
  fecha_emision: string
  fecha_vencimiento: string | null
  condicion_pago: string
  instrumento: string
  numero_cheque: string | null
  banco_emisor: string | null
  numero_cuota: number | null
  total_cuotas: number | null
  notas: string | null
  created_at: string
  compra?: {
    descripcion: string
    monto_total: number
    proveedor?: { nombre: string } | null
  } | null
}

const INSTRUMENTO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CUENTA_CORRIENTE: 'Cta. Cte.',
  CHEQUE_FISICO: 'Cheque',
  ECHEQ: 'E-Cheq',
}

const INSTRUMENTO_COLOR: Record<string, string> = {
  EFECTIVO: 'text-green-400 bg-green-500/10 border-green-500/20',
  TRANSFERENCIA: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  CUENTA_CORRIENTE: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  CHEQUE_FISICO: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  ECHEQ: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
}

const INSTRUMENTO_ICON: Record<string, React.ElementType> = {
  EFECTIVO: Banknote,
  TRANSFERENCIA: Building2,
  CUENTA_CORRIENTE: CreditCard,
  CHEQUE_FISICO: FileCheck,
  ECHEQ: FileCheck,
}

const CONDICION_LABEL: Record<string, string> = {
  CONTADO: 'Contado',
  A_PLAZO: 'A Plazo',
  EN_CUOTAS: 'En Cuotas',
}

const INSTRUMENTOS = ['TODOS', 'EFECTIVO', 'TRANSFERENCIA', 'CUENTA_CORRIENTE', 'CHEQUE_FISICO', 'ECHEQ']

function InstrumentoBadge({ instrumento }: { instrumento: string }) {
  const Icon = INSTRUMENTO_ICON[instrumento] ?? ArrowDownCircle
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium',
      INSTRUMENTO_COLOR[instrumento] ?? 'text-slate-400 bg-slate-500/10 border-slate-500/20'
    )}>
      <Icon className="w-3 h-3" />
      {INSTRUMENTO_LABEL[instrumento] ?? instrumento}
    </span>
  )
}

export function PagosClient({ pagos }: { pagos: Pago[] }) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroInstrumento, setFiltroInstrumento] = useState('TODOS')

  const pagosFiltrados = useMemo(() => {
    return pagos.filter((p) => {
      if (filtroInstrumento !== 'TODOS' && p.instrumento !== filtroInstrumento) return false
      if (busqueda) {
        const q = busqueda.toLowerCase()
        const desc = p.compra?.descripcion?.toLowerCase() ?? ''
        const prov = (p.compra?.proveedor as { nombre: string } | null)?.nombre?.toLowerCase() ?? ''
        const cheque = p.numero_cheque?.toLowerCase() ?? ''
        if (!desc.includes(q) && !prov.includes(q) && !cheque.includes(q)) return false
      }
      return true
    })
  }, [pagos, filtroInstrumento, busqueda])

  const totalPagado = pagosFiltrados.reduce((s, p) => s + p.monto, 0)

  const porInstrumento = useMemo(() => {
    const map: Record<string, number> = {}
    pagos.forEach((p) => {
      map[p.instrumento] = (map[p.instrumento] ?? 0) + p.monto
    })
    return map
  }, [pagos])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Egresos — Pagos</h1>
        <p className="text-sm text-slate-400 mt-0.5">{pagos.length} pagos registrados</p>
      </div>

      {/* KPIs por instrumento */}
      <div className="grid grid-cols-5 gap-3">
        {(['EFECTIVO', 'TRANSFERENCIA', 'CUENTA_CORRIENTE', 'CHEQUE_FISICO', 'ECHEQ'] as const).map((inst) => {
          const Icon = INSTRUMENTO_ICON[inst] ?? ArrowDownCircle
          return (
            <button
              key={inst}
              onClick={() => setFiltroInstrumento(filtroInstrumento === inst ? 'TODOS' : inst)}
              className={cn(
                'text-left bg-slate-900 border rounded-xl p-4 transition-all',
                filtroInstrumento === inst
                  ? 'border-indigo-500/50 ring-1 ring-indigo-500/30'
                  : 'border-slate-800 hover:border-slate-700'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-3.5 h-3.5 text-slate-400" />
                <p className="text-xs text-slate-400">{INSTRUMENTO_LABEL[inst]}</p>
              </div>
              <p className="text-base font-bold text-slate-100">
                {formatCurrency(porInstrumento[inst] ?? 0)}
              </p>
            </button>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar compra, proveedor, cheque..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          {INSTRUMENTOS.map((inst) => (
            <button
              key={inst}
              onClick={() => setFiltroInstrumento(inst)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filtroInstrumento === inst
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
              )}
            >
              {inst === 'TODOS' ? 'Todos' : INSTRUMENTO_LABEL[inst]}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Concepto / Proveedor</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Instrumento</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Condición</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Monto</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Emisión</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Vencimiento</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {pagosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  <ArrowDownCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No hay pagos registrados
                </td>
              </tr>
            ) : (
              pagosFiltrados.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <p className="text-slate-100 font-medium truncate max-w-[220px]">
                      {p.compra?.descripcion ?? '—'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {(p.compra?.proveedor as { nombre: string } | null)?.nombre ?? '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <InstrumentoBadge instrumento={p.instrumento} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {CONDICION_LABEL[p.condicion_pago] ?? p.condicion_pago}
                    {p.numero_cuota && p.total_cuotas && (
                      <span className="text-slate-500 ml-1">
                        ({p.numero_cuota}/{p.total_cuotas})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-100">
                    {formatCurrency(p.monto)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {formatDate(p.fecha_emision)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {p.fecha_vencimiento ? (
                      <span className="flex items-center gap-1 text-amber-400">
                        <Calendar className="w-3 h-3" />
                        {formatDate(p.fecha_vencimiento)}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {p.numero_cheque && <span>Nro. {p.numero_cheque}</span>}
                    {p.banco_emisor && <span className="ml-1">· {p.banco_emisor}</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {pagosFiltrados.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-700 bg-slate-800/50">
                <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-slate-300">
                  TOTAL ({pagosFiltrados.length} pagos)
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-slate-100">
                  {formatCurrency(totalPagado)}
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
