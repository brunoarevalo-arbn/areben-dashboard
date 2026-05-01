'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { DatosVentasGN, Gasto, Marca } from '@/types/database'
import { formatCurrency, getMonthOptions, formatMonth } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const MARCAS: Marca[] = ['BDI', 'ZATTIA', 'STUNNED']

interface PLMarcaClientProps {
  ventas: DatosVentasGN[]
  gastos: Pick<Gasto, 'negocio' | 'monto' | 'estado'>[]
  mes: string
}

export function PLMarcaClient({ ventas, gastos, mes }: PLMarcaClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const data = MARCAS.map((marca) => {
    const v = ventas.find((x) => x.marca === marca)
    const gastosM = gastos.filter((g) => g.negocio === marca).reduce((s, g) => s + g.monto, 0)
    const ingresos = v?.ventas_netas ?? 0
    const cmv = v?.cmv ?? 0
    const ganancia_bruta = ingresos - cmv
    const ganancia_neta = ganancia_bruta - gastosM
    const margen = ingresos > 0 ? (ganancia_neta / ingresos) * 100 : 0

    return {
      marca,
      ingresos,
      cmv,
      gastos_operativos: gastosM,
      ganancia_bruta,
      ganancia_neta,
      margen,
      cantidad: v?.cantidad_vendida ?? 0,
    }
  })

  const totales = {
    ingresos: data.reduce((s, d) => s + d.ingresos, 0),
    cmv: data.reduce((s, d) => s + d.cmv, 0),
    gastos_operativos: data.reduce((s, d) => s + d.gastos_operativos, 0),
    ganancia_neta: data.reduce((s, d) => s + d.ganancia_neta, 0),
  }

  const COLORES: Record<string, string> = {
    BDI: '#6366f1',
    ZATTIA: '#ec4899',
    STUNNED: '#f59e0b',
  }

  const chartData = data.map((d) => ({
    name: d.marca,
    Ingresos: d.ingresos,
    'Gananc. neta': d.ganancia_neta,
    CMV: d.cmv,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">P&L por Marca</h1>
          <p className="text-sm text-slate-400 mt-0.5">{formatMonth(mes)}</p>
        </div>
        <select
          value={searchParams.get('mes') ?? mes}
          onChange={(e) => router.push(`?mes=${e.target.value}`)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {getMonthOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Ingresos vs Ganancia Neta</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} barGap={4}>
            <XAxis dataKey="name" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
              formatter={(v) => formatCurrency(Number(v))}
            />
            <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }} />
            <Bar dataKey="Ingresos" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Gananc. neta" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="CMV" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Marca</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Ingresos</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">CMV</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Ganancia bruta</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Gastos op.</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Ganancia neta</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Margen</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.marca} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                <td className="px-4 py-3">
                  <span className="font-semibold" style={{ color: COLORES[d.marca] }}>{d.marca}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-100">{formatCurrency(d.ingresos)}</td>
                <td className="px-4 py-3 text-right font-mono text-red-400">{formatCurrency(d.cmv)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-100">{formatCurrency(d.ganancia_bruta)}</td>
                <td className="px-4 py-3 text-right font-mono text-amber-400">{formatCurrency(d.gastos_operativos)}</td>
                <td className={`px-4 py-3 text-right font-mono font-semibold ${d.ganancia_neta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(d.ganancia_neta)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`flex items-center justify-end gap-1 text-sm font-medium ${d.margen > 0 ? 'text-green-400' : d.margen < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {d.margen > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : d.margen < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                    {d.margen.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700 bg-slate-800/50">
              <td className="px-4 py-3 font-semibold text-slate-200">TOTAL</td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-slate-200">{formatCurrency(totales.ingresos)}</td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-red-400">{formatCurrency(totales.cmv)}</td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-slate-200">{formatCurrency(totales.ingresos - totales.cmv)}</td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-amber-400">{formatCurrency(totales.gastos_operativos)}</td>
              <td className={`px-4 py-3 text-right font-mono font-bold ${totales.ganancia_neta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(totales.ganancia_neta)}
              </td>
              <td className="px-4 py-3 text-right text-slate-400">
                {totales.ingresos > 0 ? ((totales.ganancia_neta / totales.ingresos) * 100).toFixed(1) : 0}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {ventas.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-300">
          No hay datos de ventas para este mes. Cargalos en <a href="/analisis/ventas" className="underline font-medium">Panel de Ventas</a>.
        </div>
      )}
    </div>
  )
}
