'use client'

import { useState, useMemo, useTransition, useRef } from 'react'
import {
  simularMovimiento, formatMoneda,
  type TipoMovimiento, type ResultadoSimulacion,
} from '@/lib/inversiones-calc'
import { aplicarMovimientoSimulado } from '@/app/actions/inversiones'
import type { Instrumento, TramoTasa, PeriodoInstrumento } from '@/types/database'
import { Button } from '@/components/ui/button'
import { formatMonth, formatDate } from '@/lib/utils'
import {
  Calculator, ArrowDown, ArrowUp, Lock, ChevronDown, ChevronUp,
  AlertTriangle, RotateCw, Play, Printer, CheckCircle2, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  instrumento: Instrumento
  tramos: TramoTasa[]
  periodoMesActual: PeriodoInstrumento | undefined
  inversorNombre: string
}

const TIPOS: { v: TipoMovimiento; label: string; icon: React.ElementType; color: string }[] = [
  { v: 'RETIRO_PARCIAL', label: 'Retiro parcial', icon: ArrowDown, color: 'text-amber-700' },
  { v: 'RETIRO_TOTAL', label: 'Retiro total', icon: Lock, color: 'text-red-700' },
  { v: 'INGRESO', label: 'Ingreso', icon: ArrowUp, color: 'text-green-700' },
]

function primerDiaMes(mes: string): string {
  return `${mes}-01`
}

function hoyEnMes(mes: string): string {
  const hoy = new Date().toISOString().split('T')[0]
  if (hoy.startsWith(mes)) return hoy
  return primerDiaMes(mes)
}

export function SimuladorMovimiento({ instrumento, tramos, periodoMesActual, inversorNombre }: Props) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<TipoMovimiento>('RETIRO_PARCIAL')

  const mesActual = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const [fecha, setFecha] = useState(hoyEnMes(mesActual))
  const [monto, setMonto] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [exitoMsg, setExitoMsg] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Si no hay período del mes actual o está cerrado, no se puede simular
  if (!periodoMesActual || periodoMesActual.cerrado || instrumento.estado !== 'activo') {
    return null
  }

  const saldoInicioMes = Number(periodoMesActual.saldo_inicio)

  const tramosArr = tramos
    .filter((t) => t.instrumento_id === instrumento.id)
    .map((t) => ({ fecha_desde: t.fecha_desde, tasa_mensual: Number(t.tasa_mensual) }))

  const result: ResultadoSimulacion = useMemo(() => {
    return simularMovimiento({
      saldoInicioMes,
      capitalizable: instrumento.capitalizable,
      fechaInicio: instrumento.fecha_inicio,
      fechaFin: instrumento.fecha_fin,
      mes: mesActual,
      tramosTasa: tramosArr.length > 0 ? tramosArr : [{ fecha_desde: instrumento.fecha_inicio, tasa_mensual: Number(instrumento.tasa_mensual) }],
      tipoMovimiento: tipo,
      fechaMovimiento: fecha,
      monto: tipo === 'RETIRO_TOTAL' ? saldoInicioMes : monto,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, fecha, monto, saldoInicioMes, instrumento.id, tramos.length])

  const tieneError = !!result.error
  const tasaVigente = tramosArr.length > 0
    ? Number(tramosArr[tramosArr.length - 1].tasa_mensual)
    : Number(instrumento.tasa_mensual)

  function limpiar() {
    setTipo('RETIRO_PARCIAL')
    setFecha(hoyEnMes(mesActual))
    setMonto(0)
    setExitoMsg(null)
  }

  function ejecutar() {
    if (tieneError) return
    setExitoMsg(null)
    startTransition(async () => {
      try {
        await aplicarMovimientoSimulado({
          instrumentoId: instrumento.id,
          mes: mesActual,
          tipoMovimiento: tipo,
          fechaMovimiento: fecha,
          monto: tipo === 'RETIRO_TOTAL' ? saldoInicioMes : monto,
        })
        setExitoMsg('Movimiento aplicado correctamente. Los períodos se recalcularon.')
        // No limpiar para que vea lo que ejecutó
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  function imprimir() {
    if (!ref.current) return
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html><head><title>Pre-liquidación ${inversorNombre}</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 30px; color: #000; background: #fff; max-width: 720px; margin: 0 auto; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        h2 { font-size: 13px; color: #555; font-weight: normal; margin: 0 0 16px; }
        .box { border: 2px solid #000; padding: 20px; margin-bottom: 16px; }
        .row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #ccc; }
        .row:last-child { border: none; }
        .tramo { background: #f5f5f5; padding: 10px; margin: 8px 0; border-left: 3px solid #6366f1; font-size: 13px; }
        .total { background: #000; color: #fff; padding: 10px 14px; display: flex; justify-content: space-between; margin-top: 12px; font-weight: bold; }
        .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 11px; color: #777; font-style: italic; }
        .label { color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
      </style></head><body>${ref.current.innerHTML}<script>setTimeout(()=>window.print(),250)</script></body></html>
    `)
    win.document.close()
  }

  const moneda = instrumento.moneda
  const tipoDescripcion = tipo === 'RETIRO_PARCIAL' ? 'Retiro parcial'
    : tipo === 'RETIRO_TOTAL' ? 'Cierre anticipado'
    : 'Ingreso'

  return (
    <div className="bg-white border border-orange-500/20 rounded-xl overflow-x-auto">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 border-b border-[#e8e4dc] flex items-center justify-between hover:bg-[#f5f0e6]/40 transition-colors"
      >
        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-orange-500" />
          Simular movimiento — {formatMonth(mesActual)}
        </h2>
        {open ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
      </button>

      {open && (
        <div className="p-5 space-y-4">
          {/* Tipo */}
          <div className="grid grid-cols-3 gap-2">
            {TIPOS.map((t) => {
              const Icon = t.icon
              const active = tipo === t.v
              return (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => { setTipo(t.v); setExitoMsg(null) }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                    active
                      ? 'bg-orange-500/20 border-orange-500/50 text-orange-600'
                      : 'bg-[#f5f0e6] border-[#d6d0c4] text-slate-600 hover:text-slate-800'
                  )}
                >
                  <Icon className={cn('w-3.5 h-3.5', active ? '' : t.color)} />
                  {t.label}
                </button>
              )
            })}
          </div>

          {/* Fecha + monto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">Fecha del movimiento</label>
              <input
                type="date"
                min={primerDiaMes(mesActual)}
                max={new Date(parseInt(mesActual.split('-')[0]), parseInt(mesActual.split('-')[1]), 0).toISOString().split('T')[0]}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-3 py-2 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">
                Monto {tipo === 'RETIRO_TOTAL' && <span className="text-slate-500">(automático)</span>}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={tipo === 'RETIRO_TOTAL' ? saldoInicioMes : (monto || '')}
                onChange={(e) => setMonto(Number(e.target.value))}
                disabled={tipo === 'RETIRO_TOTAL'}
                className="w-full px-3 py-2 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm disabled:opacity-60"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Resultado */}
          <div ref={ref} className="bg-[#f5f0e6]/40 border border-[#d6d0c4]/40 rounded-xl p-4 space-y-3 text-sm">
            <div className="border-b border-[#d6d0c4]/60 pb-2 mb-1">
              <p className="text-xs text-slate-600">SIMULACIÓN — {tipoDescripcion}  ·  {formatDate(fecha)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{inversorNombre} · {instrumento.codigo ?? instrumento.id.substring(0, 8)}</p>
            </div>

            <div className="space-y-1">
              <div className="row flex justify-between">
                <span className="text-slate-600">Capital inicio del mes</span>
                <span className="font-mono text-slate-900">{formatMoneda(saldoInicioMes, moneda)}</span>
              </div>
              <div className="row flex justify-between">
                <span className="text-slate-600">Tasa vigente</span>
                <span className="font-mono text-slate-800">{(tasaVigente * 100).toFixed(2)}%</span>
              </div>
            </div>

            {tieneError ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {result.error}
              </div>
            ) : (
              <>
                {/* Tramos */}
                {result.tramos.map((seg, i) => (
                  <div key={i} className="bg-white/40 rounded-lg p-3 border-l-2 border-orange-500/40">
                    <div className="flex items-center justify-between text-xs text-orange-600 mb-1.5">
                      <span>── Tramo {i + 1}: {formatDate(seg.desde)} → {formatDate(seg.hasta)}</span>
                      <span className="text-slate-500">({seg.dias} de {result.diasMes} días · {(seg.tasa * 100).toFixed(2)}%)</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Base de cálculo</span>
                      <span className="font-mono text-slate-800">{formatMoneda(
                        // base = interes / (tasa * dias / dim) (reverse calc); alternativamente lo guardamos
                        seg.tasa > 0 && seg.dias > 0
                          ? seg.interes / (seg.tasa * (seg.dias / result.diasMes))
                          : 0,
                        moneda,
                      )}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Interés</span>
                      <span className="font-mono text-amber-700 font-semibold">{formatMoneda(seg.interes, moneda)}</span>
                    </div>
                  </div>
                ))}

                {/* Resultado final */}
                <div className="border-t border-[#d6d0c4]/60 pt-3 space-y-1.5">
                  {result.esRetiroTotal ? (
                    <>
                      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">── Total a acreditar al inversor ──</p>
                      <div className="row flex justify-between">
                        <span className="text-slate-700">Capital</span>
                        <span className="font-mono text-slate-900">{formatMoneda(result.capitalAlMomento ?? 0, moneda)}</span>
                      </div>
                      <div className="row flex justify-between">
                        <span className="text-slate-700">Intereses devengados</span>
                        <span className="font-mono text-amber-700">{formatMoneda(result.totalIntereses, moneda)}</span>
                      </div>
                      <div className="total bg-[#faf6ee] border border-orange-500/40 rounded-lg px-3 py-2 flex justify-between text-base font-bold mt-2">
                        <span className="text-slate-900">TOTAL A PAGAR</span>
                        <span className="font-mono text-orange-500">{formatMoneda(result.totalAPagar ?? 0, moneda)}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        El instrumento quedará cerrado a partir del {formatDate(fecha)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">── Resultado del mes ──</p>
                      <div className="row flex justify-between">
                        <span className="text-slate-700">Total intereses devengados</span>
                        <span className="font-mono text-amber-700">{formatMoneda(result.totalIntereses, moneda)}</span>
                      </div>
                      <div className="row flex justify-between">
                        <span className="text-slate-700">{tipo === 'INGRESO' ? 'Ingreso' : 'Retiro'}</span>
                        <span className={cn(
                          'font-mono',
                          tipo === 'INGRESO' ? 'text-green-700' : 'text-red-700'
                        )}>
                          {tipo === 'INGRESO' ? '+' : '-'}{formatMoneda(monto, moneda)}
                        </span>
                      </div>
                      <div className="row flex justify-between text-base font-semibold pt-1">
                        <span className="text-slate-900">Saldo al cierre del mes</span>
                        <span className="font-mono text-slate-900 flex items-center gap-1.5">
                          {formatMoneda(result.saldoCierre, moneda)}
                          <CheckCircle2 className="w-4 h-4 text-green-700" />
                        </span>
                      </div>
                      <div className="row flex justify-between text-xs pt-2 mt-2 border-t border-[#d6d0c4]/40">
                        <span className="text-slate-600">Gasto financiero del mes</span>
                        <span className="font-mono text-amber-700">{formatMoneda(result.totalIntereses, moneda)}</span>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Footer del comprobante */}
            <p className="footer text-[10px] text-slate-500 italic pt-2 border-t border-[#d6d0c4]/40">
              Este documento es una simulación. Los valores son estimados al {new Date().toLocaleDateString('es-AR')} {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}.
            </p>
          </div>

          {exitoMsg && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {exitoMsg}
            </div>
          )}

          {/* Botones */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={limpiar} title="Limpiar simulación">
              <RotateCw className="w-3.5 h-3.5" />
              Limpiar
            </Button>
            <Button variant="ghost" size="sm" onClick={imprimir} disabled={tieneError} title="Generar comprobante imprimible">
              <Printer className="w-3.5 h-3.5" />
              Compartir liquidación
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              onClick={ejecutar}
              disabled={tieneError || isPending || (!result.totalIntereses && !result.movimientoSignado) || !!exitoMsg}
              title="Aplicar este movimiento al período"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <Play className="w-3.5 h-3.5" />
              Ejecutar este movimiento →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
