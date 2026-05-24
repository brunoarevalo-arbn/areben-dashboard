'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { deleteInstrumento, regenerarPeriodos, deleteTramoTasa } from '@/app/actions/inversiones'
import type { Inversor, Instrumento, PeriodoInstrumento, TramoTasa } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatMoneda } from '@/lib/inversiones-calc'
import { formatMonth, formatDate } from '@/lib/utils'
import { InstrumentoForm } from './instrumento-form'
import { CambiarTasaForm } from './cambiar-tasa-form'
import { SimuladorMovimiento } from './simulador'
import {
  ChevronLeft, Plus, Pencil, Trash2, RotateCw, FileText, Lock, Unlock,
  TrendingUp, Calendar, User, Briefcase, Percent, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  inversor: Inversor
  instrumentos: Instrumento[]
  periodos: PeriodoInstrumento[]
  tramos: TramoTasa[]
}

export function InversorDetalleClient({ inversor, instrumentos, periodos, tramos }: Props) {
  const [modal, setModal] = useState(false)
  const [editInstr, setEditInstr] = useState<Instrumento | undefined>()
  const [tasaModal, setTasaModal] = useState<Instrumento | undefined>()
  const [selectedInstr, setSelectedInstr] = useState<Instrumento | undefined>(instrumentos[0])
  const [isPending, startTransition] = useTransition()

  const periodosByInstr = useMemo(() => {
    const map = new Map<string, PeriodoInstrumento[]>()
    for (const p of periodos) {
      if (!map.has(p.instrumento_id)) map.set(p.instrumento_id, [])
      map.get(p.instrumento_id)!.push(p)
    }
    return map
  }, [periodos])

  const tramosByInstr = useMemo(() => {
    const map = new Map<string, TramoTasa[]>()
    for (const t of tramos) {
      if (!map.has(t.instrumento_id)) map.set(t.instrumento_id, [])
      map.get(t.instrumento_id)!.push(t)
    }
    return map
  }, [tramos])

  const periodosSelected = selectedInstr ? periodosByInstr.get(selectedInstr.id) ?? [] : []
  const tramosSelected = selectedInstr ? tramosByInstr.get(selectedInstr.id) ?? [] : []
  // Tasa actual = la del tramo más reciente cuya fecha_desde ≤ hoy
  const tasaActualSelected = useMemo(() => {
    if (!selectedInstr) return 0
    const hoy = new Date().toISOString().split('T')[0]
    let tasa = Number(selectedInstr.tasa_mensual)
    for (const t of tramosSelected) {
      if (t.fecha_desde <= hoy) tasa = Number(t.tasa_mensual)
    }
    return tasa
  }, [selectedInstr, tramosSelected])

  return (
    <div className="space-y-6">
      <Link href="/inversiones" className="text-sm text-slate-600 hover:text-slate-800 inline-flex items-center gap-1">
        <ChevronLeft className="w-4 h-4" /> Volver a inversores
      </Link>

      {/* Header */}
      <div className="bg-white border border-[#e8e4dc] rounded-xl p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {inversor.tipo === 'empresa'
              ? <Briefcase className="w-10 h-10 text-orange-500" />
              : <User className="w-10 h-10 text-slate-600" />}
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{inversor.nombre}</h1>
              <p className="text-sm text-slate-600">
                {inversor.tipo === 'empresa' ? 'Empresa' : 'Persona física'}
                {' · '}
                {instrumentos.length} instrumento(s)
                {!inversor.activo && <Badge variant="danger" className="ml-2">Inactivo</Badge>}
              </p>
              {inversor.notas && <p className="text-sm text-slate-700 mt-2 max-w-xl">{inversor.notas}</p>}
            </div>
          </div>
          <Button onClick={() => { setEditInstr(undefined); setModal(true) }} title="Crear nuevo instrumento">
            <Plus className="w-4 h-4" />
            Nuevo instrumento
          </Button>
        </div>
      </div>

      {/* Lista de instrumentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {instrumentos.length === 0 ? (
          <div className="col-span-2 bg-white border border-[#e8e4dc] rounded-xl p-12 text-center">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p className="text-slate-500 mb-3">Sin instrumentos cargados</p>
            <Button onClick={() => { setEditInstr(undefined); setModal(true) }} size="sm">
              <Plus className="w-3.5 h-3.5" />
              Crear el primero
            </Button>
          </div>
        ) : (
          instrumentos.map((i) => {
            const ps = periodosByInstr.get(i.id) ?? []
            const ultimo = ps[0]
            const saldoActual = ultimo ? Number(ultimo.saldo_cierre) : Number(i.capital_inicial)
            const isSelected = selectedInstr?.id === i.id
            return (
              <div
                key={i.id}
                onClick={() => setSelectedInstr(i)}
                className={cn(
                  'bg-white border rounded-xl p-4 cursor-pointer transition-colors',
                  isSelected ? 'border-orange-500/50 ring-1 ring-orange-500/30' : 'border-[#e8e4dc] hover:border-[#d6d0c4]'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-mono text-xs text-slate-600">{i.codigo ?? i.id.substring(0, 8)}</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {formatMoneda(Number(i.capital_inicial), i.moneda)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <Badge variant={i.moneda === 'USD' ? 'success' : 'info'}>{i.moneda}</Badge>
                    <Badge variant={i.estado === 'activo' ? 'success' : i.estado === 'cerrado' ? 'danger' : 'warning'}>
                      {i.estado}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1 text-xs mb-3">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Tasa mensual</span>
                    <span className="font-mono text-slate-800">{(Number(i.tasa_mensual) * 100).toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Capitalización</span>
                    <span className={cn('flex items-center gap-1 font-medium', i.capitalizable ? 'text-purple-400' : 'text-slate-700')}>
                      {i.capitalizable ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      {i.capitalizable ? 'Capitalizable' : 'No capitalizable'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Inicio</span>
                    <span className="text-slate-700">{formatDate(i.fecha_inicio)}</span>
                  </div>
                  {i.fecha_fin && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Vencimiento</span>
                      <span className="text-slate-700">{formatDate(i.fecha_fin)}</span>
                    </div>
                  )}
                </div>

                <div className="bg-[#f5f0e6]/60 rounded-lg p-2.5 flex items-center justify-between border-t border-[#d6d0c4]/40">
                  <span className="text-xs text-slate-600">Saldo actual</span>
                  <span className="font-mono text-base font-bold text-slate-900">
                    {formatMoneda(saldoActual, i.moneda)}
                  </span>
                </div>

                <div className="flex gap-1 mt-2 pt-2 border-t border-[#e8e4dc]">
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditInstr(i); setModal(true) }} title="Editar instrumento">
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); setTasaModal(i) }}
                    title="Cambiar tasa"
                  >
                    <Percent className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); startTransition(() => regenerarPeriodos(i.id)) }}
                    disabled={isPending}
                    title="Regenerar períodos (recalcular)"
                  >
                    <RotateCw className="w-3 h-3" />
                  </Button>
                  <Link href={`/inversiones/reporte?instrumento=${i.id}`}>
                    <Button size="sm" variant="ghost" title="Generar reporte">
                      <FileText className="w-3 h-3" />
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!confirm('¿Eliminar este instrumento? Se borrarán todos sus períodos.')) return
                      startTransition(() => deleteInstrumento(i.id))
                    }}
                    disabled={isPending}
                    title="Eliminar instrumento"
                    className="ml-auto"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Tramos de tasa del instrumento seleccionado */}
      {selectedInstr && tramosSelected.length > 0 && (
        <div className="bg-white border border-[#e8e4dc] rounded-xl overflow-x-auto">
          <div className="px-4 py-3 border-b border-[#e8e4dc] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Percent className="w-4 h-4 text-purple-400" />
              Historial de tasas · {selectedInstr.codigo ?? selectedInstr.id.substring(0, 8)}
            </h2>
            <Button size="sm" variant="ghost" onClick={() => setTasaModal(selectedInstr)} title="Cambiar tasa">
              <Plus className="w-3.5 h-3.5" />
              Cambiar tasa
            </Button>
          </div>
          <div className="divide-y divide-slate-800/60">
            {tramosSelected.map((t, idx) => {
              const siguiente = tramosSelected[idx + 1]
              const variacion = idx > 0
                ? ((Number(t.tasa_mensual) - Number(tramosSelected[idx - 1].tasa_mensual)) / Number(tramosSelected[idx - 1].tasa_mensual)) * 100
                : 0
              return (
                <div key={t.id} className="flex items-center justify-between px-4 py-2.5 group">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                    <div>
                      <p className="text-sm text-slate-900 font-mono">
                        {(Number(t.tasa_mensual) * 100).toFixed(4)}%
                        {idx === 0 && <span className="text-[10px] text-slate-500 ml-2 font-sans">tasa inicial</span>}
                        {idx > 0 && variacion !== 0 && (
                          <span className={cn(
                            'text-[10px] ml-2 font-sans',
                            variacion > 0 ? 'text-green-400' : 'text-red-400'
                          )}>
                            {variacion > 0 ? '+' : ''}{variacion.toFixed(2)}%
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        Desde {formatDate(t.fecha_desde)}
                        {siguiente && <> <ArrowRight className="w-3 h-3 inline mx-1" /> hasta {formatDate(siguiente.fecha_desde)}</>}
                        {!siguiente && <span className="text-purple-400 ml-1">· vigente</span>}
                      </p>
                      {t.notas && <p className="text-xs text-slate-600 mt-0.5">{t.notas}</p>}
                    </div>
                  </div>
                  {tramosSelected.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirm('¿Eliminar este tramo? Se recalcularán los períodos abiertos.')) return
                        startTransition(() => deleteTramoTasa(t.id))
                      }}
                      disabled={isPending}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-500 hover:text-red-400 hover:bg-[#f5f0e6] transition-all"
                      title="Eliminar tramo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Simulador de movimientos */}
      {selectedInstr && (() => {
        const mesAct = new Date()
        const mesActStr = `${mesAct.getFullYear()}-${String(mesAct.getMonth() + 1).padStart(2, '0')}`
        const periodoActual = periodosSelected.find((p) => p.mes === mesActStr)
        return (
          <SimuladorMovimiento
            instrumento={selectedInstr}
            tramos={tramos}
            periodoMesActual={periodoActual}
            inversorNombre={inversor.nombre}
          />
        )
      })()}

      {/* Timeline de períodos del instrumento seleccionado */}
      {selectedInstr && periodosSelected.length > 0 && (
        <div className="bg-white border border-[#e8e4dc] rounded-xl overflow-x-auto">
          <div className="px-4 py-3 border-b border-[#e8e4dc] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-orange-500" />
              Períodos · {selectedInstr.codigo ?? selectedInstr.id.substring(0, 8)}
            </h2>
            <span className="text-xs text-slate-500">
              {periodosSelected.length} mes(es) · {selectedInstr.capitalizable ? 'capitalizable' : 'no capitalizable'}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e8e4dc]">
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-600 uppercase">Mes</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 uppercase">Saldo inicio</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 uppercase">Tasa</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 uppercase">Interés</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 uppercase">Movimiento</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 uppercase">Saldo cierre</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-600 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody>
              {periodosSelected.map((p) => {
                // Detectar si hubo cambio de tasa intra-mes (si hay más de un tramo en ese mes)
                const cambiosEnMes = tramosSelected.filter((t) => {
                  const tMes = t.fecha_desde.substring(0, 7)
                  return tMes === p.mes && t.fecha_desde.substring(8, 10) !== '01'
                })
                return (
                  <tr key={p.id} className={cn(
                    'border-b border-[#e8e4dc]/60',
                    p.cerrado && 'bg-green-500/5'
                  )}>
                    <td className="px-4 py-2 text-slate-800">{formatMonth(p.mes)}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-700">{formatMoneda(Number(p.saldo_inicio), selectedInstr.moneda)}</td>
                    <td className="px-4 py-2 text-right font-mono text-purple-400 text-xs">
                      {(Number(p.tasa_aplicada) * 100).toFixed(4)}%
                      {cambiosEnMes.length > 0 && (
                        <span className="block text-[10px] text-amber-400">cambio intra-mes</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-amber-400">
                      {formatMoneda(Number(p.interes_devengado), selectedInstr.moneda)}
                      {(Number(p.int_inicio_prorrateado) > 0 || Number(p.int_fin_prorrateado) > 0) && (
                        <p className="text-[10px] text-slate-500">prorrateado</p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-600">
                      {Number(p.movimiento) !== 0 ? formatMoneda(Number(p.movimiento), selectedInstr.moneda) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-900 font-medium">
                      {formatMoneda(Number(p.saldo_cierre), selectedInstr.moneda)}
                    </td>
                    <td className="px-4 py-2">
                      {p.cerrado ? <Badge variant="success">Cerrado</Badge> : <Badge variant="warning">Abierto</Badge>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modal}
        onOpenChange={setModal}
        title={editInstr ? 'Editar instrumento' : 'Nuevo instrumento'}
        className="max-w-lg"
      >
        <InstrumentoForm
          instrumento={editInstr}
          inversorId={inversor.id}
          onClose={() => setModal(false)}
        />
      </Modal>

      {tasaModal && (
        <Modal
          open={!!tasaModal}
          onOpenChange={(o) => { if (!o) setTasaModal(undefined) }}
          title="Cambiar tasa"
          className="max-w-lg"
        >
          <CambiarTasaForm
            instrumento={tasaModal}
            tasaActual={tasaModal.id === selectedInstr?.id ? tasaActualSelected : Number(tasaModal.tasa_mensual)}
            onClose={() => setTasaModal(undefined)}
          />
        </Modal>
      )}
    </div>
  )
}
