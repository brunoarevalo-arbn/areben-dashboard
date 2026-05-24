'use client'

import { useActionState, useState, useTransition, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  createCuentaPatrim, updateCuentaPatrim, deleteCuentaPatrim, toggleCuentaPatrimActiva,
  upsertSaldoCuentaPatrim, arrastrarSaldosPatrim, sugerirMovimientoInventario,
} from '@/app/actions/finanzas'
import type { CuentaPatrimonial, SaldoCuentaPatrim, TipoCuentaPatrim } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatMonth, getMonthOptions } from '@/lib/utils'
import {
  Plus, Pencil, Trash2, Loader2, RotateCw, Power, Save, X,
  TrendingUp, ArrowDownCircle, Briefcase, Receipt, Building2, ShieldAlert,
  ChevronDown, ChevronUp, Boxes, Wand2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const TIPOS: { v: TipoCuentaPatrim; label: string; icon: React.ElementType; color: string; signoDefault: 1 | -1 }[] = [
  { v: 'INVENTARIO', label: 'Inventario', icon: Boxes, color: 'teal', signoDefault: 1 },
  { v: 'INVERSION', label: 'Inversión', icon: TrendingUp, color: 'indigo', signoDefault: 1 },
  { v: 'PROVISION', label: 'Provisión', icon: ShieldAlert, color: 'red', signoDefault: -1 },
  { v: 'CTA_CTE_MARCA', label: 'Cta. Cte. Marca', icon: Building2, color: 'purple', signoDefault: 1 },
  { v: 'PASIVO_ROTATIVO', label: 'Pasivo Rotativo', icon: ArrowDownCircle, color: 'amber', signoDefault: -1 },
  { v: 'IMPOSITIVO', label: 'Impositivo', icon: Receipt, color: 'cyan', signoDefault: 1 },
  { v: 'OTRO_ACTIVO', label: 'Otro Activo', icon: Briefcase, color: 'green', signoDefault: 1 },
  { v: 'OTRO_PASIVO', label: 'Otro Pasivo', icon: ArrowDownCircle, color: 'rose', signoDefault: -1 },
]

const COLORES: Record<string, string> = {
  teal: 'border-teal-500/30 text-teal-400',
  indigo: 'border-orange-500/30 text-orange-500',
  red: 'border-red-500/30 text-red-700',
  purple: 'border-purple-500/30 text-purple-700',
  amber: 'border-amber-500/30 text-amber-700',
  cyan: 'border-cyan-500/30 text-cyan-400',
  green: 'border-green-500/30 text-green-700',
  rose: 'border-rose-500/30 text-rose-400',
}

function tipoConfig(t: TipoCuentaPatrim) {
  return TIPOS.find((x) => x.v === t) ?? TIPOS[0]
}

interface Props {
  mes: string
  cuentas: CuentaPatrimonial[]
  saldos: SaldoCuentaPatrim[]
}

// ─── CuentaForm ────────────────────────────────────────────────────────────────

function CuentaForm({ cuenta, onClose }: { cuenta?: CuentaPatrimonial; onClose: () => void }) {
  const action = cuenta ? updateCuentaPatrim.bind(null, cuenta.id) : createCuentaPatrim
  const [tipo, setTipo] = useState<TipoCuentaPatrim>(cuenta?.tipo ?? 'OTRO_ACTIVO')
  const [signo, setSigno] = useState<1 | -1>((cuenta?.signo_pn ?? tipoConfig('OTRO_ACTIVO').signoDefault) as 1 | -1)

  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('signo_pn', String(signo))
      const r = await action(prev, fd)
      if (!r) onClose()
      return r
    },
    null
  )

  function handleTipoChange(v: TipoCuentaPatrim) {
    setTipo(v)
    setSigno(tipoConfig(v).signoDefault)
  }

  return (
    <form action={formAction} className="space-y-4">
      <Input label="Nombre" name="nombre" defaultValue={cuenta?.nombre} placeholder="Ej: IVA crédito fiscal" required />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">Tipo</label>
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => handleTipoChange(e.target.value as TipoCuentaPatrim)}
            className="w-full px-3.5 py-2.5 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            required
          >
            {TIPOS.map((t) => (
              <option key={t.v} value={t.v}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">Signo en PN</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: 1, label: '+ Suma (activo)', color: 'green' },
              { v: -1, label: '− Resta (pasivo)', color: 'red' },
            ] as const).map((s) => (
              <button
                key={s.v}
                type="button"
                onClick={() => setSigno(s.v as 1 | -1)}
                className={cn(
                  'px-2 py-2 rounded-lg border text-xs font-medium transition-colors',
                  signo === s.v
                    ? s.color === 'green'
                      ? 'bg-green-500/15 border-green-500/40 text-green-700'
                      : 'bg-red-500/15 border-red-500/40 text-red-700'
                    : 'bg-[#f5f0e6] border-[#d6d0c4] text-slate-600 hover:text-slate-800'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Código (opcional)" name="codigo" defaultValue={cuenta?.codigo ?? ''} placeholder="Ej: PROV-JUD-01" />
        <Input label="Categoría (opcional)" name="categoria" defaultValue={cuenta?.categoria ?? ''} placeholder="Ej: iva, packaging, judicial" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select
          label="Marca (opcional)"
          name="marca"
          defaultValue={cuenta?.marca ?? ''}
          options={[
            { value: '', label: '— Sin marca —' },
            { value: 'BDI', label: 'BDI' },
            { value: 'ZATTIA', label: 'ZATTIA' },
            { value: 'STUNNED', label: 'STUNNED' },
            { value: 'GENERAL', label: 'GENERAL' },
          ]}
        />
        <Select
          label="Moneda"
          name="moneda"
          defaultValue={cuenta?.moneda ?? 'ARS'}
          options={[
            { value: 'ARS', label: 'ARS' },
            { value: 'USD', label: 'USD' },
          ]}
        />
        <Input label="Orden" name="orden" type="number" defaultValue={cuenta?.orden ?? 0} />
      </div>

      <div className="bg-[#f5f0e6]/40 border border-[#d6d0c4]/40 rounded-lg p-3 space-y-3">
        <p className="text-xs font-medium text-slate-600 uppercase">Saldo histórico inicial (mes 0)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Saldo inicial" name="saldo_inicial" type="number" step="0.01" defaultValue={cuenta?.saldo_inicial ?? 0} />
          <Input label="Mes inicial (YYYY-MM)" name="mes_inicial" type="month" defaultValue={cuenta?.mes_inicial ?? ''} />
        </div>
        <p className="text-xs text-slate-500">
          Este saldo se usa cuando no hay datos del mes anterior. Si lo dejás en 0 y sin mes inicial, la cuenta arranca desde cero.
        </p>
      </div>

      <Textarea label="Notas" name="notas" defaultValue={cuenta?.notas ?? ''} rows={2} />

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

// ─── SaldoRow ──────────────────────────────────────────────────────────────────

function SaldoRow({
  cuenta,
  saldo,
  mes,
  onEdit,
  onDelete,
  onToggle,
}: {
  cuenta: CuentaPatrimonial
  saldo: SaldoCuentaPatrim | undefined
  mes: string
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [movimiento, setMovimiento] = useState<number>(Number(saldo?.movimiento ?? 0))
  const [saldoInicio, setSaldoInicio] = useState<number>(Number(saldo?.saldo_inicio ?? 0))
  const [isPending, startTransition] = useTransition()
  const [isSugiriendo, setIsSugiriendo] = useState(false)

  const saldoCierre = saldoInicio + movimiento
  // INVENTARIO: el signo es el del propio saldo (dinámico). Otros tipos: signo fijo × saldo
  const esInventario = cuenta.tipo === 'INVENTARIO'
  const aporta = esInventario ? saldoCierre : cuenta.signo_pn * saldoCierre

  async function sugerir() {
    if (!cuenta.marca || !esInventario) return
    setIsSugiriendo(true)
    try {
      const r = await sugerirMovimientoInventario({
        cuentaId: cuenta.id,
        marca: cuenta.marca as 'BDI' | 'ZATTIA' | 'STUNNED',
        mes,
      })
      setSaldoInicio(r.saldoInicio)
      setMovimiento(r.movimiento)
      setEditing(true)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setIsSugiriendo(false)
    }
  }

  function guardar() {
    startTransition(async () => {
      try {
        await upsertSaldoCuentaPatrim({
          cuentaId: cuenta.id,
          mes,
          saldoInicio,
          movimiento,
        })
        setEditing(false)
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  return (
    <tr className={cn('border-b border-[#e8e4dc]/60 hover:bg-[#f5f0e6]/30', !cuenta.activo && 'opacity-50')}>
      <td className="px-4 py-2">
        <p className="text-slate-800 text-sm font-medium">{cuenta.nombre}</p>
        <p className="text-xs text-slate-500">
          {cuenta.codigo && <>{cuenta.codigo} · </>}
          {cuenta.categoria}
          {cuenta.marca && <> · {cuenta.marca}</>}
        </p>
      </td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <input
            type="number"
            step="0.01"
            value={saldoInicio}
            onChange={(e) => setSaldoInicio(Number(e.target.value))}
            className="w-32 px-2 py-1 bg-slate-700 border border-[#c8c0b0] rounded text-slate-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        ) : (
          <span className="font-mono text-slate-700 text-xs">{formatCurrency(saldoInicio, cuenta.moneda)}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <input
            type="number"
            step="0.01"
            value={movimiento}
            onChange={(e) => setMovimiento(Number(e.target.value))}
            className="w-32 px-2 py-1 bg-slate-700 border border-[#c8c0b0] rounded text-slate-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        ) : (
          <span className={cn(
            'font-mono text-xs',
            movimiento > 0 ? 'text-emerald-400' : movimiento < 0 ? 'text-rose-400' : 'text-slate-500'
          )}>
            {movimiento !== 0 ? formatCurrency(movimiento, cuenta.moneda) : '—'}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-slate-900 text-sm font-medium">
        {formatCurrency(saldoCierre, cuenta.moneda)}
      </td>
      <td className="px-3 py-2 text-right text-xs">
        <span className={cn('font-mono', aporta >= 0 ? 'text-orange-500' : 'text-amber-700')}>
          {esInventario ? (
            <>
              {aporta >= 0 ? '+' : '−'} {formatCurrency(Math.abs(saldoCierre), cuenta.moneda)}
              <span className="block text-[9px] text-slate-500 font-sans">
                {aporta >= 0 ? 'activo (stock)' : 'pasivo (reposición)'}
              </span>
            </>
          ) : (
            <>{cuenta.signo_pn > 0 ? '+' : '−'} {formatCurrency(Math.abs(saldoCierre), cuenta.moneda)}</>
          )}
        </span>
      </td>
      <td className="px-2 py-2 text-right">
        <div className="flex items-center gap-1 justify-end">
          {editing ? (
            <>
              <button
                onClick={guardar}
                disabled={isPending}
                className="p-1 rounded bg-green-600/20 text-green-700 hover:bg-green-600/30"
                title="Guardar"
              >
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              </button>
              <button
                onClick={() => {
                  setEditing(false)
                  setSaldoInicio(Number(saldo?.saldo_inicio ?? 0))
                  setMovimiento(Number(saldo?.movimiento ?? 0))
                }}
                className="p-1 rounded bg-slate-700 text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <>
              {esInventario && cuenta.marca && (
                <button
                  onClick={sugerir}
                  disabled={isSugiriendo}
                  title="Sugerir movimiento (Compras − CMV del mes)"
                  className="p-1 rounded hover:bg-[#e8e0d0] text-teal-400"
                >
                  {isSugiriendo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                </button>
              )}
              <button onClick={() => setEditing(true)} title="Editar saldo del mes" className="p-1 rounded hover:bg-[#e8e0d0] text-slate-600">
                <Pencil className="w-3 h-3" />
              </button>
              <button onClick={onEdit} title="Editar cuenta" className="p-1 rounded hover:bg-[#e8e0d0] text-slate-600">
                <Building2 className="w-3 h-3" />
              </button>
              <button onClick={onToggle} title={cuenta.activo ? 'Desactivar' : 'Activar'} className="p-1 rounded hover:bg-[#e8e0d0]">
                <Power className={cn('w-3 h-3', cuenta.activo ? 'text-red-700' : 'text-green-700')} />
              </button>
              <button onClick={onDelete} title="Eliminar cuenta" className="p-1 rounded hover:bg-[#e8e0d0] text-red-700">
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── CuentasPatrimonialesClient ────────────────────────────────────────────────

export function CuentasPatrimonialesClient({ mes, cuentas, saldos }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [modal, setModal] = useState(false)
  const [editCuenta, setEditCuenta] = useState<CuentaPatrimonial | undefined>()
  const [openTipos, setOpenTipos] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(TIPOS.map((t) => [t.v, true])),
  )
  const [isPending, startTransition] = useTransition()

  const saldosByCuenta = useMemo(() => {
    const m = new Map<string, SaldoCuentaPatrim>()
    for (const s of saldos) m.set(s.cuenta_id, s)
    return m
  }, [saldos])

  function setMes(nuevo: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', nuevo)
    router.push(`?${params.toString()}`)
  }

  // Totales por tipo (en moneda principal — para simplicidad muestro ARS y USD juntos)
  const totalesPorTipo = useMemo(() => {
    const map = new Map<TipoCuentaPatrim, { ars: number; usd: number; aportaArs: number; aportaUsd: number }>()
    for (const c of cuentas) {
      if (!c.activo) continue
      const s = saldosByCuenta.get(c.id)
      const saldoCierre = Number(s?.saldo_cierre ?? 0)
      // INVENTARIO usa signo dinámico (el del saldo); otros tipos usan signo_pn fijo
      const aporte = c.tipo === 'INVENTARIO' ? saldoCierre : c.signo_pn * saldoCierre
      if (!map.has(c.tipo)) map.set(c.tipo, { ars: 0, usd: 0, aportaArs: 0, aportaUsd: 0 })
      const e = map.get(c.tipo)!
      if (c.moneda === 'USD') {
        e.usd += saldoCierre
        e.aportaUsd += aporte
      } else {
        e.ars += saldoCierre
        e.aportaArs += aporte
      }
    }
    return map
  }, [cuentas, saldosByCuenta])

  // PN parcial: suma de todas las cuentas con su signo
  const totalArsAporte = Array.from(totalesPorTipo.values()).reduce((s, v) => s + v.aportaArs, 0)
  const totalUsdAporte = Array.from(totalesPorTipo.values()).reduce((s, v) => s + v.aportaUsd, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-orange-500" />
            Cuentas patrimoniales
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Plan de cuentas para inversión, provisiones, impuestos y más — saldos arrastran mes a mes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select options={getMonthOptions(24)} value={mes} onChange={(e) => setMes(e.target.value)} className="w-44" />
          <Button
            variant="secondary"
            disabled={isPending}
            onClick={() => {
              if (!confirm('¿Arrastrar saldos del mes anterior? Solo se crearán saldos para cuentas que no los tengan en este mes.')) return
              startTransition(() => arrastrarSaldosPatrim(mes).catch((e) => alert(e.message)))
            }}
            title="Precarga los saldos de inicio del mes anterior"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <RotateCw className="w-3.5 h-3.5" />
            Arrastrar saldos
          </Button>
          <Button onClick={() => { setEditCuenta(undefined); setModal(true) }} title="Crear nueva cuenta patrimonial">
            <Plus className="w-4 h-4" />
            Nueva cuenta
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-white border border-orange-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-600 mb-1">Aporte neto al PN — ARS</p>
          <p className={cn('text-xl font-bold', totalArsAporte >= 0 ? 'text-orange-500' : 'text-amber-700')}>
            {totalArsAporte >= 0 ? '+' : ''}{formatCurrency(totalArsAporte)}
          </p>
        </div>
        <div className="bg-white border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-600 mb-1">Aporte neto al PN — USD</p>
          <p className={cn('text-xl font-bold', totalUsdAporte >= 0 ? 'text-green-700' : 'text-amber-700')}>
            {totalUsdAporte >= 0 ? '+' : ''}{formatCurrency(totalUsdAporte, 'USD')}
          </p>
        </div>
      </div>

      {/* Secciones por tipo */}
      {TIPOS.map((tipoCfg) => {
        const cs = cuentas.filter((c) => c.tipo === tipoCfg.v && c.activo)
        const csInactivas = cuentas.filter((c) => c.tipo === tipoCfg.v && !c.activo)
        if (cs.length === 0 && csInactivas.length === 0) return null
        const Icon = tipoCfg.icon
        const total = totalesPorTipo.get(tipoCfg.v) ?? { ars: 0, usd: 0, aportaArs: 0, aportaUsd: 0 }
        const isOpen = openTipos[tipoCfg.v] ?? true

        return (
          <div key={tipoCfg.v} className={cn('bg-white border rounded-xl overflow-x-auto', COLORES[tipoCfg.color])}>
            <button
              type="button"
              onClick={() => setOpenTipos((o) => ({ ...o, [tipoCfg.v]: !isOpen }))}
              className="w-full px-4 py-3 border-b border-[#e8e4dc] flex items-center justify-between hover:bg-[#f5f0e6]/30 transition-colors"
            >
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {tipoCfg.label}
                <Badge variant="default" className="ml-1">{cs.length}</Badge>
              </h2>
              <div className="flex items-center gap-3 text-xs">
                {total.aportaArs !== 0 && (
                  <span className="font-mono">
                    Neto al PN: <span className={total.aportaArs >= 0 ? 'text-orange-500' : 'text-amber-700'}>
                      {total.aportaArs >= 0 ? '+' : ''}{formatCurrency(total.aportaArs)}
                    </span>
                  </span>
                )}
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {isOpen && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e8e4dc]">
                    <th className="text-left px-4 py-2 text-[10px] font-medium text-slate-600 uppercase">Cuenta</th>
                    <th className="text-right px-3 py-2 text-[10px] font-medium text-slate-600 uppercase">Saldo inicio</th>
                    <th className="text-right px-3 py-2 text-[10px] font-medium text-slate-600 uppercase">Movimiento</th>
                    <th className="text-right px-3 py-2 text-[10px] font-medium text-slate-600 uppercase">Saldo cierre</th>
                    <th className="text-right px-3 py-2 text-[10px] font-medium text-slate-600 uppercase">Aporte PN</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...cs, ...csInactivas].map((c) => (
                    <SaldoRow
                      key={c.id}
                      cuenta={c}
                      saldo={saldosByCuenta.get(c.id)}
                      mes={mes}
                      onEdit={() => { setEditCuenta(c); setModal(true) }}
                      onToggle={() => startTransition(() => toggleCuentaPatrimActiva(c.id, !c.activo).catch((e) => alert(e.message)))}
                      onDelete={() => {
                        if (!confirm('¿Eliminar la cuenta? Se borrarán todos sus saldos históricos.')) return
                        startTransition(() => deleteCuentaPatrim(c.id).catch((e) => alert(e.message)))
                      }}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}

      {cuentas.length === 0 && (
        <div className="bg-white border border-[#e8e4dc] rounded-xl p-12 text-center">
          <Briefcase className="w-8 h-8 mx-auto mb-2 text-slate-600" />
          <p className="text-slate-500 mb-3">Sin cuentas patrimoniales cargadas</p>
          <Button onClick={() => { setEditCuenta(undefined); setModal(true) }}>
            <Plus className="w-3.5 h-3.5" />
            Crear primera cuenta
          </Button>
        </div>
      )}

      <Modal
        open={modal}
        onOpenChange={setModal}
        title={editCuenta ? 'Editar cuenta patrimonial' : 'Nueva cuenta patrimonial'}
        className="max-w-xl"
      >
        <CuentaForm cuenta={editCuenta} onClose={() => setModal(false)} />
      </Modal>
    </div>
  )
}
