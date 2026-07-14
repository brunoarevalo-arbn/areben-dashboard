'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import type { Pago, TipoOrigenPago } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useSort, SortTh } from '@/components/ui/sortable'
import { formatCurrency, formatDate, formatMonth, getMonthOptions } from '@/lib/utils'
import {
  Wallet, Trash2, FileCheck, Banknote, CreditCard, Loader2, Pencil,
  ShoppingCart, Receipt, Users, AlertCircle, Filter, Link2, Search, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { deletePagoUnificado, asignarPagoLibre, editPago } from '@/app/actions/pagos'

interface CompraRef { id: string; descripcion: string; proveedor: { nombre: string } | { nombre: string }[] | null }
interface GastoRef { id: string; concepto: string; categoria: string }
interface NominaRef {
  id: string
  mes: string
  empleado: { nombre: string; apellido: string } | { nombre: string; apellido: string }[] | null
}
interface CuotaRef {
  id: string
  concepto: string
  cuota_numero: number
  cuotas_total: number
  tarjeta: { nombre: string; banco: string } | { nombre: string; banco: string }[] | null
}

interface Props {
  mes: string
  pagos: Pago[]
  filtros: { tipo?: string; instrumento?: string; cuenta?: string }
  cuentas: { id: string; nombre: string; banco: string }[]
  compras: CompraRef[]
  gastos: GastoRef[]
  nominas: NominaRef[]
  cuotas: CuotaRef[]
}

const TIPO_LABELS: Record<TipoOrigenPago, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  COMPRA: { label: 'Compra', color: 'text-blue-700 border-blue-500/30 bg-blue-500/10', icon: ShoppingCart },
  GASTO: { label: 'Gasto', color: 'text-amber-700 border-amber-500/30 bg-amber-500/10', icon: Receipt },
  NOMINA: { label: 'Nómina', color: 'text-purple-700 border-purple-500/30 bg-purple-500/10', icon: Users },
  CUOTA: { label: 'Cuota tarjeta', color: 'text-primary border-orange-500/30 bg-orange-500/10', icon: CreditCard },
  PRESTAMO: { label: 'Cuota préstamo', color: 'text-teal-700 border-teal-500/30 bg-teal-500/10', icon: Receipt },
  LIBRE: { label: 'Libre', color: 'text-fg-muted border-slate-500/30 bg-slate-500/10', icon: AlertCircle },
}

const INSTRUMENTO_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  TRANSFERENCIA: { label: 'Transferencia', icon: Banknote },
  EFECTIVO: { label: 'Efectivo', icon: Wallet },
  CHEQUE_FISICO: { label: 'Cheque físico', icon: FileCheck },
  ECHEQ: { label: 'E-cheq', icon: FileCheck },
  CUENTA_CORRIENTE: { label: 'Cta. cte.', icon: Banknote },
  TARJETA: { label: 'Tarjeta', icon: CreditCard },
}

function pickOne<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

type SortKey = 'fecha' | 'tipo' | 'concepto' | 'instrumento' | 'cuenta' | 'monto'

export function PagosClient({ mes, pagos, filtros, cuentas, compras, gastos, nominas, cuotas }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [asignarTarget, setAsignarTarget] = useState<Pago | null>(null)
  const [editTarget, setEditTarget] = useState<Pago | null>(null)
  const { sortKey, sortDir, toggleSort, sortRows } = useSort<SortKey>('fecha', 'desc')

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`?${params.toString()}`)
  }

  // Mapa por id para resolver origen
  const compraMap = useMemo(() => new Map(compras.map((c) => [c.id, c])), [compras])
  const gastoMap = useMemo(() => new Map(gastos.map((g) => [g.id, g])), [gastos])
  const nominaMap = useMemo(() => new Map(nominas.map((n) => [n.id, n])), [nominas])
  const cuotaMap = useMemo(() => new Map(cuotas.map((c) => [c.id, c])), [cuotas])
  const cuentaMap = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas])

  function descripcionOrigen(p: Pago): { titulo: string; subtitulo: string } {
    if (p.tipo_origen === 'COMPRA' && p.origen_id) {
      const c = compraMap.get(p.origen_id)
      const prov = pickOne(c?.proveedor)
      return { titulo: prov?.nombre ?? c?.descripcion ?? 'Compra', subtitulo: c?.descripcion ?? '' }
    }
    if (p.tipo_origen === 'GASTO' && p.origen_id) {
      const g = gastoMap.get(p.origen_id)
      return { titulo: g?.concepto ?? 'Gasto', subtitulo: g?.categoria ?? '' }
    }
    if (p.tipo_origen === 'NOMINA' && p.origen_id) {
      const n = nominaMap.get(p.origen_id)
      const e = pickOne(n?.empleado)
      return {
        titulo: e ? `${e.apellido}, ${e.nombre}` : 'Nómina',
        subtitulo: n ? `Sueldo ${n.mes}` : '',
      }
    }
    if (p.tipo_origen === 'CUOTA' && p.origen_id) {
      const c = cuotaMap.get(p.origen_id)
      const t = pickOne(c?.tarjeta)
      return {
        titulo: c?.concepto ?? 'Cuota tarjeta',
        subtitulo: c ? `${t?.banco ?? ''} ${t?.nombre ?? ''} · ${c.cuota_numero}/${c.cuotas_total}` : '',
      }
    }
    return { titulo: 'Pago libre (sin asignar)', subtitulo: p.notas ?? 'Cheque histórico u otro' }
  }

  function eliminar(p: Pago) {
    if (!confirm('¿Eliminar este pago?')) return
    startTransition(async () => {
      try {
        await deletePagoUnificado(p.id)
        router.refresh()
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  // Buscador global + filtrado client-side (el panel trae TODOS los pagos).
  const [searchGeneral, setSearchGeneral] = useState('')
  const q = searchGeneral.trim().toLowerCase()
  const mesActivo = searchParams.get('mes') ?? mes
  const buscando = q.length > 0

  const pagosFiltrados = useMemo(() => {
    const filtrados = pagos.filter((p) => {
      if (buscando) {
        // Búsqueda global: ignora mes y dropdowns; busca en nombre/proveedor/empleado/fecha/monto/notas/instrumento.
        const d = descripcionOrigen(p)
        const haystack = [
          d.titulo, d.subtitulo, p.notas, p.numero_cheque, p.instrumento, p.moneda,
          formatDate(p.fecha_emision), p.fecha_emision, String(p.monto),
        ].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(q)
      }
      // Sin búsqueda: filtros dropdown + mes seleccionado.
      if (filtros.tipo && p.tipo_origen !== filtros.tipo) return false
      if (filtros.instrumento && p.instrumento !== filtros.instrumento) return false
      if (filtros.cuenta && p.cuenta_id !== filtros.cuenta) return false
      return (p.fecha_emision ?? '').startsWith(mesActivo)
    })
    return sortRows(filtrados, (p, k): string | number => {
      switch (k) {
        case 'fecha': return p.fecha_emision ?? ''
        case 'tipo': return (TIPO_LABELS[p.tipo_origen]?.label ?? '').toLowerCase()
        case 'concepto': return descripcionOrigen(p).titulo.toLowerCase()
        case 'instrumento': return (INSTRUMENTO_LABELS[p.instrumento]?.label ?? p.instrumento ?? '').toLowerCase()
        case 'cuenta': {
          const c = p.cuenta_id ? cuentaMap.get(p.cuenta_id) : null
          return c ? `${c.banco} ${c.nombre}`.toLowerCase() : ''
        }
        case 'monto': return Number(p.monto)
        default: return ''
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagos, buscando, q, filtros.tipo, filtros.instrumento, filtros.cuenta, mesActivo, sortKey, sortDir, cuentaMap])

  // KPIs (sobre lo filtrado)
  const totalARS = pagosFiltrados.filter((p) => p.moneda === 'ARS').reduce((s, p) => s + Number(p.monto), 0)
  const totalUSD = pagosFiltrados.filter((p) => p.moneda === 'USD').reduce((s, p) => s + Number(p.monto), 0)
  const porTipo = pagosFiltrados.reduce((acc, p) => {
    acc[p.tipo_origen] = (acc[p.tipo_origen] ?? 0) + Number(p.monto)
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Wallet className="w-6 h-6 text-green-700" />
            Pagos del mes
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">
            {pagosFiltrados.length} movimiento(s) · {buscando ? 'búsqueda global (todos los meses)' : formatMonth(mesActivo)} · ledger único
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-surface border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Total ARS</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totalARS)}</p>
        </div>
        <div className="bg-surface border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Total USD</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totalUSD, 'USD')}</p>
        </div>
        {(['COMPRA', 'GASTO', 'NOMINA'] as const).map((t) => (
          <div key={t} className="bg-surface border border-border rounded-xl p-4">
            <p className="text-xs text-fg-muted mb-1">{TIPO_LABELS[t].label}</p>
            <p className="text-xl font-bold text-fg">{formatCurrency(porTipo[t] ?? 0)}</p>
          </div>
        ))}
      </div>

      {/* Buscador global */}
      <div className="relative">
        <Search className="w-4 h-4 text-fg-soft absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchGeneral}
          onChange={(e) => setSearchGeneral(e.target.value)}
          placeholder="Buscar en TODOS los pagos: proveedor, empleado, concepto, fecha, monto…"
          className="w-full pl-9 pr-9 py-2 bg-surface border border-border-strong rounded-lg text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {searchGeneral && (
          <button
            type="button"
            onClick={() => setSearchGeneral('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-fg-soft hover:text-fg hover:bg-surface-2"
            title="Limpiar búsqueda"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className={cn('bg-surface border border-border rounded-xl p-3 flex flex-wrap gap-3 items-center', buscando && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Filter className="w-3.5 h-3.5" />
          {buscando ? 'Filtros (desactivados durante la búsqueda):' : 'Filtros:'}
        </div>
        <Select
          value={searchParams.get('mes') ?? mes}
          onChange={(e) => setFilter('mes', e.target.value)}
          options={getMonthOptions()}
          className="w-44"
        />
        <Select
          value={filtros.tipo ?? ''}
          onChange={(e) => setFilter('tipo', e.target.value)}
          options={[
            { value: '', label: 'Todos los tipos' },
            { value: 'COMPRA', label: 'Compras' },
            { value: 'GASTO', label: 'Gastos' },
            { value: 'NOMINA', label: 'Nóminas' },
            { value: 'CUOTA', label: 'Cuotas tarjeta' },
            { value: 'LIBRE', label: 'Libres (sin asignar)' },
          ]}
          className="w-48"
        />
        <Select
          value={filtros.instrumento ?? ''}
          onChange={(e) => setFilter('instrumento', e.target.value)}
          options={[
            { value: '', label: 'Todos los instrumentos' },
            { value: 'TRANSFERENCIA', label: 'Transferencia' },
            { value: 'EFECTIVO', label: 'Efectivo' },
            { value: 'CHEQUE_FISICO', label: 'Cheque físico' },
            { value: 'ECHEQ', label: 'E-cheq' },
            { value: 'CUENTA_CORRIENTE', label: 'Cuenta corriente' },
            { value: 'TARJETA', label: 'Tarjeta' },
          ]}
          className="w-52"
        />
        <Select
          value={filtros.cuenta ?? ''}
          onChange={(e) => setFilter('cuenta', e.target.value)}
          options={[
            { value: '', label: 'Todas las cuentas' },
            ...cuentas.map((c) => ({ value: c.id, label: `${c.banco} · ${c.nombre}` })),
          ]}
          className="w-56"
        />
      </div>

      {/* Tabla */}
      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {([
                { key: 'fecha', label: 'Fecha', align: 'left' },
                { key: 'tipo', label: 'Tipo', align: 'left' },
                { key: 'concepto', label: 'Concepto', align: 'left' },
                { key: 'instrumento', label: 'Instrumento', align: 'left' },
                { key: 'cuenta', label: 'Cuenta', align: 'left' },
                { key: 'monto', label: 'Monto', align: 'right', numeric: true },
              ] as { key: SortKey; label: string; align: 'left' | 'right'; numeric?: boolean }[]).map((col) => (
                <SortTh key={col.key} col={col.key} label={col.label} align={col.align} numeric={col.numeric}
                  sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {pagosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-fg-soft">
                  <Wallet className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  {buscando ? `Sin resultados para "${searchGeneral}"` : 'Sin pagos para los filtros seleccionados'}
                </td>
              </tr>
            ) : (
              pagosFiltrados.map((p) => {
                const tipo = TIPO_LABELS[p.tipo_origen]
                const instr = INSTRUMENTO_LABELS[p.instrumento] ?? { label: p.instrumento, icon: Wallet }
                const Icon = tipo.icon
                const InstrIcon = instr.icon
                const cuenta = p.cuenta_id ? cuentaMap.get(p.cuenta_id) : null
                const desc = descripcionOrigen(p)
                const esLibre = p.tipo_origen === 'LIBRE'
                return (
                  <tr key={p.id} className={cn('border-b border-border/60 hover:bg-surface-2/30', esLibre && 'bg-amber-500/5')}>
                    <td className="px-4 py-3 text-fg-muted text-xs whitespace-nowrap font-mono">{formatDate(p.fecha_emision)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs', tipo.color)}>
                        <Icon className="w-3 h-3" />
                        {tipo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-[200px]">
                      <p className="text-fg truncate font-medium">{desc.titulo}</p>
                      {desc.subtitulo && <p className="text-xs text-fg-soft truncate">{desc.subtitulo}</p>}
                      {p.notas && !esLibre && <p className="text-xs text-fg-muted truncate">· {p.notas}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                        <InstrIcon className="w-3 h-3" />
                        {instr.label}
                      </span>
                      {p.numero_cheque && (
                        <p className="text-[10px] text-fg-soft font-mono">N° {p.numero_cheque}</p>
                      )}
                      {p.fecha_vencimiento && (
                        <p className="text-[10px] text-fg-soft">vto. {formatDate(p.fecha_vencimiento)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-muted">
                      {cuenta ? `${cuenta.banco} · ${cuenta.nombre}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-mono font-semibold text-fg">{formatCurrency(p.monto, p.moneda)}</p>
                      {!p.debitado && (
                        <Badge variant="warning" className="text-[10px] mt-0.5">Sin debitar</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {esLibre && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAsignarTarget(p)}
                            title="Asignar este pago a una compra/gasto/nómina/cuota"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditTarget(p)}
                          title={p.debitado && !esLibre ? 'Pago ya debitado — no editable' : 'Editar pago'}
                          disabled={p.debitado && !esLibre}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={isPending}
                          onClick={() => eliminar(p)}
                          title="Eliminar este pago"
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
        </table>
      </div>

      {asignarTarget && (
        <AsignarPagoLibreModal
          pago={asignarTarget}
          onOpenChange={(o) => { if (!o) setAsignarTarget(null) }}
        />
      )}

      {editTarget && (
        <EditPagoModal
          pago={editTarget}
          onOpenChange={(o) => { if (!o) setEditTarget(null) }}
        />
      )}
    </div>
  )
}

// ─── EditPagoModal ────────────────────────────────────────────────────────────

function EditPagoModal({
  pago,
  onOpenChange,
}: {
  pago: Pago
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [fechaEmision, setFechaEmision] = useState(pago.fecha_emision)
  const [fechaVencimiento, setFechaVencimiento] = useState(pago.fecha_vencimiento ?? '')
  const [numeroCheque, setNumeroCheque] = useState(pago.numero_cheque ?? '')
  const [bancoEmisor, setBancoEmisor] = useState(pago.banco_emisor ?? '')
  const [notas, setNotas] = useState(pago.notas ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const esCheque = pago.instrumento === 'CHEQUE_FISICO' || pago.instrumento === 'ECHEQ'

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        await editPago(pago.id, {
          fecha_emision: fechaEmision,
          fecha_vencimiento: fechaVencimiento || null,
          numero_cheque: numeroCheque || null,
          banco_emisor: bancoEmisor || null,
          notas: notas || null,
        })
        onOpenChange(false)
        router.refresh()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <Modal open={!!pago} onOpenChange={onOpenChange} title="Editar pago" className="max-w-md">
      <div className="space-y-4">
        <div className="bg-surface-2/40 border border-border-strong/40 rounded-lg p-3 space-y-1">
          <p className="text-xs text-fg-muted">
            {pago.tipo_origen === 'LIBRE' ? 'Pago LIBRE (sin asignar)' : `Pago contra ${pago.tipo_origen}`}
            {' · '}
            <span className="text-fg-soft">{pago.instrumento.replace('_', ' ').toLowerCase()}</span>
          </p>
          <p className="font-mono text-sm text-fg">
            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: pago.moneda }).format(Number(pago.monto))}
          </p>
          <p className="text-[11px] text-fg-soft">
            Para cambiar monto, instrumento o cuenta: eliminá este pago y creá uno nuevo.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Fecha emisión" type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
          <Input label="Fecha vencimiento" type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
        </div>

        {esCheque && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="N° de cheque" value={numeroCheque} onChange={(e) => setNumeroCheque(e.target.value)} />
            <Input label="Banco emisor" value={bancoEmisor} onChange={(e) => setBancoEmisor(e.target.value)} />
          </div>
        )}

        <Input label="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />

        {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar cambios
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── AsignarPagoLibreModal ───────────────────────────────────────────────────

function AsignarPagoLibreModal({
  pago,
  onOpenChange,
}: {
  pago: Pago
  onOpenChange: (o: boolean) => void
}) {
  const [tipo, setTipo] = useState<TipoOrigenPago>('COMPRA')
  const [origenId, setOrigenId] = useState('')
  const [comprasOpts, setComprasOpts] = useState<{ id: string; label: string }[]>([])
  const [gastosOpts, setGastosOpts] = useState<{ id: string; label: string }[]>([])
  const [nominasOpts, setNominasOpts] = useState<{ id: string; label: string }[]>([])
  const [cuotasOpts, setCuotasOpts] = useState<{ id: string; label: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Cargar opciones de deudas pendientes desde el cliente Supabase
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const supabase = createBrowserSupabase()
      const [{ data: c }, { data: g }, { data: n }, { data: q }] = await Promise.all([
        supabase
          .from('compras')
          .select('id, descripcion, saldo_pendiente, proveedor:proveedores(nombre)')
          .gt('saldo_pendiente', 0)
          .neq('estado', 'PAGADO')
          .limit(200),
        supabase
          .from('gastos')
          .select('id, concepto, monto, mes')
          .neq('estado', 'PAGADO')
          .limit(200),
        supabase
          .from('nomina_mensual')
          .select('id, mes, neto, empleado:empleados(nombre, apellido)')
          .neq('estado', 'PAGADO')
          .limit(200),
        supabase
          .from('cuotas_tarjeta')
          .select('id, concepto, monto_cuota, mes_vencimiento, cuota_numero, cuotas_total, tarjeta:tarjetas_credito(nombre, banco)')
          .eq('pagada', false)
          .limit(300),
      ])
      if (cancelled) return
      type CompraRow = { id: string; descripcion: string; saldo_pendiente: number; proveedor: { nombre: string } | { nombre: string }[] | null }
      type GastoRow = { id: string; concepto: string; monto: number; mes: string }
      type NominaRow = { id: string; mes: string; neto: number; empleado: { nombre: string; apellido: string } | { nombre: string; apellido: string }[] | null }
      type CuotaRow = { id: string; concepto: string; monto_cuota: number; mes_vencimiento: string; cuota_numero: number; cuotas_total: number; tarjeta: { nombre: string; banco: string } | { nombre: string; banco: string }[] | null }
      setComprasOpts(((c ?? []) as CompraRow[]).map((r) => {
        const prov = pickOne(r.proveedor)
        return {
          id: r.id,
          label: `${prov?.nombre ?? r.descripcion} · saldo ${formatCurrency(Number(r.saldo_pendiente))}`,
        }
      }))
      setGastosOpts(((g ?? []) as GastoRow[]).map((r) => ({
        id: r.id,
        label: `${r.concepto} · ${r.mes} · ${formatCurrency(Number(r.monto))}`,
      })))
      setNominasOpts(((n ?? []) as NominaRow[]).map((r) => {
        const e = pickOne(r.empleado)
        return {
          id: r.id,
          label: `${e ? `${e.apellido}, ${e.nombre}` : 'Nómina'} · ${r.mes} · ${formatCurrency(Number(r.neto))}`,
        }
      }))
      setCuotasOpts(((q ?? []) as CuotaRow[]).map((r) => {
        const t = pickOne(r.tarjeta)
        return {
          id: r.id,
          label: `${r.concepto} · ${t ? `${t.banco} ${t.nombre}` : ''} · cuota ${r.cuota_numero}/${r.cuotas_total} · ${formatCurrency(Number(r.monto_cuota))}`,
        }
      }))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const opcionesActuales =
    tipo === 'COMPRA' ? comprasOpts :
    tipo === 'GASTO' ? gastosOpts :
    tipo === 'NOMINA' ? nominasOpts :
    tipo === 'CUOTA' ? cuotasOpts : []

  function ejecutar() {
    setError(null)
    if (!origenId) {
      setError('Seleccioná una deuda destino')
      return
    }
    startTransition(async () => {
      try {
        await asignarPagoLibre(pago.id, tipo, origenId)
        onOpenChange(false)
        router.refresh()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <Modal open={!!pago} onOpenChange={onOpenChange} title="Asignar pago a deuda" className="max-w-md">
      <div className="space-y-4">
        <div className="bg-surface-2/60 rounded-lg p-3 border border-border-strong/40">
          <p className="text-xs text-fg-muted uppercase tracking-wider mb-1">Pago a asignar</p>
          <p className="text-sm font-medium text-fg">
            {formatCurrency(pago.monto, pago.moneda)} · {formatDate(pago.fecha_emision)}
          </p>
          <p className="text-xs text-fg-soft mt-0.5">{pago.instrumento.replace('_', ' ').toLowerCase()}{pago.numero_cheque ? ` · N° ${pago.numero_cheque}` : ''}{pago.notas ? ` · ${pago.notas}` : ''}</p>
        </div>

        <Select
          label="Tipo de deuda"
          value={tipo}
          onChange={(e) => { setTipo(e.target.value as TipoOrigenPago); setOrigenId('') }}
          options={[
            { value: 'COMPRA', label: 'Compra' },
            { value: 'GASTO', label: 'Gasto' },
            { value: 'NOMINA', label: 'Nómina' },
            { value: 'CUOTA', label: 'Cuota de tarjeta' },
          ]}
        />

        <Select
          label={loading ? 'Cargando opciones...' : `Deuda destino (${opcionesActuales.length})`}
          value={origenId}
          onChange={(e) => setOrigenId(e.target.value)}
          options={[
            { value: '', label: '— Seleccionar —' },
            ...opcionesActuales.map((o) => ({ value: o.id, label: o.label })),
          ]}
          disabled={loading}
        />

        {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            type="button"
            onClick={ejecutar}
            disabled={isPending || loading || !origenId}
            title="Vincular este pago al origen elegido y recomputar el saldo"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Asignar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
