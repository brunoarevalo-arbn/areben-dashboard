'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  actualizarMovimientoPeriodo,
  cerrarPeriodoYCrearGasto,
  reabrirPeriodos,
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
  FileText, XCircle,
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
    return <span className="font-mono text-slate-600">{Number(p.movimiento) !== 0 ? formatMoneda(Number(p.movimiento), moneda) : '—'}</span>
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-end gap-1.5 group">
        <span className="font-mono text-slate-700">
          {Number(p.movimiento) !== 0 ? formatMoneda(Number(p.movimiento), moneda) : '—'}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#e8e0d0] text-slate-500 hover:text-slate-700 transition-all"
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
        className="w-28 px-2 py-1 bg-slate-700 border border-[#c8c0b0] rounded text-slate-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
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
        className="p-1 rounded bg-slate-700 text-slate-600"
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

  function setMes(nuevo: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', nuevo)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PiggyBank className="w-6 h-6 text-orange-500" />
            Cierre mensual de inversiones
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
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
            className="p-1 rounded hover:bg-black/5 text-slate-500"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Alerta meses anteriores sin cerrar */}
      {mesesAbiertosAnteriores.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-amber-800 font-medium">Hay períodos anteriores sin cerrar</p>
            <p className="text-amber-200/70 text-xs mt-1">
              Meses pendientes: {mesesAbiertosAnteriores.map((m) => formatMonth(m)).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* KPIs gasto financiero */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-white border border-amber-500/20 rounded-xl p-5">
          <p className="text-xs text-slate-600 mb-1">Gasto financiero USD</p>
          <p className="text-2xl font-bold text-amber-700">{formatMoneda(totalUsd, 'USD')}</p>
        </div>
        <div className="bg-white border border-amber-500/20 rounded-xl p-5">
          <p className="text-xs text-slate-600 mb-1">Gasto financiero ARS</p>
          <p className="text-2xl font-bold text-amber-700">{formatMoneda(totalArs, 'ARS')}</p>
        </div>
      </div>

      {/* Tabla detallada */}
      <div className="bg-white border border-[#e8e4dc] rounded-xl overflow-x-auto">
        <div className="px-4 py-3 border-b border-[#e8e4dc]">
          <h2 className="text-sm font-semibold text-slate-900">Detalle del mes — {formatMonth(mes)}</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e8e4dc]">
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600 uppercase">Inversor / Cód.</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600 uppercase">Moneda</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600 uppercase">Tipo</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 uppercase">Saldo inicio</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 uppercase">Interés</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 uppercase">Movimiento</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 uppercase">Saldo cierre</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600 uppercase">Estado</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 uppercase">Acción</th>
            </tr>
          </thead>
          <tbody>
            {periodos.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                  No hay instrumentos activos para {formatMonth(mes)}
                </td>
              </tr>
            ) : (
              periodos.map((p) => {
                const i = p.instrumento
                if (!i) return null
                return (
                  <tr key={p.id} className={cn(
                    'border-b border-[#e8e4dc]/60',
                    p.cerrado && 'bg-green-500/5'
                  )}>
                    <td className="px-4 py-2">
                      <p className="text-slate-900 font-medium">{i.inversor?.nombre ?? '—'}</p>
                      <p className="text-xs text-slate-500 font-mono">{i.codigo ?? i.id.substring(0, 8)}</p>
                    </td>
                    <td className="px-4 py-2"><Badge variant={i.moneda === 'USD' ? 'success' : 'info'}>{i.moneda}</Badge></td>
                    <td className="px-4 py-2">
                      <Badge variant={i.capitalizable ? 'purple' : 'default'}>
                        {i.capitalizable ? 'Capitalizable' : 'No cap.'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-700">{formatMoneda(Number(p.saldo_inicio), i.moneda)}</td>
                    <td className="px-4 py-2 text-right font-mono text-amber-700 font-medium">{formatMoneda(Number(p.interes_devengado), i.moneda)}</td>
                    <td className="px-4 py-2 text-right">
                      <MovimientoEditor p={p} onSaved={() => router.refresh()} />
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-900 font-bold">{formatMoneda(Number(p.saldo_cierre), i.moneda)}</td>
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
                        <a
                          href={`/api/reportes/periodo/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-[#d6d0c4] text-xs text-slate-700 hover:bg-[#e8e0d0] hover:text-slate-900 transition-colors"
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
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          {periodos.length > 0 && (
            <tfoot>
              <tr className="border-t border-[#d6d0c4] bg-[#f5f0e6]/50">
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-slate-700">TOTAL INTERESES (gasto financiero)</td>
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
