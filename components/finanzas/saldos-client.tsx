'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  createTitular, createCuenta, updateCuenta, toggleCuentaActiva,
  upsertSaldoCuenta, cerrarSaldoMes, upsertTipoCambioMes,
  createActivoManual, updateActivoManual, deleteActivoManual,
  bulkUpsertSaldosCuentas,
} from '@/app/actions/finanzas'
import type { CuentaTitular, CuentaBancaria, SaldoCuenta, TipoCambioMes, ActivoManual } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatMonth, getMonthOptions } from '@/lib/utils'
import {
  Plus, Wallet, Building2, Lock, Unlock, Pencil, UserPlus,
  Loader2, DollarSign, TrendingUp, AlertCircle, Power, Sparkles, Trash2,
  Zap, Save, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SaldosClientProps {
  mes: string
  titulares: CuentaTitular[]
  cuentas: CuentaBancaria[]
  saldos: SaldoCuenta[]
  tipoCambio: TipoCambioMes | null
  activosManuales: ActivoManual[]
}

const TIPOS_CUENTA = [
  { value: 'BANCO', label: 'Banco' },
  { value: 'BILLETERA', label: 'Billetera virtual' },
  { value: 'CAJA', label: 'Caja / Efectivo' },
  { value: 'CTA_CORRIENTE', label: 'Cuenta corriente' },
]

const TIPOS_TITULAR = [
  { value: 'EMPRESA', label: 'Empresa' },
  { value: 'SOCIO', label: 'Socio' },
  { value: 'OTRO', label: 'Otro' },
]

// ─── TitularForm ──────────────────────────────────────────────────────────────

function TitularForm({ onClose }: { onClose: () => void }) {
  const [error, action, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const r = await createTitular(prev, fd)
      if (!r) onClose()
      return r
    },
    null
  )
  return (
    <form action={action} className="space-y-4">
      <Input label="Nombre" name="nombre" placeholder="Ej: Areben SRL, Darío Arévalo" required />
      <Select label="Tipo" name="tipo" options={TIPOS_TITULAR} defaultValue="EMPRESA" />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Crear titular
        </Button>
      </div>
    </form>
  )
}

// ─── CuentaForm ───────────────────────────────────────────────────────────────

function CuentaForm({
  cuenta,
  titulares,
  onClose,
}: {
  cuenta?: CuentaBancaria
  titulares: CuentaTitular[]
  onClose: () => void
}) {
  const action = cuenta ? updateCuenta.bind(null, cuenta.id) : createCuenta
  const [permiteDual, setPermiteDual] = useState(cuenta?.permite_dual ?? false)
  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('permite_dual', permiteDual ? 'true' : 'false')
      const r = await action(prev, fd)
      if (!r) onClose()
      return r
    },
    null
  )
  return (
    <form action={formAction} className="space-y-4">
      <Select
        label="Titular"
        name="titular_id"
        defaultValue={cuenta?.titular_id ?? titulares[0]?.id}
        options={titulares.map((t) => ({ value: t.id, label: t.nombre }))}
        required
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Nombre de cuenta" name="nombre" placeholder="Ej: Cta Cte ARS" defaultValue={cuenta?.nombre} required />
        <Input label="Banco / Plataforma" name="banco" placeholder="Ej: Galicia, MP" defaultValue={cuenta?.banco} required />
      </div>
      <Select label="Tipo" name="tipo" options={TIPOS_CUENTA} defaultValue={cuenta?.tipo ?? 'BANCO'} />
      <label className="flex items-center gap-2 cursor-pointer p-3 bg-surface-2/60 border border-border-strong/60 rounded-lg">
        <input
          type="checkbox"
          checked={permiteDual}
          onChange={(e) => setPermiteDual(e.target.checked)}
          className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2"
        />
        <span className="text-sm text-fg-muted">Permite saldo dual (ARS + USD)</span>
      </label>
      <Input label="Notas" name="notas" defaultValue={cuenta?.notas ?? ''} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {cuenta ? 'Guardar' : 'Crear cuenta'}
        </Button>
      </div>
    </form>
  )
}

// ─── CuentaRow ────────────────────────────────────────────────────────────────

function CuentaRow({
  cuenta,
  saldo,
  mes,
  onEdit,
}: {
  cuenta: CuentaBancaria
  saldo?: SaldoCuenta
  mes: string
  onEdit: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [ars, setArs] = useState(saldo?.saldo_ars ?? 0)
  const [usd, setUsd] = useState(saldo?.saldo_usd ?? 0)
  const [isPending, startTransition] = useTransition()
  const cerrado = saldo?.cerrado ?? false

  function guardar() {
    startTransition(() => {
      upsertSaldoCuenta(cuenta.id, mes, ars, usd, saldo?.notas ?? null).then(() => {
        setEditando(false)
      }).catch((e) => alert(e.message))
    })
  }

  function toggleCierre() {
    if (!saldo) return
    startTransition(() => {
      cerrarSaldoMes(cuenta.id, mes, !cerrado).catch((e) => alert(e.message))
    })
  }

  return (
    <tr className={cn(
      'border-b border-border/60',
      !cuenta.activo && 'opacity-50',
      cerrado && 'bg-green-500/5'
    )}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5 text-fg-soft" />
          <div>
            <p className="font-medium text-fg text-sm">{cuenta.nombre}</p>
            <p className="text-xs text-fg-soft">{cuenta.banco} · {cuenta.titular?.nombre ?? '—'}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant="default">{cuenta.tipo}</Badge>
        {!cuenta.activo && <Badge variant="danger" className="ml-1">Inactiva</Badge>}
      </td>
      <td className="px-4 py-3 text-right">
        {editando ? (
          <input
            type="number"
            step="0.01"
            value={ars || ''}
            onChange={(e) => setArs(Number(e.target.value))}
            className="w-32 px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-fg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        ) : (
          <span className="font-mono text-fg text-sm">{formatCurrency(saldo?.saldo_ars ?? 0)}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {cuenta.permite_dual && (
          editando ? (
            <input
              type="number"
              step="0.01"
              value={usd || ''}
              onChange={(e) => setUsd(Number(e.target.value))}
              className="w-32 px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-green-700 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          ) : (
            <span className="font-mono text-green-700 text-sm">{formatCurrency(saldo?.saldo_usd ?? 0, 'USD')}</span>
          )
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          {editando ? (
            <>
              <Button size="sm" variant="success" onClick={guardar} disabled={isPending}>
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditando(false)}>Cancelar</Button>
            </>
          ) : (
            <>
              {!cerrado && (
                <Button size="sm" variant="ghost" onClick={() => setEditando(true)} title="Editar saldo">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              )}
              {saldo && (
                <Button size="sm" variant={cerrado ? 'success' : 'ghost'} onClick={toggleCierre} title={cerrado ? 'Reabrir' : 'Cerrar mes'} disabled={isPending}>
                  {cerrado ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onEdit} title="Editar cuenta">
                <Building2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => startTransition(() => toggleCuentaActiva(cuenta.id, !cuenta.activo))}
                title={cuenta.activo ? 'Desactivar' : 'Activar'}
              >
                <Power className={cn('w-3.5 h-3.5', cuenta.activo ? 'text-red-700' : 'text-green-700')} />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── ActivoManualForm ─────────────────────────────────────────────────────────

const CATEGORIAS_ACTIVO = [
  'Crypto', 'Inversión', 'Préstamo otorgado', 'Inmueble', 'Vehículo', 'Mercadería',
  'Cuentas a cobrar', 'Otro',
]

function ActivoManualForm({
  activo,
  mes,
  titulares,
  onClose,
}: {
  activo?: ActivoManual
  mes: string
  titulares: CuentaTitular[]
  onClose: () => void
}) {
  const action = activo ? updateActivoManual.bind(null, activo.id) : createActivoManual
  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('mes', mes)
      const r = await action(prev, fd)
      if (!r) onClose()
      return r
    },
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <Input
        label="Descripción"
        name="descripcion"
        defaultValue={activo?.descripcion}
        placeholder="Ej: Bitcoin en Lemon, Préstamo a Juan, etc."
        required
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Categoría"
          name="categoria"
          defaultValue={activo?.categoria ?? 'Otro'}
          options={CATEGORIAS_ACTIVO.map((c) => ({ value: c, label: c }))}
        />
        <Select
          label="Titular"
          name="titular_id"
          defaultValue={activo?.titular_id ?? ''}
          options={[
            { value: '', label: '— Sin asignar —' },
            ...titulares.map((t) => ({ value: t.id, label: t.nombre })),
          ]}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Monto" name="monto" type="number" step="0.01" min="0" defaultValue={activo?.monto ?? 0} required />
        <Select
          label="Moneda"
          name="moneda"
          defaultValue={activo?.moneda ?? 'ARS'}
          options={[
            { value: 'ARS', label: 'ARS' },
            { value: 'USD', label: 'USD' },
          ]}
        />
      </div>
      <Textarea label="Notas" name="notas" defaultValue={activo?.notas ?? ''} placeholder="Detalle, ubicación, condiciones..." rows={2} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {activo ? 'Guardar' : 'Agregar activo'}
        </Button>
      </div>
    </form>
  )
}

// ─── BulkSaldosGrid ───────────────────────────────────────────────────────────

function BulkSaldosGrid({
  mes,
  cuentas,
  titulares,
  saldosByCuenta,
  onDone,
}: {
  mes: string
  cuentas: CuentaBancaria[]
  titulares: CuentaTitular[]
  saldosByCuenta: Map<string, SaldoCuenta>
  onDone: () => void
}) {
  // Estado local: cuenta_id -> { ars, usd }
  const initialValues = new Map<string, { ars: number; usd: number }>()
  for (const c of cuentas) {
    const s = saldosByCuenta.get(c.id)
    initialValues.set(c.id, {
      ars: s?.saldo_ars ?? 0,
      usd: s?.saldo_usd ?? 0,
    })
  }
  const [values, setValues] = useState(initialValues)
  const [isPending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<string | null>(null)

  function setVal(id: string, key: 'ars' | 'usd', v: number) {
    setValues((prev) => {
      const next = new Map(prev)
      const cur = next.get(id) ?? { ars: 0, usd: 0 }
      next.set(id, { ...cur, [key]: v })
      return next
    })
  }

  function guardarTodos() {
    const items = Array.from(values.entries()).map(([cuenta_id, v]) => ({
      cuenta_id,
      saldo_ars: v.ars,
      saldo_usd: v.usd,
    }))
    startTransition(async () => {
      try {
        await bulkUpsertSaldosCuentas(mes, items)
        setSavedAt(new Date().toLocaleTimeString('es-AR'))
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  // Agrupar por titular para mostrar
  const cuentasPorTit = new Map<string, CuentaBancaria[]>()
  for (const c of cuentas) {
    const tid = c.titular_id
    if (!cuentasPorTit.has(tid)) cuentasPorTit.set(tid, [])
    cuentasPorTit.get(tid)!.push(c)
  }

  const totalArs = Array.from(values.values()).reduce((s, v) => s + (v.ars || 0), 0)
  const totalUsd = Array.from(values.values()).reduce((s, v) => s + (v.usd || 0), 0)

  return (
    <div className="bg-surface border border-green-500/30 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-green-500/5 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
            <Zap className="w-4 h-4 text-green-700" />
            Carga rápida de saldos — {formatMonth(mes)}
          </h2>
          <p className="text-xs text-fg-muted mt-0.5">
            Editá todos los saldos del mes en una sola pantalla y guardá con un solo click.
            {savedAt && <span className="ml-2 text-green-700">✓ Guardado a las {savedAt}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onDone} title="Volver a vista normal">
            <X className="w-3.5 h-3.5" />
            Cerrar
          </Button>
          <Button size="sm" variant="success" onClick={guardarTodos} disabled={isPending} title="Guardar todos los saldos editados de una sola vez">
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar todos
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/40">
              <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Titular</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Cuenta</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Banco</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Saldo ARS</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Saldo USD</th>
            </tr>
          </thead>
          <tbody>
            {titulares.map((tit) => {
              const cs = cuentasPorTit.get(tit.id) ?? []
              if (cs.length === 0) return null
              return cs.map((c, idx) => {
                const v = values.get(c.id) ?? { ars: 0, usd: 0 }
                return (
                  <tr key={c.id} className="border-b border-border/40 hover:bg-surface-2/30">
                    <td className="px-4 py-2">
                      {idx === 0 ? (
                        <span className="text-xs text-fg-muted font-medium">{tit.nombre}</span>
                      ) : (
                        <span className="text-xs text-fg-muted">↳</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-fg-muted">{c.nombre}</td>
                    <td className="px-4 py-2 text-fg-muted text-xs">{c.banco}</td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={v.ars || ''}
                        onChange={(e) => setVal(c.id, 'ars', Number(e.target.value))}
                        placeholder="0,00"
                        className="w-32 px-2 py-1 bg-surface-2 border border-border-strong rounded text-fg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-right"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {c.permite_dual ? (
                        <input
                          type="number"
                          step="0.01"
                          value={v.usd || ''}
                          onChange={(e) => setVal(c.id, 'usd', Number(e.target.value))}
                          placeholder="0,00"
                          className="w-32 px-2 py-1 bg-surface-2 border border-border-strong rounded text-green-700 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-right"
                        />
                      ) : (
                        <span className="text-xs text-fg-muted">— sólo ARS —</span>
                      )}
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-strong bg-surface-2/60">
              <td colSpan={3} className="px-4 py-2 text-sm font-semibold text-fg-muted">TOTAL ({cuentas.length} cuentas)</td>
              <td className="px-4 py-2 text-right font-mono font-bold text-primary">{formatCurrency(totalArs)}</td>
              <td className="px-4 py-2 text-right font-mono font-bold text-green-700">{formatCurrency(totalUsd, 'USD')}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-border bg-surface-2/20 flex justify-end">
        <Button variant="success" onClick={guardarTodos} disabled={isPending} title="Guardar todos los saldos editados de una sola vez">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar todos los saldos
        </Button>
      </div>
    </div>
  )
}

// ─── SaldosClient ─────────────────────────────────────────────────────────────

export function SaldosClient({ mes, titulares, cuentas, saldos, tipoCambio, activosManuales }: SaldosClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [titularModal, setTitularModal] = useState(false)
  const [cuentaModal, setCuentaModal] = useState(false)
  const [activoModal, setActivoModal] = useState(false)
  const [editCuenta, setEditCuenta] = useState<CuentaBancaria | undefined>()
  const [editActivo, setEditActivo] = useState<ActivoManual | undefined>()
  const [tcInput, setTcInput] = useState(tipoCambio?.tipo_cambio ?? 0)
  const [isPending, startTransition] = useTransition()
  const [bulkMode, setBulkMode] = useState(false)

  const saldosByCuenta = new Map(saldos.map((s) => [s.cuenta_id, s]))

  const totalArsCuentas = cuentas.reduce((s, c) => s + (saldosByCuenta.get(c.id)?.saldo_ars ?? 0), 0)
  const totalUsdCuentas = cuentas.reduce((s, c) => s + (saldosByCuenta.get(c.id)?.saldo_usd ?? 0), 0)
  const totalArsManuales = activosManuales.filter((a) => a.moneda === 'ARS').reduce((s, a) => s + Number(a.monto), 0)
  const totalUsdManuales = activosManuales.filter((a) => a.moneda === 'USD').reduce((s, a) => s + Number(a.monto), 0)
  const totalArs = totalArsCuentas + totalArsManuales
  const totalUsd = totalUsdCuentas + totalUsdManuales
  const tc = tipoCambio?.tipo_cambio ?? 0
  const totalUsdEquivalente = tc > 0 ? totalArs / tc + totalUsd : 0

  const cuentasPorTitular = new Map<string, CuentaBancaria[]>()
  for (const c of cuentas) {
    const tid = c.titular_id
    if (!cuentasPorTitular.has(tid)) cuentasPorTitular.set(tid, [])
    cuentasPorTitular.get(tid)!.push(c)
  }

  function setMes(nuevo: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', nuevo)
    router.push(`?${params.toString()}`)
  }

  function guardarTC() {
    if (!tcInput) return
    startTransition(() => {
      upsertTipoCambioMes(mes, tcInput).catch((e) => alert(e.message))
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg">Tesorería</h1>
          <p className="text-sm text-fg-muted mt-0.5">Saldos por cuenta — {formatMonth(mes)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            options={getMonthOptions()}
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="w-44"
          />
          <Button
            variant={bulkMode ? 'success' : 'secondary'}
            onClick={() => setBulkMode((v) => !v)}
            title="Editar todos los saldos en una sola pantalla (modo planilla)"
          >
            <Zap className="w-4 h-4" />
            {bulkMode ? 'Salir carga rápida' : 'Carga rápida'}
          </Button>
          <Button variant="secondary" onClick={() => setTitularModal(true)} title="Crear nuevo titular de cuenta">
            <UserPlus className="w-4 h-4" />
            Titular
          </Button>
          <Button onClick={() => { setEditCuenta(undefined); setCuentaModal(true) }} title="Agregar nueva cuenta bancaria">
            <Plus className="w-4 h-4" />
            Cuenta
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-surface border border-orange-500/20 rounded-xl p-5">
          <p className="text-xs text-fg-muted mb-1 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" />
            Total ARS
          </p>
          <p className="text-2xl font-bold text-primary">{formatCurrency(totalArs)}</p>
        </div>
        <div className="bg-surface border border-green-500/20 rounded-xl p-5">
          <p className="text-xs text-fg-muted mb-1 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" />
            Total USD
          </p>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(totalUsd, 'USD')}</p>
        </div>
        <div className="bg-surface border border-amber-500/20 rounded-xl p-5">
          <p className="text-xs text-fg-muted mb-1 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Equivalente USD
          </p>
          {tc > 0 ? (
            <>
              <p className="text-2xl font-bold text-amber-700">{formatCurrency(totalUsdEquivalente, 'USD')}</p>
              <p className="text-xs text-fg-soft mt-1">TC: ${tc.toFixed(2)}</p>
            </>
          ) : (
            <p className="text-sm text-fg-soft">Definí TC para ver</p>
          )}
        </div>
      </div>

      {/* Tipo de cambio del mes */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-fg-muted text-sm">
            <AlertCircle className="w-4 h-4 text-amber-700" />
            <span className="font-medium">Tipo de cambio del mes</span>
          </div>
          <input
            type="number"
            step="0.01"
            min="0"
            value={tcInput || ''}
            onChange={(e) => setTcInput(Number(e.target.value))}
            placeholder="Ej: 1080"
            className="w-32 px-3 py-1.5 bg-surface-2 border border-border-strong rounded-lg text-fg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button size="sm" onClick={guardarTC} disabled={isPending}>
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Guardar TC
          </Button>
          {tipoCambio && <span className="text-xs text-fg-soft">Actual: ${tipoCambio.tipo_cambio.toFixed(2)} ({tipoCambio.fuente ?? 'manual'})</span>}
        </div>
      </div>

      {bulkMode ? (
        <BulkSaldosGrid
          mes={mes}
          cuentas={cuentas.filter((c) => c.activo)}
          titulares={titulares}
          saldosByCuenta={saldosByCuenta}
          onDone={() => setBulkMode(false)}
        />
      ) : (
        /* Cuentas agrupadas por titular */
        titulares.map((titular) => {
          const cuentasTit = cuentasPorTitular.get(titular.id) ?? []
          if (cuentasTit.length === 0 && titular.tipo === 'EMPRESA') {
            return (
              <div key={titular.id} className="bg-surface border border-border rounded-xl p-6 text-center">
                <p className="text-sm text-fg-muted mb-3">{titular.nombre} — sin cuentas</p>
                <Button size="sm" variant="secondary" onClick={() => { setEditCuenta(undefined); setCuentaModal(true) }}>
                  <Plus className="w-3.5 h-3.5" />
                  Agregar primera cuenta
                </Button>
              </div>
            )
          }
          if (cuentasTit.length === 0) return null

          return (
            <div key={titular.id} className="bg-surface border border-border rounded-xl overflow-x-auto">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
                  {titular.nombre}
                  <Badge variant={titular.tipo === 'EMPRESA' ? 'info' : 'default'}>{titular.tipo}</Badge>
                </h2>
                <span className="text-xs text-fg-soft">{cuentasTit.length} cuenta(s)</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Cuenta</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Tipo</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">ARS</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">USD</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cuentasTit.map((c) => (
                    <CuentaRow
                      key={c.id}
                      cuenta={c}
                      saldo={saldosByCuenta.get(c.id)}
                      mes={mes}
                      onEdit={() => { setEditCuenta(c); setCuentaModal(true) }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        })
      )}

      {/* Otros activos manuales (no bancarios) */}
      <div className="bg-surface border border-purple-500/20 rounded-xl overflow-x-auto">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-700" />
              Otros activos
            </h2>
            <p className="text-xs text-fg-soft mt-0.5">Crypto, préstamos otorgados, mercadería, etc. — items no bancarios</p>
          </div>
          <Button size="sm" onClick={() => { setEditActivo(undefined); setActivoModal(true) }} title="Agregar activo manual">
            <Plus className="w-3.5 h-3.5" />
            Agregar
          </Button>
        </div>
        {activosManuales.length === 0 ? (
          <p className="px-4 py-6 text-xs text-fg-soft text-center">Sin otros activos cargados para {formatMonth(mes)}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Descripción</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Categoría</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Titular</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Monto</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Moneda</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {activosManuales.map((a) => (
                <tr key={a.id} className="border-b border-border/60 hover:bg-surface-2/30">
                  <td className="px-4 py-2">
                    <p className="text-fg">{a.descripcion}</p>
                    {a.notas && <p className="text-xs text-fg-soft truncate max-w-[260px]">{a.notas}</p>}
                  </td>
                  <td className="px-4 py-2 text-xs text-fg-muted">{a.categoria ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-fg-muted">{a.titular?.nombre ?? '—'}</td>
                  <td className="px-4 py-2 text-right font-mono text-purple-700 font-medium">{formatCurrency(Number(a.monto), a.moneda)}</td>
                  <td className="px-4 py-2"><Badge variant={a.moneda === 'USD' ? 'success' : 'info'}>{a.moneda}</Badge></td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditActivo(a); setActivoModal(true) }} title="Editar">
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          if (!confirm('¿Eliminar este activo?')) return
                          startTransition(() => deleteActivoManual(a.id).catch((e) => alert(e.message)))
                        }}
                        title="Eliminar"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {(totalArsManuales > 0 || totalUsdManuales > 0) && (
              <tfoot>
                <tr className="border-t border-border-strong bg-surface-2/40">
                  <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-fg-muted">Subtotal otros activos</td>
                  <td className="px-4 py-2 text-right font-mono text-purple-700 font-bold">
                    {totalArsManuales > 0 && formatCurrency(totalArsManuales)}
                    {totalArsManuales > 0 && totalUsdManuales > 0 && <br />}
                    {totalUsdManuales > 0 && formatCurrency(totalUsdManuales, 'USD')}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* Modales */}
      <Modal open={titularModal} onOpenChange={setTitularModal} title="Nuevo titular" className="max-w-md">
        <TitularForm onClose={() => setTitularModal(false)} />
      </Modal>

      <Modal
        open={cuentaModal}
        onOpenChange={setCuentaModal}
        title={editCuenta ? 'Editar cuenta' : 'Nueva cuenta'}
        className="max-w-md"
      >
        <CuentaForm cuenta={editCuenta} titulares={titulares} onClose={() => setCuentaModal(false)} />
      </Modal>

      <Modal
        open={activoModal}
        onOpenChange={setActivoModal}
        title={editActivo ? 'Editar activo' : 'Nuevo activo manual'}
        description="Items que no son cuentas bancarias (crypto, préstamos otorgados, mercadería, etc.)"
        className="max-w-md"
      >
        <ActivoManualForm activo={editActivo} mes={mes} titulares={titulares} onClose={() => setActivoModal(false)} />
      </Modal>
    </div>
  )
}
