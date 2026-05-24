'use client'

import { useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PeriodoInstrumento, Instrumento, Inversor } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatMoneda } from '@/lib/inversiones-calc'
import { formatMonth, getMonthOptions } from '@/lib/utils'
import { Download, TrendingUp, DollarSign, Lock, Unlock } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'

type PeriodoConRel = PeriodoInstrumento & {
  instrumento?: Instrumento & { inversor?: { nombre: string } }
}

interface Props {
  mes: string
  periodos: PeriodoConRel[]
}

export function GastosFinancierosClient({ mes, periodos }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // KPIs del mes seleccionado
  const periodosMes = periodos.filter((p) => p.mes === mes)
  const totalInvertidoUsd = periodosMes
    .filter((p) => p.instrumento?.moneda === 'USD')
    .reduce((s, p) => s + Number(p.saldo_inicio), 0)
  const totalInvertidoArs = periodosMes
    .filter((p) => p.instrumento?.moneda === 'ARS')
    .reduce((s, p) => s + Number(p.saldo_inicio), 0)
  const gastoUsd = periodosMes
    .filter((p) => p.instrumento?.moneda === 'USD')
    .reduce((s, p) => s + Number(p.interes_devengado), 0)
  const gastoArs = periodosMes
    .filter((p) => p.instrumento?.moneda === 'ARS')
    .reduce((s, p) => s + Number(p.interes_devengado), 0)

  // Evolución últimos 12 meses
  const evolucion = useMemo(() => {
    const map = new Map<string, { mes: string; usd: number; ars: number }>()
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      map.set(k, { mes: k, usd: 0, ars: 0 })
    }
    for (const p of periodos) {
      const e = map.get(p.mes)
      if (!e) continue
      if (p.instrumento?.moneda === 'USD') e.usd += Number(p.interes_devengado)
      else e.ars += Number(p.interes_devengado)
    }
    return Array.from(map.values()).map((e) => ({
      mes: formatMonth(e.mes).substring(0, 3),
      USD: Math.round(e.usd * 100) / 100,
      ARS: Math.round(e.ars),
    }))
  }, [periodos])

  function setMes(nuevo: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', nuevo)
    router.push(`?${params.toString()}`)
  }

  function exportCSV() {
    const headers = ['mes', 'inversor', 'instrumento', 'moneda', 'capitalizable', 'saldo_inicio', 'interes', 'movimiento', 'saldo_cierre', 'cerrado']
    const rows = periodos.map((p) => [
      p.mes,
      p.instrumento?.inversor?.nombre ?? '',
      p.instrumento?.codigo ?? '',
      p.instrumento?.moneda ?? '',
      p.instrumento?.capitalizable ? 'SI' : 'NO',
      Number(p.saldo_inicio).toFixed(2),
      Number(p.interes_devengado).toFixed(2),
      Number(p.movimiento).toFixed(2),
      Number(p.saldo_cierre).toFixed(2),
      p.cerrado ? 'SI' : 'NO',
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `inversiones-${mes}.csv`
    link.click()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-orange-500" />
            Gastos financieros
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">Costo de las inversiones de terceros mes a mes</p>
        </div>
        <div className="flex items-center gap-2">
          <Select options={getMonthOptions(24)} value={mes} onChange={(e) => setMes(e.target.value)} className="w-44" />
          <Button variant="secondary" onClick={exportCSV} title="Exportar a CSV para contabilidad">
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-600 mb-1">Total invertido USD</p>
          <p className="text-xl font-bold text-green-400">{formatMoneda(totalInvertidoUsd, 'USD')}</p>
        </div>
        <div className="bg-white border border-orange-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-600 mb-1">Total invertido ARS</p>
          <p className="text-xl font-bold text-orange-500">{formatMoneda(totalInvertidoArs, 'ARS')}</p>
        </div>
        <div className="bg-white border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-600 mb-1">Gasto financiero USD</p>
          <p className="text-xl font-bold text-amber-400">{formatMoneda(gastoUsd, 'USD')}</p>
        </div>
        <div className="bg-white border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-600 mb-1">Gasto financiero ARS</p>
          <p className="text-xl font-bold text-amber-400">{formatMoneda(gastoArs, 'ARS')}</p>
        </div>
      </div>

      {/* Gráfico evolución */}
      <div className="bg-white border border-[#e8e4dc] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4 text-sm font-medium text-slate-800">
          <DollarSign className="w-4 h-4 text-orange-500" />
          Evolución últimos 12 meses
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={evolucion}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="mes" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" stroke="#10b981" tick={{ fontSize: 11 }}
                tickFormatter={(v) => Number(v).toLocaleString('es-AR')} />
              <YAxis yAxisId="right" orientation="right" stroke="#6366f1" tick={{ fontSize: 11 }}
                tickFormatter={(v) => Number(v).toLocaleString('es-AR')} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v, name) => [formatMoneda(Number(v ?? 0), String(name) as 'USD' | 'ARS'), String(name)]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="left" type="monotone" dataKey="USD" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="ARS" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla detallada */}
      <div className="bg-white border border-[#e8e4dc] rounded-xl overflow-x-auto">
        <div className="px-4 py-3 border-b border-[#e8e4dc] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Detalle por inversor / instrumento (todos los meses)</h2>
          <span className="text-xs text-slate-500">{periodos.length} registros</span>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-[#e8e4dc]">
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-600 uppercase">Mes</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-600 uppercase">Inversor</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-600 uppercase">Instr.</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-600 uppercase">Mon.</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-600 uppercase">Cap.</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 uppercase">Saldo inicio</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 uppercase">Interés</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 uppercase">Saldo cierre</th>
              </tr>
            </thead>
            <tbody>
              {periodos.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">Sin datos</td></tr>
              ) : (
                periodos.map((p) => {
                  const i = p.instrumento
                  if (!i) return null
                  return (
                    <tr key={p.id} className="border-b border-[#e8e4dc]/60 hover:bg-[#f5f0e6]/30">
                      <td className="px-4 py-2 text-xs text-slate-700">{formatMonth(p.mes)}</td>
                      <td className="px-4 py-2 text-slate-800">{i.inversor?.nombre ?? '—'}</td>
                      <td className="px-4 py-2 text-xs font-mono text-slate-600">{i.codigo ?? i.id.substring(0, 8)}</td>
                      <td className="px-4 py-2"><Badge variant={i.moneda === 'USD' ? 'success' : 'info'}>{i.moneda}</Badge></td>
                      <td className="px-4 py-2">
                        <span className={i.capitalizable ? 'text-purple-400' : 'text-slate-600'}>
                          {i.capitalizable ? <Lock className="w-3 h-3 inline" /> : <Unlock className="w-3 h-3 inline" />}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-slate-700 text-xs">{formatMoneda(Number(p.saldo_inicio), i.moneda)}</td>
                      <td className="px-4 py-2 text-right font-mono text-amber-400 text-xs">{formatMoneda(Number(p.interes_devengado), i.moneda)}</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-900 font-medium text-xs">{formatMoneda(Number(p.saldo_cierre), i.moneda)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
