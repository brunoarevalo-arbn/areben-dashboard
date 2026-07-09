'use client'

import { useState, useMemo } from 'react'
import { formatCurrency, formatMonth, cn } from '@/lib/utils'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'

export interface AggRow {
  mes: string
  cuenta_gn: string
  marca: string
  canal: string
  cuenta_cobro: string
  sale_type: string
  ventas_con_iva: number
  ventas_netas: number
  cmv: number
  descuentos: number
  envios: number
  cantidad: number
  monto_facturado: number
}

const COLORES: Record<string, string> = { BDI: '#6366f1', ZATTIA: '#ec4899', STUNNED: '#f59e0b' }
const n = (x: number) => Number(x) || 0

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <p className="text-xs text-fg-muted mb-1">{label}</p>
      <p className={cn('text-xl font-bold', color ?? 'text-fg')}>{value}</p>
    </div>
  )
}

export function AnaliticaGNClient({ rows, tipoPorCuenta }: { rows: AggRow[]; tipoPorCuenta: Record<string, string> }) {
  const meses = useMemo(() => [...new Set(rows.map((r) => r.mes))].sort(), [rows])
  const [mes, setMes] = useState<string>('todos')

  const fil = useMemo(() => (mes === 'todos' ? rows : rows.filter((r) => r.mes === mes)), [rows, mes])

  // Agregador genérico
  function agg(list: AggRow[], keyFn: (r: AggRow) => string) {
    const m = new Map<string, { netas: number; cmv: number; cantidad: number; facturado: number; conIva: number }>()
    for (const r of list) {
      const k = keyFn(r) || '(s/d)'
      const a = m.get(k) ?? { netas: 0, cmv: 0, cantidad: 0, facturado: 0, conIva: 0 }
      a.netas += n(r.ventas_netas); a.cmv += n(r.cmv); a.cantidad += n(r.cantidad); a.facturado += n(r.monto_facturado); a.conIva += n(r.ventas_con_iva)
      m.set(k, a)
    }
    return m
  }

  const tot = useMemo(() => {
    let netas = 0, cmv = 0, conIva = 0, facturado = 0
    for (const r of fil) { netas += n(r.ventas_netas); cmv += n(r.cmv); conIva += n(r.ventas_con_iva); facturado += n(r.monto_facturado) }
    return { netas, cmv, margen: netas - cmv, margenPct: netas > 0 ? ((netas - cmv) / netas) * 100 : 0, formalPct: conIva > 0 ? (facturado / conIva) * 100 : 0 }
  }, [fil])

  const porMarca = useMemo(() => [...agg(fil, (r) => r.marca).entries()].sort((a, b) => b[1].netas - a[1].netas), [fil])
  const porCanal = useMemo(() => [...agg(fil, (r) => r.canal).entries()].sort((a, b) => b[1].netas - a[1].netas), [fil])
  const porTipoVenta = useMemo(() => [...agg(fil, (r) => r.sale_type).entries()].sort((a, b) => b[1].netas - a[1].netas), [fil])
  const formal = useMemo(() => {
    const m = agg(fil, (r) => (tipoPorCuenta[r.cuenta_cobro] === 'areben' ? 'Formal (Areben)' : 'Informal (efectivo/propias)'))
    return [...m.entries()]
  }, [fil, tipoPorCuenta])

  // Estacionalidad: siempre toda la serie
  const serie = useMemo(() => meses.map((mm) => {
    const a = agg(rows.filter((r) => r.mes === mm), () => 'x').get('x') ?? { netas: 0, cmv: 0, cantidad: 0, facturado: 0, conIva: 0 }
    return { mes: formatMonth(mm).slice(0, 3), netas: Math.round(a.netas), margen: Math.round(a.netas - a.cmv) }
  }), [meses, rows])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg">Inteligencia de ventas</h1>
          <p className="text-sm text-fg-muted mt-0.5">Datos de Gestión Nube · {mes === 'todos' ? `${meses.length} meses` : formatMonth(mes)}</p>
        </div>
        <select value={mes} onChange={(e) => setMes(e.target.value)} className="bg-surface-2 border border-border-strong rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="todos">Todos los meses</option>
          {[...meses].reverse().map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Ventas netas" value={formatCurrency(tot.netas)} />
        <Stat label="CMV" value={formatCurrency(tot.cmv)} color="text-red-700" />
        <Stat label="Margen bruto" value={`${formatCurrency(tot.margen)} · ${tot.margenPct.toFixed(0)}%`} color="text-green-700" />
        <Stat label="% Formal (facturado)" value={`${tot.formalPct.toFixed(0)}%`} color="text-primary" />
      </div>

      {/* Estacionalidad */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-fg-muted mb-4">Estacionalidad — ventas netas y margen por mes</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" stroke="#33415533" />
            <XAxis dataKey="mes" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} formatter={(v) => formatCurrency(Number(v))} />
            <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
            <Line type="monotone" dataKey="netas" name="Ventas netas" stroke="#6366f1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="margen" name="Margen" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rentabilidad por marca */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-fg-muted mb-4">Rentabilidad por marca</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-xs text-fg-muted uppercase">
              <th className="text-left py-2">Marca</th><th className="text-right py-2">Ventas netas</th><th className="text-right py-2">Margen</th><th className="text-right py-2">%</th>
            </tr></thead>
            <tbody>
              {porMarca.map(([marca, a]) => {
                const margen = a.netas - a.cmv
                return (
                  <tr key={marca} className="border-b border-border/60">
                    <td className="py-2 font-semibold" style={{ color: COLORES[marca] ?? undefined }}>{marca}</td>
                    <td className="py-2 text-right font-mono text-fg">{formatCurrency(a.netas)}</td>
                    <td className="py-2 text-right font-mono text-green-700">{formatCurrency(margen)}</td>
                    <td className="py-2 text-right text-fg-muted">{a.netas > 0 ? ((margen / a.netas) * 100).toFixed(0) : 0}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Formal vs informal */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-fg-muted mb-4">Formal vs informal (por cuenta de cobro)</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-xs text-fg-muted uppercase">
              <th className="text-left py-2">Tipo</th><th className="text-right py-2">Ventas (c/IVA)</th><th className="text-right py-2">%</th>
            </tr></thead>
            <tbody>
              {formal.map(([tipo, a]) => {
                const totConIva = formal.reduce((s, [, x]) => s + x.conIva, 0) || 1
                return (
                  <tr key={tipo} className="border-b border-border/60">
                    <td className="py-2 text-fg">{tipo}</td>
                    <td className="py-2 text-right font-mono text-fg">{formatCurrency(a.conIva)}</td>
                    <td className="py-2 text-right font-semibold text-primary">{((a.conIva / totConIva) * 100).toFixed(0)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ventas por canal */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-fg-muted mb-4">Ventas netas por canal</h2>
        <ResponsiveContainer width="100%" height={Math.max(180, porCanal.length * 42)}>
          <BarChart layout="vertical" data={porCanal.map(([canal, a]) => ({ canal, netas: Math.round(a.netas) }))} margin={{ left: 20 }}>
            <XAxis type="number" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} />
            <YAxis type="category" dataKey="canal" width={120} stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} formatter={(v) => formatCurrency(Number(v))} />
            <Bar dataKey="netas" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Minorista vs mayorista */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-fg-muted mb-4">Minorista vs mayorista</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {porTipoVenta.map(([tipo, a]) => (
            <div key={tipo} className="rounded-lg border border-border bg-surface-2/40 p-3">
              <p className="text-xs text-fg-muted mb-1">{tipo || '(s/d)'}</p>
              <p className="text-lg font-mono font-bold text-fg">{formatCurrency(a.netas)}</p>
              <p className="text-[11px] text-fg-soft">{a.cantidad.toLocaleString('es-AR')} u.</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
