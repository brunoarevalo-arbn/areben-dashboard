'use client'

import { useState, useMemo, useTransition } from 'react'
import {
  createCcCuenta, updateCcCuenta, deleteCcCuenta, toggleCcCuentaActiva,
  addCcMovimiento, deleteCcMovimiento,
} from '@/app/actions/cuentas-corrientes'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronRight, Power,
  ArrowUpCircle, ArrowDownCircle, Wallet, X,
} from 'lucide-react'

export type CcMovimiento = {
  id: string
  cuenta_id: string
  fecha: string
  mes: string
  tipo: 'DEUDA' | 'PAGO'
  concepto: string | null
  monto: number
  monto_origen: number | null
  moneda_origen: 'ARS' | 'USD' | null
  tc_aplicado: number | null
}
export type CcCuenta = {
  id: string
  nombre: string
  tipo: 'CLIENTE' | 'PROVEEDOR' | 'SERVICIO' | 'OTRO'
  naturaleza: 'COBRAR' | 'PAGAR'
  moneda: 'ARS' | 'USD'
  notas: string | null
  activo: boolean
}

const TIPOS = [
  { v: 'CLIENTE', label: 'Cliente' },
  { v: 'PROVEEDOR', label: 'Proveedor' },
  { v: 'SERVICIO', label: 'Servicio' },
  { v: 'OTRO', label: 'Otro' },
] as const

interface Props {
  cuentas: CcCuenta[]
  movimientos: CcMovimiento[]
  tcMes: number | null // TC del mes activo, para dolarizar movimientos en $ sobre cuentas USD
}

// Saldo de una cuenta = Σ DEUDA − Σ PAGO (en la moneda de la cuenta)
function calcSaldo(movs: CcMovimiento[]): number {
  return movs.reduce((s, m) => s + (m.tipo === 'DEUDA' ? Number(m.monto) : -Number(m.monto)), 0)
}

export function CcManualClient({ cuentas, movimientos, tcMes }: Props) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [corte, setCorte] = useState(hoy)
  const [dir, setDir] = useState<'TODAS' | 'COBRAR' | 'PAGAR'>('TODAS')
  const [estado, setEstado] = useState<'CON_SALDO' | 'TODAS'>('CON_SALDO')
  const [cat, setCat] = useState<'TODAS' | 'CLIENTE' | 'PROVEEDOR' | 'SERVICIO' | 'OTRO'>('TODAS')
  const [moneda, setMoneda] = useState<'TODAS' | 'ARS' | 'USD'>('TODAS')
  const [modalCuenta, setModalCuenta] = useState(false)
  const [editCuenta, setEditCuenta] = useState<CcCuenta | undefined>()
  const [expandida, setExpandida] = useState<string | null>(null)

  // Saldos "a la fecha de corte": solo cuentan los movimientos hasta esa fecha.
  const movsByCuenta = useMemo(() => {
    const m = new Map<string, CcMovimiento[]>()
    for (const mv of movimientos) {
      if (mv.fecha > corte) continue
      if (!m.has(mv.cuenta_id)) m.set(mv.cuenta_id, [])
      m.get(mv.cuenta_id)!.push(mv)
    }
    for (const arr of m.values()) arr.sort((a, b) => b.fecha.localeCompare(a.fecha))
    return m
  }, [movimientos, corte])

  const saldos = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cuentas) m.set(c.id, calcSaldo(movsByCuenta.get(c.id) ?? []))
    return m
  }, [cuentas, movsByCuenta])

  const visibles = useMemo(() => {
    return cuentas.filter((c) => {
      if (dir !== 'TODAS' && c.naturaleza !== dir) return false
      if (cat !== 'TODAS' && c.tipo !== cat) return false
      if (moneda !== 'TODAS' && c.moneda !== moneda) return false
      const saldo = saldos.get(c.id) ?? 0
      if (estado === 'CON_SALDO' && Math.round(saldo * 100) === 0) return false
      return true
    }).sort((a, b) => Math.abs(saldos.get(b.id) ?? 0) - Math.abs(saldos.get(a.id) ?? 0))
  }, [cuentas, saldos, dir, cat, moneda, estado])

  // Totales (convertidos a ARS para el neto; USD se pesifica al TC del mes si hay)
  const totales = useMemo(() => {
    let cobrarArs = 0, pagarArs = 0, cobrarUsd = 0, pagarUsd = 0
    for (const c of cuentas) {
      const saldo = saldos.get(c.id) ?? 0
      if (Math.round(saldo * 100) === 0) continue
      if (c.moneda === 'USD') {
        if (c.naturaleza === 'COBRAR') cobrarUsd += saldo; else pagarUsd += saldo
      } else {
        if (c.naturaleza === 'COBRAR') cobrarArs += saldo; else pagarArs += saldo
      }
    }
    const tc = tcMes ?? 0
    const cobrar = cobrarArs + cobrarUsd * tc
    const pagar = pagarArs + pagarUsd * tc
    return { cobrar, pagar, neto: cobrar - pagar, cobrarUsd, pagarUsd }
  }, [cuentas, saldos, tcMes])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            Cuentas Corrientes
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">
            Deudas y pagos por cliente/proveedor, sin depender de una compra. Los USD se pesifican al TC del mes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-fg-soft uppercase tracking-wide whitespace-nowrap">Saldo al</span>
            <input type="date" value={corte} onChange={(e) => setCorte(e.target.value || hoy)}
              className="px-2.5 py-1.5 bg-surface-2 border border-border-strong rounded-lg text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <Button onClick={() => { setEditCuenta(undefined); setModalCuenta(true) }}>
            <Plus className="w-4 h-4" /> Nueva cuenta
          </Button>
        </div>
      </div>
      {corte !== hoy && (
        <p className="text-xs text-amber-700">Mostrando saldos al <b>{corte}</b> (no incluye movimientos posteriores).</p>
      )}

      {/* Totales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Te deben (a cobrar)</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totales.cobrar)}</p>
          {totales.cobrarUsd > 0 && <p className="text-[11px] text-fg-soft">incluye USD {formatCurrency(totales.cobrarUsd, 'USD')}</p>}
        </div>
        <div className="bg-surface border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Les debés (a pagar)</p>
          <p className="text-xl font-bold text-red-700">{formatCurrency(totales.pagar)}</p>
          {totales.pagarUsd > 0 && <p className="text-[11px] text-fg-soft">incluye USD {formatCurrency(totales.pagarUsd, 'USD')}</p>}
        </div>
        <div className="bg-surface border border-orange-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Neto</p>
          <p className={cn('text-xl font-bold', totales.neto >= 0 ? 'text-primary' : 'text-amber-700')}>
            {totales.neto >= 0 ? '+' : ''}{formatCurrency(totales.neto)}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterGroup label="Dirección" value={dir} onChange={(v) => setDir(v as typeof dir)} opts={[['TODAS', 'Todas'], ['COBRAR', 'Te deben'], ['PAGAR', 'Les debés']]} />
        <FilterGroup label="Estado" value={estado} onChange={(v) => setEstado(v as typeof estado)} opts={[['CON_SALDO', 'Con saldo'], ['TODAS', 'Todas']]} />
        <FilterGroup label="Categoría" value={cat} onChange={(v) => setCat(v as typeof cat)} opts={[['TODAS', 'Todas'], ['CLIENTE', 'Clientes'], ['PROVEEDOR', 'Proveedores'], ['SERVICIO', 'Servicios'], ['OTRO', 'Otros']]} />
        <FilterGroup label="Moneda" value={moneda} onChange={(v) => setMoneda(v as typeof moneda)} opts={[['TODAS', 'Todas'], ['ARS', 'Pesos'], ['USD', 'Dólares']]} />
      </div>

      {/* Lista */}
      {visibles.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-10 text-center text-fg-soft">
          {cuentas.length === 0 ? 'Todavía no cargaste ninguna cuenta corriente.' : 'Ninguna cuenta con esos filtros.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map((c) => (
            <CuentaRow
              key={c.id}
              cuenta={c}
              movs={movsByCuenta.get(c.id) ?? []}
              saldo={saldos.get(c.id) ?? 0}
              tcMes={tcMes}
              abierta={expandida === c.id}
              onToggle={() => setExpandida(expandida === c.id ? null : c.id)}
              onEdit={() => { setEditCuenta(c); setModalCuenta(true) }}
            />
          ))}
        </div>
      )}

      <Modal open={modalCuenta} onOpenChange={setModalCuenta} title={editCuenta ? 'Editar cuenta' : 'Nueva cuenta corriente'} className="max-w-md">
        <CuentaForm cuenta={editCuenta} onClose={() => setModalCuenta(false)} />
      </Modal>
    </div>
  )
}

function FilterGroup({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: [string, string][] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-fg-soft uppercase tracking-wide">{label}:</span>
      <div className="flex gap-1">
        {opts.map(([v, l]) => (
          <button key={v} onClick={() => onChange(v)}
            className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
              value === v ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg')}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── CuentaRow ───────────────────────────────────────────────────────────
function CuentaRow({ cuenta, movs, saldo, tcMes, abierta, onToggle, onEdit }: {
  cuenta: CcCuenta; movs: CcMovimiento[]; saldo: number; tcMes: number | null
  abierta: boolean; onToggle: () => void; onEdit: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [modalMov, setModalMov] = useState<null | 'DEUDA' | 'PAGO'>(null)
  const esCobrar = cuenta.naturaleza === 'COBRAR'
  const saldoAbs = Math.abs(saldo)
  // color: cobrar+positivo = verde (te deben); pagar+positivo = rojo (le debés). Si el saldo se da vuelta, invierte.
  const teDebEn = (esCobrar && saldo >= 0) || (!esCobrar && saldo < 0)

  return (
    <div className={cn('bg-surface border rounded-xl overflow-hidden', !cuenta.activo && 'opacity-50')}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={onToggle} className="text-fg-muted hover:text-fg">
          {abierta ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-fg truncate">{cuenta.nombre}</p>
          <p className="text-[11px] text-fg-soft">
            {TIPOS.find((t) => t.v === cuenta.tipo)?.label} · {cuenta.moneda}
          </p>
        </div>
        <div className="text-right">
          <p className={cn('text-sm font-bold font-mono', teDebEn ? 'text-green-700' : 'text-red-700')}>
            {formatCurrency(saldoAbs, cuenta.moneda)}
          </p>
          <p className="text-[10px] text-fg-soft">{teDebEn ? 'te debe' : 'le debés'}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setModalMov('DEUDA')} title="Agregar deuda" className="p-1.5 rounded hover:bg-surface-2 text-red-700"><ArrowUpCircle className="w-4 h-4" /></button>
          <button onClick={() => setModalMov('PAGO')} title="Registrar pago" className="p-1.5 rounded hover:bg-surface-2 text-green-700"><ArrowDownCircle className="w-4 h-4" /></button>
          <button onClick={onEdit} title="Editar cuenta" className="p-1.5 rounded hover:bg-surface-2 text-fg-muted"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => startTransition(() => toggleCcCuentaActiva(cuenta.id, !cuenta.activo).catch((e) => alert(e.message)))} title={cuenta.activo ? 'Desactivar' : 'Activar'} className="p-1.5 rounded hover:bg-surface-2"><Power className={cn('w-3.5 h-3.5', cuenta.activo ? 'text-red-700' : 'text-green-700')} /></button>
          <button onClick={() => { if (confirm(`¿Eliminar "${cuenta.nombre}" y todos sus movimientos?`)) startTransition(() => deleteCcCuenta(cuenta.id).catch((e) => alert(e.message))) }} title="Eliminar" className="p-1.5 rounded hover:bg-surface-2 text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {abierta && (
        <div className="border-t border-border bg-surface-2/30 px-4 py-2">
          {movs.length === 0 ? (
            <p className="text-xs text-fg-soft py-2">Sin movimientos. Cargá una deuda o un pago con los botones ↑↓.</p>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 text-fg-soft w-20">{m.fecha}</td>
                    <td className="py-1.5">
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', m.tipo === 'DEUDA' ? 'bg-red-500/10 text-red-700' : 'bg-green-500/10 text-green-700')}>
                        {m.tipo === 'DEUDA' ? 'Deuda' : 'Pago'}
                      </span>
                    </td>
                    <td className="py-1.5 text-fg-muted">{m.concepto || ''}{m.monto_origen ? <span className="text-fg-soft"> ({formatCurrency(m.monto_origen, m.moneda_origen ?? 'ARS')} @ {m.tc_aplicado})</span> : null}</td>
                    <td className="py-1.5 text-right font-mono text-fg">{formatCurrency(m.monto, cuenta.moneda)}</td>
                    <td className="py-1.5 text-right w-8">
                      <button onClick={() => { if (confirm('¿Borrar este movimiento?')) startTransition(() => deleteCcMovimiento(m.id).catch((e) => alert(e.message))) }} className="text-fg-soft hover:text-red-700"><X className="w-3 h-3" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal open={modalMov !== null} onOpenChange={(o) => !o && setModalMov(null)} title={modalMov === 'DEUDA' ? `Agregar deuda — ${cuenta.nombre}` : `Registrar pago — ${cuenta.nombre}`} className="max-w-md">
        {modalMov && <MovimientoForm cuenta={cuenta} tipo={modalMov} tcMes={tcMes} onClose={() => setModalMov(null)} />}
      </Modal>
    </div>
  )
}

// ─── CuentaForm ──────────────────────────────────────────────────────────
function CuentaForm({ cuenta, onClose }: { cuenta?: CcCuenta; onClose: () => void }) {
  const [nombre, setNombre] = useState(cuenta?.nombre ?? '')
  const [tipo, setTipo] = useState<CcCuenta['tipo']>(cuenta?.tipo ?? 'CLIENTE')
  const [naturaleza, setNaturaleza] = useState<CcCuenta['naturaleza']>(cuenta?.naturaleza ?? 'COBRAR')
  const [monedaC, setMonedaC] = useState<CcCuenta['moneda']>(cuenta?.moneda ?? 'ARS')
  const [notas, setNotas] = useState(cuenta?.notas ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function guardar() {
    setErr(null); setSaving(true)
    const args = { nombre, tipo, naturaleza, moneda: monedaC, notas }
    const r = cuenta ? await updateCcCuenta(cuenta.id, args) : await createCcCuenta(args)
    setSaving(false)
    if (r) { setErr(r); return }
    onClose()
  }

  return (
    <div className="space-y-4">
      <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Samid, Celulandia" autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Categoría" value={tipo} onChange={(e) => setTipo(e.target.value as CcCuenta['tipo'])}
          options={TIPOS.map((t) => ({ value: t.v, label: t.label }))} />
        <Select label="Moneda" value={monedaC} onChange={(e) => setMonedaC(e.target.value as CcCuenta['moneda'])}
          options={[{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }]} />
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-fg">¿Cómo es la cuenta?</label>
        <div className="grid grid-cols-2 gap-2">
          {([['COBRAR', 'Te deben', 'green'], ['PAGAR', 'Les debés', 'red']] as const).map(([v, l, col]) => (
            <button key={v} type="button" onClick={() => setNaturaleza(v)}
              className={cn('px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                naturaleza === v ? (col === 'green' ? 'bg-green-500/15 border-green-500/40 text-green-700' : 'bg-red-500/15 border-red-500/40 text-red-700')
                  : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg')}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <Textarea label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={guardar} disabled={saving || !nombre.trim()}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}{cuenta ? 'Guardar' : 'Crear'}
        </Button>
      </div>
    </div>
  )
}

// ─── MovimientoForm ──────────────────────────────────────────────────────
function MovimientoForm({ cuenta, tipo, tcMes, onClose }: { cuenta: CcCuenta; tipo: 'DEUDA' | 'PAGO'; tcMes: number | null; onClose: () => void }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState<number>(0)
  // Para cuentas USD: opción de cargar en pesos y dolarizar
  const [enPesos, setEnPesos] = useState(false)
  const [tc, setTc] = useState<number>(tcMes ?? 0)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dolariza = cuenta.moneda === 'USD' && enPesos
  const montoCuenta = dolariza ? (tc > 0 ? monto / tc : 0) : monto

  async function guardar() {
    setErr(null)
    if (montoCuenta <= 0) { setErr('El monto debe ser mayor a cero'); return }
    if (dolariza && tc <= 0) { setErr('Cargá el tipo de cambio para dolarizar'); return }
    setSaving(true)
    const r = await addCcMovimiento({
      cuentaId: cuenta.id, fecha, tipo, concepto,
      monto: montoCuenta,
      montoOrigen: dolariza ? monto : null,
      monedaOrigen: dolariza ? 'ARS' : null,
      tcAplicado: dolariza ? tc : null,
    })
    setSaving(false)
    if (r) { setErr(r); return }
    onClose()
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-soft">
        {tipo === 'DEUDA' ? 'Suma al saldo (más deuda).' : 'Baja el saldo (cobro o pago).'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <Input label={`Monto (${dolariza ? 'pesos' : cuenta.moneda})`} type="number" step="0.01" value={monto || ''} onChange={(e) => setMonto(Number(e.target.value))} autoFocus />
      </div>
      {cuenta.moneda === 'USD' && (
        <div className="bg-surface-2/40 border border-border-strong/40 rounded-lg p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" checked={enPesos} onChange={(e) => setEnPesos(e.target.checked)} />
            El movimiento fue en <b>pesos</b> — dolarizar
          </label>
          {enPesos && (
            <div className="flex items-center gap-2">
              <Input label="Tipo de cambio" type="number" step="0.01" value={tc || ''} onChange={(e) => setTc(Number(e.target.value))} className="w-32" />
              <span className="text-xs text-fg-soft mt-5">= USD {formatCurrency(montoCuenta, 'USD')}</span>
            </div>
          )}
        </div>
      )}
      <Input label="Concepto (opcional)" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: venta, seña, pago parcial" />
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={guardar} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}{tipo === 'DEUDA' ? 'Agregar deuda' : 'Registrar pago'}
        </Button>
      </div>
    </div>
  )
}
