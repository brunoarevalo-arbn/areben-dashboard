'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { deleteCompra, createPago } from '@/app/actions/compras'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { MarcaBadge } from '@/components/ui/badge'
import { formatCurrency, formatDate, getMonthOptions } from '@/lib/utils'
import {
  Plus, Trash2, ShoppingCart, Loader2,
  CreditCard, Banknote, Building2, FileCheck, AlertCircle, PlusCircle, X, Pencil,
  Search, ArrowUp, ArrowDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CompraForm } from './compra-form'

export interface Proveedor {
  id: string
  nombre: string
}

export interface Pago {
  id: string
  monto: number
  fecha_emision: string
  instrumento: string
  condicion_pago: string
  numero_cuota?: number | null
  total_cuotas?: number | null
  fecha_vencimiento?: string | null
}

export interface Compra {
  id: string
  descripcion: string
  proveedor_id: string
  fecha: string
  negocio: string
  moneda: string
  monto_total: number
  porcentaje_facturacion: number
  monto_neto: number
  iva: number
  estado: string
  saldo_pendiente: number
  notas?: string | null
  proveedor?: { nombre: string } | null
  pagos?: Pago[]
}

const INSTRUMENTO_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CUENTA_CORRIENTE: 'Cuenta Corriente',
  CHEQUE_FISICO: 'Cheque Físico',
  ECHEQ: 'E-Cheq',
}

const INSTRUMENTO_ICONS: Record<string, React.ReactNode> = {
  EFECTIVO: <Banknote className="w-3.5 h-3.5" />,
  TRANSFERENCIA: <Building2 className="w-3.5 h-3.5" />,
  CUENTA_CORRIENTE: <CreditCard className="w-3.5 h-3.5" />,
  CHEQUE_FISICO: <FileCheck className="w-3.5 h-3.5" />,
  ECHEQ: <FileCheck className="w-3.5 h-3.5" />,
}

// ─── PaymentDialog ────────────────────────────────────────────────────────────

type Condicion = 'CONTADO' | 'A_PLAZO' | 'EN_CUOTAS'
type Instrumento = 'EFECTIVO' | 'TRANSFERENCIA' | 'CUENTA_CORRIENTE' | 'CHEQUE_FISICO' | 'ECHEQ'

interface CuotaRow {
  monto: number
  fecha_vencimiento: string
  numero_cheque?: string
  banco_emisor?: string
}

function generarFechaOffset(mesesOffset: number) {
  const d = new Date()
  d.setMonth(d.getMonth() + mesesOffset)
  return d.toISOString().split('T')[0]
}

function generarCuotas(n: number, base: number): CuotaRow[] {
  const montoCuota = Math.round((base / n) * 100) / 100
  return Array.from({ length: n }, (_, i) => ({
    monto:
      i === n - 1
        ? Math.round((base - montoCuota * (n - 1)) * 100) / 100
        : montoCuota,
    fecha_vencimiento: generarFechaOffset(i + 1),
  }))
}

function PaymentDialog({ compra, onClose }: { compra: Compra; onClose: () => void }) {
  const [condicion, setCondicion] = useState<Condicion>('CONTADO')
  const [instrumento, setInstrumento] = useState<Instrumento>('EFECTIVO')
  const [monto, setMonto] = useState(compra.saldo_pendiente)
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().split('T')[0])
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [numeroCheque, setNumeroCheque] = useState('')
  const [bancoEmisor, setBancoEmisor] = useState('')
  const [numCuotas, setNumCuotas] = useState(3)
  const [cuotas, setCuotas] = useState<CuotaRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const esCheque = instrumento === 'CHEQUE_FISICO' || instrumento === 'ECHEQ'

  const opcionesInstrumento =
    condicion === 'CONTADO'
      ? [
          { value: 'EFECTIVO', label: 'Efectivo' },
          { value: 'TRANSFERENCIA', label: 'Transferencia' },
        ]
      : [
          { value: 'CUENTA_CORRIENTE', label: 'Cuenta Corriente' },
          { value: 'CHEQUE_FISICO', label: 'Cheque Físico' },
          { value: 'ECHEQ', label: 'E-Cheq' },
        ]

  useEffect(() => {
    if (condicion === 'EN_CUOTAS') {
      setCuotas(generarCuotas(numCuotas, compra.saldo_pendiente))
    }
  }, [condicion, numCuotas, compra.saldo_pendiente])

  function handleCondicionChange(v: string) {
    const c = v as Condicion
    setCondicion(c)
    if (c === 'CONTADO') setInstrumento('EFECTIVO')
    else setInstrumento('CUENTA_CORRIENTE')
    setFechaVencimiento('')
  }

  function handleInstrumentoChange(v: string) {
    setInstrumento(v as Instrumento)
    if (!['CHEQUE_FISICO', 'ECHEQ'].includes(v)) setFechaVencimiento('')
  }

  function updateCuota(i: number, field: keyof CuotaRow, value: string | number) {
    setCuotas((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)))
  }

  const totalCuotas = cuotas.reduce((s, c) => s + (c.monto || 0), 0)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const fd = new FormData()
      fd.set('compra_id', compra.id)
      fd.set('fecha_emision', fechaEmision)
      fd.set('condicion_pago', condicion)
      fd.set('instrumento', instrumento)
      if (fechaVencimiento) fd.set('fecha_vencimiento', fechaVencimiento)
      if (numeroCheque) fd.set('numero_cheque', numeroCheque)
      if (bancoEmisor) fd.set('banco_emisor', bancoEmisor)

      if (condicion === 'EN_CUOTAS') {
        fd.set('cuotas', JSON.stringify(cuotas))
        fd.set('monto', String(totalCuotas))
      } else {
        fd.set('monto', String(monto))
      }

      const result = await createPago(null, fd)
      if (result) setError(result)
      else onClose()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Info compra */}
      <div className="bg-surface-2/60 rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-fg">{compra.descripcion}</p>
          <p className="text-xs text-fg-muted mt-0.5">
            {(compra.proveedor as { nombre: string } | null)?.nombre ?? '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-fg-muted">Saldo pendiente</p>
          <p className="text-lg font-bold text-amber-700">{formatCurrency(compra.saldo_pendiente)}</p>
        </div>
      </div>

      {/* Condición de pago */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-fg-muted">Condición de pago</label>
        <div className="grid grid-cols-3 gap-2">
          {(['CONTADO', 'A_PLAZO', 'EN_CUOTAS'] as Condicion[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => handleCondicionChange(c)}
              className={cn(
                'px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-center',
                condicion === c
                  ? 'bg-orange-500/20 border-orange-500/50 text-orange-600'
                  : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg-muted'
              )}
            >
              {c === 'CONTADO' ? 'Contado' : c === 'A_PLAZO' ? 'A Plazo' : 'En Cuotas'}
            </button>
          ))}
        </div>
      </div>

      {/* Instrumento */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-fg-muted">Instrumento de pago</label>
        <div className="grid grid-cols-2 gap-2">
          {opcionesInstrumento.map((op) => (
            <button
              key={op.value}
              type="button"
              onClick={() => handleInstrumentoChange(op.value)}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                instrumento === op.value
                  ? 'bg-orange-500/20 border-orange-500/50 text-orange-600'
                  : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg-muted'
              )}
            >
              {INSTRUMENTO_ICONS[op.value]}
              {op.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fecha de emisión + monto (pago único) */}
      {condicion !== 'EN_CUOTAS' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-fg-muted">Fecha de emisión</label>
            <input
              type="date"
              value={fechaEmision}
              onChange={(e) => setFechaEmision(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-surface-2 border border-border-strong rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-fg-muted">
              Monto a pagar
              {compra.saldo_pendiente > 0 && (
                <button
                  type="button"
                  onClick={() => setMonto(compra.saldo_pendiente)}
                  className="ml-2 text-xs text-primary hover:text-orange-600"
                >
                  (usar saldo)
                </button>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={monto || ''}
              onChange={(e) => setMonto(Number(e.target.value))}
              required
              className="w-full px-3.5 py-2.5 bg-surface-2 border border-border-strong rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              placeholder="0.00"
            />
          </div>
        </div>
      )}

      {/* Fecha de emisión (cuotas) */}
      {condicion === 'EN_CUOTAS' && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Fecha de emisión</label>
          <input
            type="date"
            value={fechaEmision}
            onChange={(e) => setFechaEmision(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 bg-surface-2 border border-border-strong rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
      )}

      {/* Fecha de vencimiento/cobro para cheques */}
      {condicion !== 'EN_CUOTAS' && esCheque && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
            <AlertCircle className="w-4 h-4" />
            Datos del cheque (obligatorio)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-fg-muted">
                Fecha de cobro / vencimiento *
              </label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                required
                className="w-full px-3 py-2 bg-surface-2 border border-amber-500/30 rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-fg-muted">Número de cheque</label>
              <input
                type="text"
                value={numeroCheque}
                onChange={(e) => setNumeroCheque(e.target.value)}
                placeholder="Nro. cheque"
                className="w-full px-3 py-2 bg-surface-2 border border-border-strong rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-fg-muted">Banco emisor</label>
            <input
              type="text"
              value={bancoEmisor}
              onChange={(e) => setBancoEmisor(e.target.value)}
              placeholder="Ej: Banco Nación"
              className="w-full px-3 py-2 bg-surface-2 border border-border-strong rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
        </div>
      )}

      {/* Tabla de cuotas */}
      {condicion === 'EN_CUOTAS' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-fg-muted">Cuotas</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNumCuotas((n) => Math.max(2, n - 1))}
                className="w-7 h-7 rounded-lg bg-surface-2 hover:bg-slate-600 text-fg-muted flex items-center justify-center text-lg font-bold"
              >
                −
              </button>
              <span className="text-sm font-mono text-fg-muted w-8 text-center">{numCuotas}</span>
              <button
                type="button"
                onClick={() => setNumCuotas((n) => Math.min(36, n + 1))}
                className="w-7 h-7 rounded-lg bg-surface-2 hover:bg-slate-600 text-fg-muted flex items-center justify-center text-lg font-bold"
              >
                +
              </button>
            </div>
          </div>

          {esCheque && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
              <FileCheck className="w-3.5 h-3.5 shrink-0" />
              Cada cuota es un cheque distinto. Cargá número y banco por cuota.
            </div>
          )}

          <div className="bg-surface-2/60 rounded-xl overflow-x-auto border border-border-strong/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong">
                  <th className="text-left px-2 py-2 text-xs text-fg-muted font-medium w-8">#</th>
                  <th className="text-left px-2 py-2 text-xs text-fg-muted font-medium">Monto</th>
                  <th className="text-left px-2 py-2 text-xs text-fg-muted font-medium">Vencimiento</th>
                  {esCheque && (
                    <>
                      <th className="text-left px-2 py-2 text-xs text-fg-muted font-medium">Nº cheque</th>
                      <th className="text-left px-2 py-2 text-xs text-fg-muted font-medium">Banco</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {cuotas.map((c, i) => (
                  <tr key={i} className="border-b border-border-strong/50 last:border-0">
                    <td className="px-2 py-1.5 text-fg-soft font-mono text-xs">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={c.monto || ''}
                        onChange={(e) => updateCuota(i, 'monto', Number(e.target.value))}
                        className="w-full px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-fg font-mono focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        value={c.fecha_vencimiento}
                        onChange={(e) => updateCuota(i, 'fecha_vencimiento', e.target.value)}
                        required
                        className="w-full px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-fg focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                      />
                    </td>
                    {esCheque && (
                      <>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={c.numero_cheque ?? ''}
                            onChange={(e) => updateCuota(i, 'numero_cheque', e.target.value)}
                            placeholder="Nº"
                            className="w-full px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-fg font-mono focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={c.banco_emisor ?? ''}
                            onChange={(e) => updateCuota(i, 'banco_emisor', e.target.value)}
                            placeholder="Banco"
                            className="w-full px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-fg focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                          />
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border-strong bg-surface-2">
                  <td colSpan={1} className="px-2 py-2 text-xs text-fg-muted font-medium">Total</td>
                  <td className="px-2 py-2">
                    <span className={cn(
                      'font-mono font-bold text-xs',
                      Math.abs(totalCuotas - compra.saldo_pendiente) < 0.02
                        ? 'text-green-700'
                        : 'text-amber-700'
                    )}>
                      {formatCurrency(totalCuotas)}
                    </span>
                  </td>
                  <td colSpan={esCheque ? 3 : 1} className="px-2 py-2 text-xs text-fg-soft">
                    {Math.abs(totalCuotas - compra.saldo_pendiente) < 0.02
                      ? '✓ Cuadra con saldo'
                      : `Dif: ${formatCurrency(totalCuotas - compra.saldo_pendiente)}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Registrar pago
        </Button>
      </div>
    </form>
  )
}


// ─── ComprasClient ────────────────────────────────────────────────────────────

export function ComprasClient({
  compras,
  proveedores,
  mes,
}: {
  compras: Compra[]
  proveedores: Proveedor[]
  mes: string
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Compra | null>(null)
  const [pagoTarget, setPagoTarget] = useState<Compra | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const searchParams = useSearchParams()

  const TABS = ['TODAS', 'BDI', 'ZATTIA', 'STUNNED', 'GENERAL'] as const
  type Tab = typeof TABS[number]
  const [marcaActiva, setMarcaActiva] = useState<Tab>('TODAS')
  const [searchGeneral, setSearchGeneral] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<'TODOS' | 'PENDIENTE' | 'PAGADO'>('TODOS')

  type SortKey = 'fecha' | 'negocio' | 'proveedor' | 'descripcion' | 'monto_total' | 'monto_neto' | 'iva' | 'saldo'
  const [sortKey, setSortKey] = useState<SortKey>('fecha')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'fecha' || key === 'monto_total' || key === 'saldo' ? 'desc' : 'asc')
    }
  }

  // Quick action: ?nuevo=1 abre modal automáticamente
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') {
      setModalOpen(true)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('nuevo')
      router.replace(`?${params.toString()}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cambiarMes(nuevoMes: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', nuevoMes)
    router.push(`?${params.toString()}`)
  }

  const comprasFiltradas = compras.filter((c) => {
    if (marcaActiva !== 'TODAS' && c.negocio !== marcaActiva) return false
    if (estadoFiltro !== 'TODOS') {
      const saldo = c.saldo_pendiente ?? c.monto_total
      const pagada = c.estado === 'PAGADO' || saldo <= 0
      if (estadoFiltro === 'PAGADO' && !pagada) return false
      if (estadoFiltro === 'PENDIENTE' && pagada) return false
    }
    if (searchGeneral) {
      const q = searchGeneral.toLowerCase()
      const haystack = [
        c.descripcion,
        (c.proveedor as { nombre: string } | null)?.nombre ?? '',
        c.notas,
        String(c.monto_total),
        c.negocio,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  }).sort((a, b) => {
    const getVal = (c: Compra): string | number => {
      switch (sortKey) {
        case 'fecha': return c.fecha ?? ''
        case 'negocio': return c.negocio ?? ''
        case 'proveedor': return ((c.proveedor as { nombre: string } | null)?.nombre ?? '').toLowerCase()
        case 'descripcion': return (c.descripcion ?? '').toLowerCase()
        case 'monto_total': return Number(c.monto_total ?? 0)
        case 'monto_neto': return Number(c.monto_neto ?? 0)
        case 'iva': return Number(c.iva ?? 0)
        case 'saldo': return Number(c.saldo_pendiente ?? c.monto_total ?? 0)
      }
    }
    const av = getVal(a)
    const bv = getVal(b)
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const totalMonto = comprasFiltradas.reduce((s, c) => s + c.monto_total, 0)
  const totalNeto = comprasFiltradas.reduce((s, c) => s + c.monto_neto, 0)
  const totalIVA = comprasFiltradas.reduce((s, c) => s + c.iva, 0)
  const totalSaldo = comprasFiltradas.reduce((s, c) => s + (c.saldo_pendiente ?? c.monto_total), 0)

  // Conteo por marca (para los badges en los tabs)
  const conteoPorMarca = compras.reduce<Record<string, number>>((acc, c) => {
    acc[c.negocio] = (acc[c.negocio] ?? 0) + 1
    return acc
  }, {})

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta compra? También se borrarán los pagos y cuotas asociados.')) return
    startTransition(async () => {
      try {
        await deleteCompra(id)
      } catch (err) {
        alert('No se pudo eliminar la compra: ' + (err as Error).message)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">Compras</h1>
          <p className="text-sm text-fg-muted mt-0.5">
            {comprasFiltradas.length === compras.length
              ? `${compras.length} compras en el mes`
              : `${comprasFiltradas.length} de ${compras.length} compras`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={mes}
            onChange={(e) => cambiarMes(e.target.value)}
            options={getMonthOptions()}
            className="w-44"
          />
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" />
            {marcaActiva === 'TODAS' ? 'Agregar' : `Agregar ${marcaActiva}`}
          </Button>
        </div>
      </div>

      {/* Tabs por marca */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = marcaActiva === tab
          const count = tab === 'TODAS' ? compras.length : (conteoPorMarca[tab] ?? 0)
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setMarcaActiva(tab)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex items-center gap-2',
                isActive
                  ? 'border-orange-500 text-orange-500'
                  : 'border-transparent text-fg-muted hover:text-fg hover:border-border'
              )}
            >
              {tab === 'TODAS' ? 'Todas' : tab}
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded-full',
                isActive ? 'bg-orange-500/15 text-orange-500' : 'bg-surface-2 text-fg-soft'
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Total (con IVA)</p>
          <p className="text-xl font-bold text-fg">{formatCurrency(totalMonto)}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Neto (sin IVA)</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totalNeto)}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">IVA total</p>
          <p className="text-xl font-bold text-amber-700">{formatCurrency(totalIVA)}</p>
        </div>
        <div className="bg-surface border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Saldo pendiente</p>
          <p className="text-xl font-bold text-red-700">{formatCurrency(totalSaldo)}</p>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl">
        {/* Buscador + filtro estado */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-soft pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar compra (descripción, proveedor, monto, marca)..."
                value={searchGeneral}
                onChange={(e) => setSearchGeneral(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg pl-9 pr-9 py-2 text-sm text-fg placeholder:text-fg-soft focus:outline-none focus:border-orange-500/60"
              />
              {searchGeneral && (
                <button
                  type="button"
                  onClick={() => setSearchGeneral('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-surface text-fg-soft hover:text-fg"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-1">
              {(['TODOS', 'PENDIENTE', 'PAGADO'] as const).map((est) => (
                <button
                  key={est}
                  type="button"
                  onClick={() => setEstadoFiltro(est)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium border transition-colors',
                    estadoFiltro === est
                      ? est === 'PAGADO'
                        ? 'bg-green-500/15 border-green-500/40 text-green-700'
                        : est === 'PENDIENTE'
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-700'
                          : 'bg-orange-500/15 border-orange-500/40 text-orange-600'
                      : 'bg-surface-2 border-border text-fg-muted hover:text-fg'
                  )}
                >
                  {est === 'TODOS' ? 'Todos los estados' : est === 'PENDIENTE' ? 'Pendientes' : 'Pagadas'}
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
                { key: 'fecha', label: 'Fecha', align: 'left' },
                { key: 'negocio', label: 'Marca', align: 'left' },
                { key: 'proveedor', label: 'Proveedor', align: 'left' },
                { key: 'descripcion', label: 'Descripción', align: 'left' },
                { key: 'monto_total', label: 'Total', align: 'right' },
                { key: 'monto_neto', label: 'Neto', align: 'right' },
                { key: 'iva', label: 'IVA', align: 'right' },
                { key: 'saldo', label: 'Saldo', align: 'right' },
              ] as { key: SortKey; label: string; align: 'left' | 'right' }[]).map((col) => {
                const active = sortKey === col.key
                return (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      'px-4 py-3 text-xs font-medium uppercase cursor-pointer select-none hover:text-fg transition-colors',
                      active ? 'text-fg' : 'text-fg-muted',
                      col.align === 'right' ? 'text-right' : 'text-left'
                    )}
                  >
                    <span className={cn('inline-flex items-center gap-1', col.align === 'right' && 'flex-row-reverse')}>
                      {col.label}
                      {active && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                    </span>
                  </th>
                )
              })}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {compras.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-fg-soft">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No hay compras registradas
                </td>
              </tr>
            ) : comprasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-fg-soft">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No hay compras que coincidan con los filtros
                </td>
              </tr>
            ) : (
              comprasFiltradas.map((c) => {
                const saldo = c.saldo_pendiente ?? c.monto_total
                const pagada = c.estado === 'PAGADO' || saldo <= 0
                return (
                  <tr key={c.id} className="border-b border-border/60 hover:bg-surface-2/30">
                    <td className="px-4 py-3 text-fg-muted text-xs whitespace-nowrap">{formatDate(c.fecha)}</td>
                    <td className="px-4 py-3"><MarcaBadge marca={c.negocio} /></td>
                    <td className="px-4 py-3 text-fg-muted">
                      {(c.proveedor as { nombre: string } | null)?.nombre ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-fg font-medium">{c.descripcion}</p>
                      {c.notas && (
                        <p className="text-xs text-fg-soft truncate max-w-[200px]">{c.notas}</p>
                      )}
                      {c.pagos && c.pagos.length > 0 && (
                        <p className="text-xs text-primary mt-0.5">
                          {c.pagos.length} pago{c.pagos.length > 1 ? 's' : ''} registrado{c.pagos.length > 1 ? 's' : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-fg">
                      {formatCurrency(c.monto_total)}
                      {c.moneda !== 'ARS' && (
                        <span className="text-xs text-fg-soft ml-1">({c.moneda})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">
                      {c.monto_neto > 0 ? formatCurrency(c.monto_neto) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-amber-700">
                      {c.iva > 0 ? formatCurrency(c.iva) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {pagada ? (
                        <span className="text-green-700 text-xs font-medium">Saldado</span>
                      ) : (
                        <span className="text-red-700 font-medium">{formatCurrency(saldo)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {!pagada && (
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => setPagoTarget(c)}
                            title="Registrar pago"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Pagar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditTarget(c)}
                          title="Editar compra"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={isPending}
                          onClick={() => handleDelete(c.id)}
                          title="Eliminar compra"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          {compras.length > 0 && (
            <tfoot>
              <tr className="border-t border-border-strong bg-surface-2/50">
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-fg-muted">TOTAL</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-fg">{formatCurrency(totalMonto)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-green-700">{formatCurrency(totalNeto)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-amber-700">{formatCurrency(totalIVA)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-red-700">{formatCurrency(totalSaldo)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>

      {/* Modal: nueva compra */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Agregar compra"
        description="Registrá una nueva compra con o sin desglose de IVA"
        className="max-w-xl"
      >
        <CompraForm
          proveedores={proveedores}
          onClose={() => setModalOpen(false)}
          initialNegocio={marcaActiva !== 'TODAS' ? marcaActiva : undefined}
        />
      </Modal>

      {/* Modal: editar compra */}
      {editTarget && (
        <Modal
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null) }}
          title="Editar compra"
          description="Modificar montos, proveedor, fecha o condiciones de IVA"
          className="max-w-xl"
        >
          <CompraForm compra={editTarget} proveedores={proveedores} onClose={() => setEditTarget(null)} />
        </Modal>
      )}

      {/* Modal: registrar pago */}
      {pagoTarget && (
        <Modal
          open={!!pagoTarget}
          onOpenChange={(open) => { if (!open) setPagoTarget(null) }}
          title="Registrar pago"
          description="Seleccioná la forma de pago y los datos del instrumento"
          className="max-w-lg"
        >
          <PaymentDialog
            compra={pagoTarget}
            onClose={() => setPagoTarget(null)}
          />
        </Modal>
      )}
    </div>
  )
}
