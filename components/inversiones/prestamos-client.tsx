'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Instrumento, Inversor, EstadoInstrumento } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatMoneda } from '@/lib/inversiones-calc'
import { formatDate } from '@/lib/utils'
import {
  TrendingUp, Filter, Lock, Unlock, ChevronRight, Search, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type InstrConRel = Instrumento & { inversor?: Inversor }

interface Props {
  instrumentos: InstrConRel[]
  periodos: { instrumento_id: string; saldo_cierre: number; mes: string }[]
}

export function PrestamosClient({ instrumentos, periodos }: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroMoneda, setFiltroMoneda] = useState<'TODOS' | 'USD' | 'ARS'>('TODOS')
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | EstadoInstrumento>('TODOS')
  const [filtroCap, setFiltroCap] = useState<'TODOS' | 'CAPITALIZABLE' | 'NO_CAPITALIZABLE'>('TODOS')

  const ultimoSaldo = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of periodos) {
      if (!map.has(p.instrumento_id)) map.set(p.instrumento_id, Number(p.saldo_cierre))
    }
    return map
  }, [periodos])

  const filtrados = useMemo(() => {
    return instrumentos.filter((i) => {
      if (filtroMoneda !== 'TODOS' && i.moneda !== filtroMoneda) return false
      if (filtroEstado !== 'TODOS' && i.estado !== filtroEstado) return false
      if (filtroCap === 'CAPITALIZABLE' && !i.capitalizable) return false
      if (filtroCap === 'NO_CAPITALIZABLE' && i.capitalizable) return false
      if (busqueda) {
        const q = busqueda.toLowerCase()
        const cod = i.codigo?.toLowerCase() ?? ''
        const inv = i.inversor?.nombre.toLowerCase() ?? ''
        if (!cod.includes(q) && !inv.includes(q)) return false
      }
      return true
    })
  }, [instrumentos, filtroMoneda, filtroEstado, filtroCap, busqueda])

  const totalUsd = filtrados
    .filter((i) => i.moneda === 'USD' && i.estado === 'activo')
    .reduce((s, i) => s + (ultimoSaldo.get(i.id) ?? Number(i.capital_inicial)), 0)
  const totalArs = filtrados
    .filter((i) => i.moneda === 'ARS' && i.estado === 'activo')
    .reduce((s, i) => s + (ultimoSaldo.get(i.id) ?? Number(i.capital_inicial)), 0)

  const interesUsdMensual = filtrados
    .filter((i) => i.moneda === 'USD' && i.estado === 'activo')
    .reduce((s, i) => {
      const saldo = ultimoSaldo.get(i.id) ?? Number(i.capital_inicial)
      return s + saldo * Number(i.tasa_mensual)
    }, 0)
  const interesArsMensual = filtrados
    .filter((i) => i.moneda === 'ARS' && i.estado === 'activo')
    .reduce((s, i) => {
      const saldo = ultimoSaldo.get(i.id) ?? Number(i.capital_inicial)
      return s + saldo * Number(i.tasa_mensual)
    }, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary" />
          Préstamos / Instrumentos
        </h1>
        <p className="text-sm text-fg-muted mt-0.5">
          Vista plana de todos los instrumentos cargados — {instrumentos.length} en total
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Capital activo USD</p>
          <p className="text-xl font-bold text-green-700">{formatMoneda(totalUsd, 'USD')}</p>
        </div>
        <div className="bg-surface border border-orange-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Capital activo ARS</p>
          <p className="text-xl font-bold text-primary">{formatMoneda(totalArs, 'ARS')}</p>
        </div>
        <div className="bg-surface border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Interés mensual USD</p>
          <p className="text-xl font-bold text-amber-700">{formatMoneda(interesUsdMensual, 'USD')}</p>
        </div>
        <div className="bg-surface border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Interés mensual ARS</p>
          <p className="text-xl font-bold text-amber-700">{formatMoneda(interesArsMensual, 'ARS')}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-soft" />
          <input
            type="text"
            placeholder="Buscar por código o inversor..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-border-strong rounded-lg text-fg placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary text-sm"
          />
        </div>
        <Filter className="w-3.5 h-3.5 text-fg-soft" />
        <select
          value={filtroMoneda}
          onChange={(e) => setFiltroMoneda(e.target.value as typeof filtroMoneda)}
          className="bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="TODOS">Todas las monedas</option>
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
          className="bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="TODOS">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="cerrado">Cerrado</option>
          <option value="renovado">Renovado</option>
        </select>
        <select
          value={filtroCap}
          onChange={(e) => setFiltroCap(e.target.value as typeof filtroCap)}
          className="bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="TODOS">Cualquier tipo</option>
          <option value="CAPITALIZABLE">Capitalizable</option>
          <option value="NO_CAPITALIZABLE">No capitalizable</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Código</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Inversor</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Moneda</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Capital</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Tasa</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Inicio</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Saldo actual</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-fg-soft">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No hay instrumentos con esos filtros
                </td>
              </tr>
            ) : (
              filtrados.map((i) => {
                const saldo = ultimoSaldo.get(i.id) ?? Number(i.capital_inicial)
                return (
                  <tr key={i.id} className="border-b border-border/60 hover:bg-surface-2/30">
                    <td className="px-4 py-3 font-mono text-xs text-fg-muted">{i.codigo ?? i.id.substring(0, 8)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/inversiones/${i.inversor_id}`} className="text-fg font-medium hover:text-primary">
                        {i.inversor?.nombre ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3"><Badge variant={i.moneda === 'USD' ? 'success' : 'info'}>{i.moneda}</Badge></td>
                    <td className="px-4 py-3 text-right font-mono text-fg-muted">{formatMoneda(Number(i.capital_inicial), i.moneda)}</td>
                    <td className="px-4 py-3 text-right font-mono text-fg-muted">{(Number(i.tasa_mensual) * 100).toFixed(2)}%</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 text-xs', i.capitalizable ? 'text-purple-700' : 'text-fg-muted')}>
                        {i.capitalizable ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {i.capitalizable ? 'Capitalizable' : 'No cap.'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-muted">{formatDate(i.fecha_inicio)}</td>
                    <td className="px-4 py-3 text-right font-mono text-fg font-medium">{formatMoneda(saldo, i.moneda)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={i.estado === 'activo' ? 'success' : i.estado === 'cerrado' ? 'danger' : 'warning'}>
                        {i.estado}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Link href={`/inversiones/reporte?instrumento=${i.id}`}>
                          <Button size="sm" variant="ghost" title="Generar reporte">
                            <FileText className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        <Link href={`/inversiones/${i.inversor_id}`}>
                          <Button size="sm" variant="ghost" title="Ver detalle">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
