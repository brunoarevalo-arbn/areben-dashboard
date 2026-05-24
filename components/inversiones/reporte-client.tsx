'use client'

import { useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Inversor, Instrumento, PeriodoInstrumento, TramoTasa } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatMoneda, segmentosDeMes } from '@/lib/inversiones-calc'
import { formatMonth, getMonthOptions, formatDate } from '@/lib/utils'
import { Printer, FileText, User, Lock, Unlock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  mes: string
  inversores: Inversor[]
  inversorSelected: Inversor | null
  instrumentos: Instrumento[]
  periodos: PeriodoInstrumento[]
  tramos: TramoTasa[]
}

export function ReporteClient({ mes, inversores, inversorSelected, instrumentos, periodos, tramos }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ref = useRef<HTMLDivElement>(null)

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`?${params.toString()}`)
  }

  function imprimir() {
    if (!ref.current) return
    const win = window.open('', '_blank', 'width=900,height=1000')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html><head><title>Reporte ${inversorSelected?.nombre ?? ''} - ${mes}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 30px; color: #000; background: #fff; }
        .reporte { max-width: 720px; margin: 0 auto; padding: 24px; border: 2px solid #000; }
        h1 { font-size: 22px; margin: 0 0 8px; }
        h2 { font-size: 14px; margin: 0 0 18px; color: #555; font-weight: normal; }
        .header { border-bottom: 2px solid #000; padding-bottom: 14px; margin-bottom: 16px; }
        .info { background: #f5f5f5; padding: 10px 14px; border-radius: 6px; margin-bottom: 18px; font-size: 13px; }
        .info .row { display: flex; justify-content: space-between; padding: 3px 0; }
        .info .row .lbl { color: #555; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 14px 0; }
        th { text-align: left; padding: 8px 6px; background: #000; color: #fff; font-size: 10px; text-transform: uppercase; }
        td { padding: 8px 6px; border-bottom: 1px solid #ddd; }
        .right { text-align: right; font-family: monospace; }
        .total { background: #000; color: #fff; padding: 10px 14px; display: flex; justify-content: space-between; margin-top: 14px; font-weight: bold; }
        .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #ccc; font-size: 11px; color: #666; }
      </style></head>
      <body>${ref.current.innerHTML}<script>setTimeout(() => window.print(), 250)</script></body></html>
    `)
    win.document.close()
  }

  // Agrupar totales por moneda
  const totalUsd = periodos.filter((p) => instrumentos.find((i) => i.id === p.instrumento_id)?.moneda === 'USD')
    .reduce((s, p) => s + Number(p.saldo_cierre), 0)
  const totalArs = periodos.filter((p) => instrumentos.find((i) => i.id === p.instrumento_id)?.moneda === 'ARS')
    .reduce((s, p) => s + Number(p.saldo_cierre), 0)
  const interesUsd = periodos.filter((p) => instrumentos.find((i) => i.id === p.instrumento_id)?.moneda === 'USD')
    .reduce((s, p) => s + Number(p.interes_devengado), 0)
  const interesArs = periodos.filter((p) => instrumentos.find((i) => i.id === p.instrumento_id)?.moneda === 'ARS')
    .reduce((s, p) => s + Number(p.interes_devengado), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-orange-500" />
            Reporte por inversor
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">Vista previa imprimible para enviar al inversor</p>
        </div>
      </div>

      {/* Selectores */}
      <div className="bg-white border border-[#e8e4dc] rounded-xl p-4 flex flex-wrap items-center gap-3">
        <Select
          options={[{ value: '', label: '— Seleccionar inversor —' }, ...inversores.map((i) => ({ value: i.id, label: i.nombre }))]}
          value={inversorSelected?.id ?? ''}
          onChange={(e) => setParam('inversor', e.target.value)}
          className="w-64"
        />
        <Select options={getMonthOptions(24)} value={mes} onChange={(e) => setParam('mes', e.target.value)} className="w-44" />
        {inversorSelected && periodos.length > 0 && (
          <Button onClick={imprimir} className="ml-auto" title="Imprimir / Exportar PDF">
            <Printer className="w-4 h-4" />
            Imprimir / PDF
          </Button>
        )}
      </div>

      {/* Vista previa */}
      {!inversorSelected ? (
        <div className="bg-white border border-[#e8e4dc] rounded-xl p-12 text-center">
          <User className="w-8 h-8 mx-auto mb-2 text-slate-600" />
          <p className="text-slate-500">Seleccioná un inversor para generar el reporte</p>
        </div>
      ) : periodos.length === 0 ? (
        <div className="bg-white border border-[#e8e4dc] rounded-xl p-12 text-center">
          <p className="text-slate-500">No hay períodos para {inversorSelected.nombre} en {formatMonth(mes)}</p>
        </div>
      ) : (
        <div className="bg-white text-black rounded-xl overflow-x-auto">
          <div ref={ref}>
            <div className="reporte p-8">
              <div className="header border-b-2 border-black pb-4 mb-5">
                <h1 className="text-2xl font-bold mb-1">Reporte de inversiones</h1>
                <h2 className="text-sm text-slate-600">Período: {formatMonth(mes)}</h2>
              </div>

              <div className="info bg-slate-100 rounded-lg p-3 mb-5 text-sm">
                <div className="row flex justify-between py-1">
                  <span className="lbl text-slate-600">Inversor</span>
                  <span className="font-medium">{inversorSelected.nombre}</span>
                </div>
                <div className="row flex justify-between py-1">
                  <span className="lbl text-slate-600">Tipo</span>
                  <span>{inversorSelected.tipo === 'empresa' ? 'Empresa' : 'Persona física'}</span>
                </div>
                <div className="row flex justify-between py-1">
                  <span className="lbl text-slate-600">Fecha de emisión</span>
                  <span>{new Date().toLocaleDateString('es-AR')}</span>
                </div>
              </div>

              <table className="w-full text-xs my-4">
                <thead>
                  <tr>
                    <th className="text-left p-2 bg-black text-white">Instrumento</th>
                    <th className="text-left p-2 bg-black text-white">Tipo</th>
                    <th className="text-right p-2 bg-black text-white">Capital</th>
                    <th className="text-right p-2 bg-black text-white">Tasa</th>
                    <th className="text-right p-2 bg-black text-white">Interés del mes</th>
                    <th className="text-right p-2 bg-black text-white">Saldo al cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {periodos.map((p) => {
                    const i = instrumentos.find((x) => x.id === p.instrumento_id)
                    if (!i) return null
                    const tramosInst = tramos.filter((t) => t.instrumento_id === i.id)
                    const segs = segmentosDeMes(
                      Number(p.saldo_inicio),
                      p.mes,
                      i.fecha_inicio,
                      i.fecha_fin ?? null,
                      tramosInst.map((t) => ({ fecha_desde: t.fecha_desde, tasa_mensual: Number(t.tasa_mensual) })),
                    )
                    const tasasUnicas = [...new Set(segs.map((s) => s.tasa))]
                    const huboCambio = tasasUnicas.length > 1
                    return (
                      <>
                        <tr key={p.id} className="border-b border-slate-200">
                          <td className="p-2">
                            <div className="font-medium">{i.codigo ?? i.id.substring(0, 8)}</div>
                            <div className="text-[10px] text-slate-500">{i.moneda} · inicio {formatDate(i.fecha_inicio)}</div>
                          </td>
                          <td className="p-2">
                            {i.capitalizable ? 'Capitalizable' : 'No capitalizable'}
                          </td>
                          <td className="p-2 text-right font-mono">{formatMoneda(Number(i.capital_inicial), i.moneda)}</td>
                          <td className="p-2 text-right font-mono">
                            {huboCambio ? (
                              <span style={{ color: '#b45309' }}>varias (ver detalle)</span>
                            ) : (
                              `${(Number(p.tasa_aplicada) * 100).toFixed(4)}%`
                            )}
                          </td>
                          <td className="p-2 text-right font-mono">{formatMoneda(Number(p.interes_devengado), i.moneda)}</td>
                          <td className="p-2 text-right font-mono font-bold">{formatMoneda(Number(p.saldo_cierre), i.moneda)}</td>
                        </tr>
                        {huboCambio && (
                          <tr className="border-b border-slate-200" style={{ background: '#fef3c7' }}>
                            <td colSpan={6} className="p-2">
                              <div className="text-[11px] font-medium mb-1" style={{ color: '#78350f' }}>
                                Desglose del mes (cambio de tasa intra-mes):
                              </div>
                              <ul className="text-[11px] space-y-0.5" style={{ color: '#78350f' }}>
                                {segs.map((s, idx) => (
                                  <li key={idx} className="flex justify-between gap-3">
                                    <span>
                                      {formatDate(s.desde)} – {formatDate(s.hasta)} · <strong>{(s.tasa * 100).toFixed(4)}%</strong> ({s.dias} día{s.dias !== 1 ? 's' : ''})
                                    </span>
                                    <span className="font-mono">{formatMoneda(s.interes, i.moneda)}</span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>

              {totalUsd > 0 && (
                <div className="total bg-black text-white px-3 py-2 flex justify-between font-bold mt-3">
                  <span>TOTAL USD</span>
                  <span className="font-mono">{formatMoneda(totalUsd, 'USD')}</span>
                </div>
              )}
              {totalArs > 0 && (
                <div className="total bg-black text-white px-3 py-2 flex justify-between font-bold mt-1">
                  <span>TOTAL ARS</span>
                  <span className="font-mono">{formatMoneda(totalArs, 'ARS')}</span>
                </div>
              )}

              <div className="footer mt-6 pt-3 border-t border-slate-300 text-xs text-slate-600">
                <p>Interés generado en el período: {interesUsd > 0 && formatMoneda(interesUsd, 'USD')} {interesArs > 0 && formatMoneda(interesArs, 'ARS')}</p>
                <p className="mt-2">
                  Las condiciones particulares de cada instrumento (capitalizable / no capitalizable) están detalladas en la columna "Tipo".
                  Para los instrumentos no capitalizables, el capital permanece constante y los intereses se acumulan o pagan según el acuerdo.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info detallada en oscuro debajo */}
      {inversorSelected && instrumentos.length > 0 && (
        <div className="bg-white border border-[#e8e4dc] rounded-xl overflow-x-auto">
          <div className="px-4 py-3 border-b border-[#e8e4dc]">
            <h2 className="text-sm font-semibold text-slate-900">Instrumentos del inversor</h2>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {instrumentos.map((i) => (
              <div key={i.id} className="bg-[#f5f0e6]/40 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-900">{i.codigo ?? i.id.substring(0, 8)}</span>
                  <Badge variant={i.moneda === 'USD' ? 'success' : 'info'}>{i.moneda}</Badge>
                </div>
                <p className="text-xs text-slate-600">
                  Capital {formatMoneda(Number(i.capital_inicial), i.moneda)} · Tasa {(Number(i.tasa_mensual) * 100).toFixed(2)}%
                </p>
                <p className={cn('text-xs flex items-center gap-1 mt-1', i.capitalizable ? 'text-purple-700' : 'text-slate-600')}>
                  {i.capitalizable ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  {i.capitalizable ? 'Capitalizable' : 'No capitalizable'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
