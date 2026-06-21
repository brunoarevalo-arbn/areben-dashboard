'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  actualizarMovimientoPeriodo,
  cerrarPeriodoYCrearGasto,
  reabrirPeriodos,
  renovarInstrumento,
  type CerrarPeriodoResult,
} from '@/app/actions/inversiones'
import type { PeriodoInstrumento, Instrumento, Inversor } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatMoneda } from '@/lib/inversiones-calc'
import { formatMonth, getMonthOptions, formatCurrency } from '@/lib/utils'
import {
  Lock, Unlock, AlertTriangle, Loader2, CheckCircle2, PiggyBank, Pencil, Save, X,
  FileText, XCircle, ArrowRight, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type PeriodoConRel = PeriodoInstrumento & {
  instrumento?: Instrumento & { inversor?: Inversor }
}

interface Props {
  mes: string
  periodos: PeriodoConRel[]
  instrumentos: Instrumento[]
  inversores: Inversor[]
  mesesAbiertosAnteriores: string[]
}

function MovimientoEditor({ p, onSaved }: { p: PeriodoConRel; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(Number(p.movimiento ?? 0))
  const [isPending, startTransition] = useTransition()
  const moneda = p.instrumento?.moneda ?? 'ARS'

  if (p.cerrado) {
    return <span className="font-mono text-fg-muted">{Number(p.movimiento) !== 0 ? formatMoneda(Number(p.movimiento), moneda) : '—'}</span>
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-end gap-1.5 group">
        <span className="font-mono text-fg-muted">
          {Number(p.movimiento) !== 0 ? formatMoneda(Number(p.movimiento), moneda) : '—'}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-2 text-fg-soft hover:text-fg-muted transition-all"
          title="Editar movimiento"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <input
        type="number"
        step="0.01"
        value={val}
        onChange={(e) => setVal(Number(e.target.value))}
        autoFocus
        className="w-28 px-2 py-1 bg-surface border border-border-strong rounded text-fg font-mono text-xs text-right focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-primary/25"
      />
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await actualizarMovimientoPeriodo(p.id, val)
            setEditing(false)
            onSaved()
          })
        }}
        className="p-1 rounded bg-green-600/20 text-green-700 hover:bg-green-600/30"
        title="Guardar"
      >
        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
      </button>
      <button
        type="button"
        onClick={() => { setVal(Number(p.movimiento ?? 0)); setEditing(false) }}
        className="p-1 rounded bg-[#efeae0] text-fg-soft hover:bg-[#e3ddd0]"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

type ToastResult =
  | { kind: 'success'; message: string; detail?: string }
  | { kind: 'error'; message: string }

function CerrarPeriodoButton({
  p,
  onDone,
}: {
  p: PeriodoConRel
  onDone: (r: ToastResult) => void
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const moneda = p.instrumento?.moneda ?? 'ARS'
  const interes = Number(p.interes_devengado)
  const nombre = p.instrumento?.inversor?.nombre ?? 'instrumento'

  const handleClick = () => {
    const confirmMsg = moneda === 'USD'
      ? `¿Cerrar período de ${nombre}?\n\nInterés: ${formatMoneda(interes, 'USD')}\nSe convertirá a ARS al TC del mes y se creará un gasto financiero PENDIENTE.`
      : `¿Cerrar período de ${nombre}?\n\nInterés: ${formatMoneda(interes, 'ARS')}\nSe creará un gasto financiero PENDIENTE.`
    if (!confirm(confirmMsg)) return

    startTransition(async () => {
      const result: CerrarPeriodoResult = await cerrarPeriodoYCrearGasto(p.id)
      if (result.ok) {
        const detail = result.monedaOrigen === 'USD' && result.tipoCambio
          ? `${formatMoneda(result.montoOrigen ?? 0, 'USD')} × TC ${result.tipoCambio} = ${formatCurrency(result.montoArs ?? 0, 'ARS')}`
          : `${formatCurrency(result.montoArs ?? 0, 'ARS')}`
        onDone({
          kind: 'success',
          message: `Período cerrado y gasto creado para ${nombre}`,
          detail: `Monto: ${detail} · Ref: #${result.gastoId?.substring(0, 8)}`,
        })
        router.refresh()
      } else {
        onDone({ kind: 'error', message: result.error ?? 'Error desconocido' })
      }
    })
  }

  return (
    <Button
      variant="success"
      disabled={isPending}
      onClick={handleClick}
      title="Cerrar período y crear gasto financiero automáticamente"
      className="text-xs"
    >
      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
      Cerrar
    </Button>
  )
}

function RenovarInstrumentoButton({
  instrumento,
  onDone,
}: {
  instrumento: Instrumento & { inversor?: Inversor }
  onDone: (t: ToastResult) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    const nombre = instrumento.codigo ?? instrumento.id.substring(0, 8)
    const inversor = instrumento.inversor?.nombre ?? ''
    if (!confirm(
      `¿Renovar el instrumento "${nombre}" (${inversor})?\n\n` +
      `Calcula el saldo final del ciclo actual (capital + intereses devengados) y abre un nuevo ciclo de ${instrumento.plazo_dias} días con la misma tasa.\n\n` +
      `Requiere que TODOS los períodos del instrumento estén cerrados (no solo el del mes actual).`,
    )) return
    startTransition(async () => {
      const result = await renovarInstrumento(instrumento.id)
      if (!result.ok) {
        onDone({ kind: 'error', message: result.error })
        return
      }
      onDone({
        kind: 'success',
        message: `Instrumento ${nombre} renovado`,
        detail: `Capital $${result.capitalAnterior.toFixed(2)} → $${result.capitalNuevo.toFixed(2)} · Período ${result.fechaInicio} → ${result.fechaFin}`,
      })
      router.refresh()
    })
  }

  return (
    <Button
      variant="secondary"
      disabled={isPending}
      onClick={handleClick}
      title="Renovar instrumento (avanzar al siguiente ciclo con el saldo final)"
      className="text-xs"
    >
      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
      Renovar
    </Button>
  )
}

export function CierreMensualClient({ mes, periodos, mesesAbiertosAnteriores }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<ToastResult | null>(null)

  const totalUsd = periodos
    .filter((p) => p.instrumento?.moneda === 'USD')
    .reduce((s, p) => s + Number(p.interes_devengado), 0)
  const totalArs = periodos
    .filter((p) => p.instrumento?.moneda === 'ARS')
    .reduce((s, p) => s + Number(p.interes_devengado), 0)

  const todosCerrados = periodos.length > 0 && periodos.every((p) => p.cerrado)
  const abiertos = periodos.filter((p) => !p.cerrado).length
  const cerrados = periodos.length - abiertos
  const pctCerrado = periodos.length ? Math.round((cerrados / periodos.length) * 100) : 0

  function setMes(nuevo: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', nuevo)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <PiggyBank className="w-6 h-6 text-primary" />
            Cierre mensual de inversiones
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">
            {periodos.length} instrumento(s) activos en {formatMonth(mes)} · {abiertos} sin cerrar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select options={getMonthOptions(24)} value={mes} onChange={(e) => setMes(e.target.value)} className="w-44" />
          {todosCerrados && (
            <Button
              variant="warning"
              disabled={isPending}
              onClick={() => {
                if (!confirm(`¿Reabrir los períodos de ${formatMonth(mes)}?\n\nNota: los gastos auto-generados NO se borran automáticamente. Si los regenerás, vas a tener duplicados — borralos manualmente desde /finanzas/gastos primero si hace falta.`)) return
                startTransition(() => reabrirPeriodos(mes))
              }}
              title="Reabrir mes cerrado"
            >
              <Unlock className="w-4 h-4" />
              Reabrir
            </Button>
          )}
        </div>
      </div>

      {/* Banner de resultado de la última acción */}
      {toast && (
        <div className={cn(
          'rounded-xl border p-4 flex items-start gap-3',
          toast.kind === 'success'
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-red-500/10 border-red-500/30',
        )}>
          {toast.kind === 'success'
            ? <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0 mt-0.5" />
            : <XCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />}
          <div className="text-sm flex-1">
            <p className={toast.kind === 'success' ? 'text-green-800 font-medium' : 'text-red-800 font-medium'}>
              {toast.message}
            </p>
            {'detail' in toast && toast.detail && (
              <p className="text-green-700/80 text-xs mt-1 font-mono">{toast.detail}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 rounded hover:bg-black/5 text-fg-soft"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Alerta meses anteriores sin cerrar */}
      {mesesAbiertosAnteriores.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-amber-900 font-semibold text-sm">
              {mesesAbiertosAnteriores.length} {mesesAbiertosAnteriores.length === 1 ? 'mes anterior' : 'meses anteriores'} sin cerrar
            </p>
            <p className="text-amber-800/80 text-xs mt-0.5">
              El más antiguo es <span className="font-semibold text-amber-900">{formatMonth(mesesAbiertosAnteriores[0])}</span>. Conviene cerrarlos en orden para no acumular gasto financiero sin imputar.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {mesesAbiertosAnteriores.map((m, idx) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMes(m)}
                  title={`Ir a ${formatMonth(m)}`}
                  className={cn(
                    'text-xs font-medium rounded-md px-2.5 py-1 border transition-colors',
                    idx === 0
                      ? 'bg-amber-700 text-white border-amber-700 hover:bg-amber-800'
                      : 'bg-surface text-amber-900 border-amber-200 hover:bg-amber-100',
                  )}
                >
                  {formatMonth(m)}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMes(mesesAbiertosAnteriores[0])}
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-700 text-white text-sm font-semibold hover:bg-amber-800 transition-colors"
          >
            Ir a {formatMonth(mesesAbiertosAnteriores[0])}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPIs gasto financiero + progreso de cierre */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-fg-muted mb-1">Gasto financiero USD</p>
          <p className="text-2xl font-bold text-amber-700">{formatMoneda(totalUsd, 'USD')}</p>
          <p className="text-xs text-fg-soft mt-1">Interés devengado del mes</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-fg-muted mb-1">Gasto financiero ARS</p>
          <p className="text-2xl font-bold text-amber-700">{formatMoneda(totalArs, 'ARS')}</p>
          <p className="text-xs text-fg-soft mt-1">Interés devengado del mes</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5 flex flex-col justify-center gap-2.5">
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold text-fg">
              {cerrados}<span className="text-sm font-medium text-fg-soft"> / {periodos.length} cerrados</span>
            </p>
            <p className="text-sm font-semibold text-fg-soft">{pctCerrado}%</p>
          </div>
          <div className="h-2 rounded-full bg-[#efe9dd] overflow-hidden">
            <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${pctCerrado}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-green-700 font-medium inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />{cerrados} cerrados</span>
            <span className="text-amber-700 font-medium inline-flex items-center gap-1.5"><Unlock className="w-3.5 h-3.5" />{abiertos} pendientes</span>
          </div>
        </div>
      </div>

      {/* Tabla detallada */}
      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-fg">Detalle del mes — {formatMonth(mes)}</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Inversor / Cód.</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Moneda</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Tipo</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Saldo inicio</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Interés</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Movimiento</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Saldo cierre</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Estado</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Acción</th>
            </tr>
          </thead>
          <tbody>
            {periodos.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-fg-soft">
                  No hay instrumentos activos para {formatMonth(mes)}
                </td>
              </tr>
            ) : (
              periodos.map((p) => {
                const i = p.instrumento
                if (!i) return null
                return (
                  <tr key={p.id} className={cn(
                    'border-b border-border/60',
                    p.cerrado && 'bg-green-500/5'
                  )}>
                    <td className="px-4 py-2">
                      <p className="text-fg font-medium">{i.inversor?.nombre ?? '—'}</p>
                      <p className="text-xs text-fg-soft font-mono">{i.codigo ?? i.id.substring(0, 8)}</p>
                    </td>
                    <td className="px-4 py-2"><Badge variant={i.moneda === 'USD' ? 'success' : 'info'}>{i.moneda}</Badge></td>
                    <td className="px-4 py-2">
                      <Badge variant={i.capitalizable ? 'purple' : 'default'}>
                        {i.capitalizable ? 'Capitalizable' : 'No cap.'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-fg-muted">{formatMoneda(Number(p.saldo_inicio), i.moneda)}</td>
                    <td className="px-4 py-2 text-right font-mono text-amber-700 font-medium">{formatMoneda(Number(p.interes_devengado), i.moneda)}</td>
                    <td className="px-4 py-2 text-right">
                      <MovimientoEditor p={p} onSaved={() => router.refresh()} />
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-fg font-bold">{formatMoneda(Number(p.saldo_cierre), i.moneda)}</td>
                    <td className="px-4 py-2">
                      {p.cerrado
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="w-3 h-3" />Cerrado</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-amber-700"><Unlock className="w-3 h-3" />Abierto</span>
                      }
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2">
                        {!p.cerrado && (
                          <CerrarPeriodoButton p={p} onDone={setToast} />
                        )}
                        {p.cerrado && i.fecha_fin && i.plazo_dias && (
                          <RenovarInstrumentoButton instrumento={i} onDone={setToast} />
                        )}
                        <a
                          href={`/api/reportes/periodo/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-border-strong text-xs text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
                          title="Reporte PDF interno (uso contable)"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          PDF
                        </a>
                        <a
                          href={`/api/reportes/periodo/${p.id}/inversor`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-orange-500/40 bg-orange-500/10 text-xs text-orange-700 hover:bg-orange-500/20 transition-colors"
                          title="Comprobante formal para enviar al inversor"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          PDF Inversor
                        </a>
                        {i.plazo_dias ? (
                          <a
                            href={`/api/reportes/instrumento/${i.id}/proyeccion`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-primary/40 bg-primary/10 text-xs text-primary hover:bg-primary/20 transition-colors"
                            title={`Proyección del rendimiento del instrumento a ${i.plazo_dias} días`}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            PDF Proyección
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          {periodos.length > 0 && (
            <tfoot>
              <tr className="border-t border-border-strong bg-surface-2/50">
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-fg-muted">TOTAL INTERESES (gasto financiero)</td>
                <td colSpan={5} className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {totalUsd > 0 && <span className="font-mono font-bold text-amber-700">{formatMoneda(totalUsd, 'USD')}</span>}
                    {totalArs > 0 && <span className="font-mono font-bold text-amber-700">{formatMoneda(totalArs, 'ARS')}</span>}
                  </div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
