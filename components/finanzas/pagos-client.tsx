'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import type { Pago, TipoOrigenPago } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { formatCurrency, formatDate, formatMonth, getMonthOptions } from '@/lib/utils'
import {
  Wallet, Trash2, FileCheck, Banknote, CreditCard, Loader2, Pencil,
  ShoppingCart, Receipt, Users, AlertCircle, Filter, Link2,
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
  COMPRA: { label: 'Compra', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10', icon: ShoppingCart },
  GASTO: { label: 'Gasto', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10', icon: Receipt },
  NOMINA: { label: 'Nómina', color: 'text-purple-400 border-purple-500/30 bg-purple-500/10', icon: Users },
  CUOTA: { label: 'Cuota tarjeta', color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10', icon: CreditCard },
  LIBRE: { label: 'Libre', color: 'text-slate-400 border-slate-500/30 bg-slate-500/10', icon: AlertCircle },
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

export function PagosClient({ mes, pagos, filtros, cuentas, compras, gastos, nominas, cuotas }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [asignarTarget, setAsignarTarget] = useState<Pago | null>(null)
  const [editTarget, setEditTarget] = useState<Pago | null>(null)

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

  // KPIs
  const totalARS = pagos.filter((p) => p.moneda === 'ARS').reduce((s, p) => s + Number(p.monto), 0)
  const totalUSD = pagos.filter((p) => p.moneda === 'USD').reduce((s, p) => s + Number(p.monto), 0)
  const porTipo = pagos.reduce((acc, p) => {
    acc[p.tipo_origen] = (acc[p.tipo_origen] ?? 0) + Number(p.monto)
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-green-400" />
            Pagos del mes
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {pagos.length} movimiento(s) · {formatMonth(mes)} · ledger único
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Total ARS</p>
          <p className="text-xl font-bold text-green-400">{formatCurrency(totalARS)}</p>
        </div>
        <div className="bg-slate-900 border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Total USD</p>
          <p className="text-xl font-bold text-green-400">{formatCurrency(totalUSD, 'USD')}</p>
        </div>
        {(['COMPRA', 'GASTO', 'NOMINA'] as const).map((t) => (
          <div key={t} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">{TIPO_LABELS[t].label}</p>
            <p className="text-xl font-bold text-slate-100">{formatCurrency(porTipo[t] ?? 0)}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Filter className="w-3.5 h-3.5" />
          Filtros:
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
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Fecha</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Concepto</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Instrumento</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Cuenta</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Monto</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {pagos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  <Wallet className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Sin pagos para los filtros seleccionados
                </td>
              </tr>
            ) : (
              pagos.map((p) => {
                const tipo = TIPO_LABELS[p.tipo_origen]
                const instr = INSTRUMENTO_LABELS[p.instrumento] ?? { label: p.instrumento, icon: Wallet }
                const Icon = tipo.icon
                const InstrIcon = instr.icon
                const cuenta = p.cuenta_id ? cuentaMap.get(p.cuenta_id) : null
                const desc = descripcionOrigen(p)
                const esLibre = p.tipo_origen === 'LIBRE'
                return (
                  <tr key={p.id} className={cn('border-b border-slate-800/60 hover:bg-slate-800/30', esLibre && 'bg-amber-500/5')}>
                    <td className="px-4 py-3 text-slate-300 text-xs whitespace-nowrap font-mono">{formatDate(p.fecha_emision)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs', tipo.color)}>
                        <Icon className="w-3 h-3" />
                        {tipo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-[200px]">
                      <p className="text-slate-100 truncate font-medium">{desc.titulo}</p>
                      {desc.subtitulo && <p className="text-xs text-slate-500 truncate">{desc.subtitulo}</p>}
                      {p.notas && !esLibre && <p className="text-xs text-slate-600 truncate">· {p.notas}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-300">
                        <InstrIcon className="w-3 h-3" />
                        {instr.label}
                      </span>
                      {p.numero_cheque && (
                        <p className="text-[10px] text-slate-500 font-mono">N° {p.numero_cheque}</p>
                      )}
                      {p.fecha_vencimiento && (
                        <p className="text-[10px] text-slate-500">vto. {formatDate(p.fecha_vencimiento)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {cuenta ? `${cuenta.banco} · ${cuenta.nombre}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-mono font-semibold text-slate-100">{formatCurrency(p.monto, p.moneda)}</p>
                      {!p.acreditado && (
                        <Badge variant="warning" className="text-[10px] mt-0.5">Sin acreditar</Badge>
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
                          title={p.acreditado && !esLibre ? 'Pago ya acreditado — no editable' : 'Editar pago'}
                          disabled={p.acreditado && !esLibre}
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
          cuentas={cuentas}
          onOpenChange={(o) => { if (!o) setEditTarget(null) }}
        />
      )}
    </div>
  )
}

// ─── EditPagoModal ────────────────────────────────────────────────────────────

function EditPagoModal({
  pago,
  cuentas,
  onOpenChange,
}: {
  pago: Pago
  cuentas: { id: string; nombre: string; banco: string }[]
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [fechaEmision, setFechaEmision] = useState(pago.fecha_emision)
  const [fechaVencimiento, setFechaVencimiento] = useState(pago.fecha_vencimiento ?? '')
  const [monto, setMonto] = useState(Number(pago.monto))
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>(pago.moneda as 'ARS' | 'USD')
  const [instrumento, setInstrumento] = useState(pago.instrumento as Pago['instrumento'])
  const [numeroCheque, setNumeroCheque] = useState(pago.numero_cheque ?? '')
  const [bancoEmisor, setBancoEmisor] = useState(pago.banco_emisor ?? '')
  const [cuentaId, setCuentaId] = useState(pago.cuenta_id ?? '')
  const [notas, setNotas] = useState(pago.notas ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    if (monto <= 0) {
      setError('El monto debe ser positivo')
      return
    }
    if ((instrumento === 'CHEQUE_FISICO' || instrumento === 'ECHEQ') && !fechaVencimiento) {
      setError('Los cheques requieren fecha de vencimiento')
      return
    }
    startTransition(async () => {
      try {
        await editPago(pago.id, {
          fecha_emision: fechaEmision,
          fecha_vencimiento: fechaVencimiento || null,
          monto,
          moneda,
          instrumento,
          numero_cheque: numeroCheque || null,
          banco_emisor: bancoEmisor || null,
          cuenta_id: cuentaId || null,
          notas: notas || null,
        })
        onOpenChange(false)
        router.refresh()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  const requiereCheque = instrumento === 'CHEQUE_FISICO' || instrumento === 'ECHEQ'

  return (
    <Modal open={!!pago} onOpenChange={onOpenChange} title="Editar pago" className="max-w-md">
      <div className="space-y-4">
        <div className="bg-slate-800/60 rounded-lg p-3 text-xs text-slate-400">
          {pago.tipo_origen === 'LIBRE' ? 'Pago LIBRE (sin asignar)' : `Pago contra ${pago.tipo_origen}`}
          {pago.acreditado && pago.tipo_origen === 'LIBRE' && (
            <span className="ml-2 text-amber-400">(acreditado — el monto sigue editable)</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Fecha emisión" type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
          <Input label="Fecha vencimiento" type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Monto</label>
            <input
              type="number" step="0.01" min="0.01"
              value={monto || ''}
              onChange={(e) => setMonto(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <Select label="Moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as 'ARS' | 'USD')}
            options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]} />
        </div>

        <Select
          label="Instrumento"
          value={instrumento}
          onChange={(e) => setInstrumento(e.target.value as Pago['instrumento'])}
          options={[
            { value: 'TRANSFERENCIA', label: 'Transferencia' },
            { value: 'EFECTIVO', label: 'Efectivo' },
            { value: 'CHEQUE_FISICO', label: 'Cheque físico' },
            { value: 'ECHEQ', label: 'E-cheq' },
            { value: 'CUENTA_CORRIENTE', label: 'Cuenta corriente' },
            { value: 'TARJETA', label: 'Tarjeta' },
          ]}
        />

        {requiereCheque && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="N° de cheque" value={numeroCheque} onChange={(e) => setNumeroCheque(e.target.value)} />
            <Input label="Banco emisor" value={bancoEmisor} onChange={(e) => setBancoEmisor(e.target.value)} />
          </div>
        )}

        <Select
          label="Cuenta"
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
          options={[{ value: '', label: '— Sin asignar —' }, ...cuentas.map((c) => ({ value: c.id, label: `${c.banco} · ${c.nombre}` }))]}
        />

        <Input label="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />

        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

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
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Pago a asignar</p>
          <p className="text-sm font-medium text-slate-100">
            {formatCurrency(pago.monto, pago.moneda)} · {formatDate(pago.fecha_emision)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{pago.instrumento.replace('_', ' ').toLowerCase()}{pago.numero_cheque ? ` · N° ${pago.numero_cheque}` : ''}{pago.notas ? ` · ${pago.notas}` : ''}</p>
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

        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

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
