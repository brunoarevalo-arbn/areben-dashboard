'use client'

import type { SaldoMensual } from '@/types/database'
import { formatCurrency, formatMonth, getCurrentMonth } from '@/lib/utils'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface CashFlowClientProps {
  gastos: { concepto: string; monto: number; estado: string; mes: string; negocio: string }[]
  saldoInicial: SaldoMensual | null
  mesPivot: string
}

function addMonths(yyyyMM: string, n: number) {
  const [y, m] = yyyyMM.split('-').map(Number)
  const date = new Date(y, m - 1 + n, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function CashFlowClient({ gastos, saldoInicial, mesPivot }: CashFlowClientProps) {
  const saldoBase = (saldoInicial?.saldo_pesos ?? 0) + (saldoInicial?.caja_pesos ?? 0)

  const meses = Array.from({ length: 3 }, (_, i) => addMonths(mesPivot, i))

  let saldo = saldoBase
  const chartData = meses.map((mes) => {
    const gastosDelMes = gastos.filter((g) => g.mes === mes).reduce((s, g) => s + g.monto, 0)
    saldo -= gastosDelMes
    return {
      mes: formatMonth(mes),
      saldo: Math.round(saldo),
      gastos: gastosDelMes,
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cash Flow — Proyección 90 días</h1>
        <p className="text-sm text-slate-600 mt-0.5">Basado en gastos registrados y saldo actual</p>
      </div>

      {!saldoInicial && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-300">
          Sin saldo cargado para este mes. La proyección puede ser imprecisa.
        </div>
      )}

      <div className="bg-white border border-[#e8e4dc] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Proyección de saldo</h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <XAxis dataKey="mes" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
              formatter={(v) => formatCurrency(Number(v))}
            />
            <Area type="monotone" dataKey="saldo" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {chartData.map((d) => (
          <div key={d.mes} className="bg-white border border-[#e8e4dc] rounded-xl p-4">
            <p className="text-xs text-slate-600 mb-2">{d.mes}</p>
            <p className={`text-xl font-bold ${d.saldo >= 0 ? 'text-orange-500' : 'text-red-400'}`}>{formatCurrency(d.saldo)}</p>
            <p className="text-xs text-slate-500 mt-1">Gastos: {formatCurrency(d.gastos)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
