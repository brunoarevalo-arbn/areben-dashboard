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
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-orange-500" />
          Préstamos / Instrumentos
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Vista plana de todos los instrumentos cargados — {instrumentos.length} en total
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-600 mb-1">Capital activo USD</p>
          <p className="text-xl font-bold text-green-400">{formatMoneda(totalUsd, 'USD')}</p>
        </div>
        <div className="bg-white border border-orange-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-600 mb-1">Capital activo ARS</p>
          <p className="text-xl font-bold text-orange-500">{formatMoneda(totalArs, 'ARS')}</p>
        </div>
        <div className="bg-white border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-600 mb-1">Interés mensual USD</p>
          <p className="text-xl font-bold text-amber-400">{formatMoneda(interesUsdMensual, 'USD')}</p>
        </div>
        <div className="bg-white border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-600 mb-1">Interés mensual ARS</p>
          <p className="text-xl font-bold text-amber-400">{formatMoneda(interesArsMensual, 'ARS')}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-[#e8e4dc] rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por código o inversor..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
          />
        </div>
        <Filter className="w-3.5 h-3.5 text-slate-500" />
        <select
          value={filtroMoneda}
          onChange={(e) => setFiltroMoneda(e.target.value as typeof filtroMoneda)}
          className="bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="TODOS">Todas las monedas</option>
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
          className="bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="TODOS">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="cerrado">Cerrado</option>
          <option value="renovado">Renovado</option>
        </select>
        <select
          value={filtroCap}
          onChange={(e) => setFiltroCap(e.target.value as typeof filtroCap)}
          className="bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="TODOS">Cualquier tipo</option>
          <option value="CAPITALIZABLE">Capitalizable</option>
          <option value="NO_CAPITALIZABLE">No capitalizable</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-[#e8e4dc] rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e8e4dc]">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Código</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Inversor</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Moneda</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Capital</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Tasa</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Inicio</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Saldo actual</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No hay instrumentos con esos filtros
                </td>
              </tr>
            ) : (
              filtrados.map((i) => {
                const saldo = ultimoSaldo.get(i.id) ?? Number(i.capital_inicial)
                return (
                  <tr key={i.id} className="border-b border-[#e8e4dc]/60 hover:bg-[#f5f0e6]/30">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{i.codigo ?? i.id.substring(0, 8)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/inversiones/${i.inversor_id}`} className="text-slate-900 font-medium hover:text-orange-500">
                        {i.inversor?.nombre ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3"><Badge variant={i.moneda === 'USD' ? 'success' : 'info'}>{i.moneda}</Badge></td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{formatMoneda(Number(i.capital_inicial), i.moneda)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-800">{(Number(i.tasa_mensual) * 100).toFixed(2)}%</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 text-xs', i.capitalizable ? 'text-purple-400' : 'text-slate-600')}>
                        {i.capitalizable ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {i.capitalizable ? 'Capitalizable' : 'No cap.'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(i.fecha_inicio)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-900 font-medium">{formatMoneda(saldo, i.moneda)}</td>
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
