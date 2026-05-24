'use client'

import { useActionState, useState, useMemo } from 'react'
import Link from 'next/link'
import { createInversor, updateInversor, toggleInversorActivo } from '@/app/actions/inversiones'
import type { Inversor, Instrumento, EstadoInstrumento } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatMoneda } from '@/lib/inversiones-calc'
import {
  Plus, Pencil, Power, Loader2, PiggyBank, TrendingUp, ChevronRight,
  Briefcase, User, Filter,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  inversores: Inversor[]
  instrumentos: Instrumento[]
  periodos: { instrumento_id: string; saldo_cierre: number; mes: string }[]
}

function InversorForm({ inv, onClose }: { inv?: Inversor; onClose: () => void }) {
  const action = inv ? updateInversor.bind(null, inv.id) : createInversor
  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const r = await action(prev, fd)
      if (!r) onClose()
      return r
    },
    null
  )
  return (
    <form action={formAction} className="space-y-4">
      <Input label="Nombre" name="nombre" defaultValue={inv?.nombre} required />
      <Select label="Tipo" name="tipo" defaultValue={inv?.tipo ?? 'persona_fisica'} options={[
        { value: 'persona_fisica', label: 'Persona física' },
        { value: 'empresa', label: 'Empresa' },
      ]} />
      <Textarea label="Notas" name="notas" defaultValue={inv?.notas ?? ''} placeholder="Datos del acuerdo, observaciones..." rows={3} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {inv ? 'Guardar' : 'Crear inversor'}
        </Button>
      </div>
    </form>
  )
}

export function InversoresClient({ inversores, instrumentos, periodos }: Props) {
  const [modal, setModal] = useState(false)
  const [editInv, setEditInv] = useState<Inversor | undefined>()
  const [filtroMoneda, setFiltroMoneda] = useState<'TODOS' | 'USD' | 'ARS'>('TODOS')
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | EstadoInstrumento>('TODOS')
  const [filtroCap, setFiltroCap] = useState<'TODOS' | 'CAPITALIZABLE' | 'NO_CAPITALIZABLE'>('TODOS')
  const [showInactivos, setShowInactivos] = useState(false)

  // Último saldo por instrumento
  const ultimoSaldo = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of periodos) {
      if (!map.has(p.instrumento_id)) map.set(p.instrumento_id, Number(p.saldo_cierre))
    }
    return map
  }, [periodos])

  const instrumentosFiltrados = useMemo(() => {
    return instrumentos.filter((i) => {
      if (filtroMoneda !== 'TODOS' && i.moneda !== filtroMoneda) return false
      if (filtroEstado !== 'TODOS' && i.estado !== filtroEstado) return false
      if (filtroCap === 'CAPITALIZABLE' && !i.capitalizable) return false
      if (filtroCap === 'NO_CAPITALIZABLE' && i.capitalizable) return false
      return true
    })
  }, [instrumentos, filtroMoneda, filtroEstado, filtroCap])

  const inversoresVisibles = useMemo(() => {
    return inversores.filter((inv) => {
      if (!showInactivos && !inv.activo) return false
      const tieneInstrumentos = instrumentosFiltrados.some((i) => i.inversor_id === inv.id)
      // Mostrar inversor si tiene al menos un instrumento que pasa los filtros, O si no hay instrumentos en absoluto
      const totalInstrumentos = instrumentos.filter((i) => i.inversor_id === inv.id).length
      return totalInstrumentos === 0 ? true : tieneInstrumentos
    })
  }, [inversores, instrumentos, instrumentosFiltrados, showInactivos])

  // Totales globales
  const totalUsd = instrumentosFiltrados
    .filter((i) => i.moneda === 'USD' && i.estado === 'activo')
    .reduce((s, i) => s + (ultimoSaldo.get(i.id) ?? Number(i.capital_inicial)), 0)
  const totalArs = instrumentosFiltrados
    .filter((i) => i.moneda === 'ARS' && i.estado === 'activo')
    .reduce((s, i) => s + (ultimoSaldo.get(i.id) ?? Number(i.capital_inicial)), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inversiones de Terceros</h1>
          <p className="text-sm text-slate-600 mt-0.5">{inversores.length} inversores · {instrumentos.length} instrumentos</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inversiones/cierre">
            <Button variant="secondary" title="Cierre mensual de períodos">
              <PiggyBank className="w-4 h-4" />
              Cierre mensual
            </Button>
          </Link>
          <Link href="/inversiones/gastos">
            <Button variant="secondary" title="Dashboard gastos financieros">
              <TrendingUp className="w-4 h-4" />
              Gastos financieros
            </Button>
          </Link>
          <Button onClick={() => { setEditInv(undefined); setModal(true) }} title="Crear nuevo inversor">
            <Plus className="w-4 h-4" />
            Nuevo inversor
          </Button>
        </div>
      </div>

      {/* KPIs totales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-white border border-green-500/20 rounded-xl p-5">
          <p className="text-xs text-slate-600 mb-1">Total invertido USD (saldos actuales)</p>
          <p className="text-2xl font-bold text-green-400">{formatMoneda(totalUsd, 'USD')}</p>
        </div>
        <div className="bg-white border border-orange-500/20 rounded-xl p-5">
          <p className="text-xs text-slate-600 mb-1">Total invertido ARS (saldos actuales)</p>
          <p className="text-2xl font-bold text-orange-500">{formatMoneda(totalArs, 'ARS')}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-[#e8e4dc] rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Filter className="w-3.5 h-3.5" />
          Filtros:
        </div>
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
        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={showInactivos}
            onChange={(e) => setShowInactivos(e.target.checked)}
            className="rounded"
          />
          Mostrar inactivos
        </label>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {inversoresVisibles.length === 0 ? (
          <div className="bg-white border border-[#e8e4dc] rounded-xl p-12 text-center">
            <Briefcase className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p className="text-slate-500">No hay inversores con esos filtros</p>
          </div>
        ) : (
          inversoresVisibles.map((inv) => {
            const insts = instrumentosFiltrados.filter((i) => i.inversor_id === inv.id)
            const totalUsdInv = insts.filter((i) => i.moneda === 'USD' && i.estado === 'activo')
              .reduce((s, i) => s + (ultimoSaldo.get(i.id) ?? Number(i.capital_inicial)), 0)
            const totalArsInv = insts.filter((i) => i.moneda === 'ARS' && i.estado === 'activo')
              .reduce((s, i) => s + (ultimoSaldo.get(i.id) ?? Number(i.capital_inicial)), 0)

            return (
              <div
                key={inv.id}
                className={cn(
                  'bg-white border rounded-xl p-5',
                  !inv.activo ? 'border-[#e8e4dc] opacity-50' : 'border-[#e8e4dc] hover:border-[#d6d0c4] transition-colors'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {inv.tipo === 'empresa' ? <Briefcase className="w-5 h-5 text-orange-500" /> : <User className="w-5 h-5 text-slate-600" />}
                    <div>
                      <Link href={`/inversiones/${inv.id}`} className="font-semibold text-slate-900 hover:text-orange-500 transition-colors">
                        {inv.nombre}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {inv.tipo === 'empresa' ? 'Empresa' : 'Persona física'} · {insts.length} instrumento(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditInv(inv); setModal(true) }} title="Editar inversor">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleInversorActivo(inv.id, !inv.activo)}
                      title={inv.activo ? 'Desactivar' : 'Activar'}
                    >
                      <Power className={cn('w-3.5 h-3.5', inv.activo ? 'text-red-400' : 'text-green-400')} />
                    </Button>
                    <Link href={`/inversiones/${inv.id}`}>
                      <Button size="sm" variant="ghost" title="Ver detalle">
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>

                {insts.length > 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {totalUsdInv > 0 && (
                        <div className="bg-[#f5f0e6]/40 rounded-lg p-3">
                          <p className="text-xs text-slate-500">Total USD</p>
                          <p className="text-base font-mono font-bold text-green-400">{formatMoneda(totalUsdInv, 'USD')}</p>
                        </div>
                      )}
                      {totalArsInv > 0 && (
                        <div className="bg-[#f5f0e6]/40 rounded-lg p-3">
                          <p className="text-xs text-slate-500">Total ARS</p>
                          <p className="text-base font-mono font-bold text-orange-500">{formatMoneda(totalArsInv, 'ARS')}</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {insts.map((i) => (
                        <div key={i.id} className="flex items-center justify-between bg-[#f5f0e6]/30 rounded-lg px-3 py-2 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-slate-600">{i.codigo ?? i.id.substring(0, 8)}</span>
                            <Badge variant={i.moneda === 'USD' ? 'success' : 'info'}>{i.moneda}</Badge>
                            <Badge variant={i.capitalizable ? 'purple' : 'default'}>
                              {i.capitalizable ? 'Capitalizable' : 'No cap.'}
                            </Badge>
                            <Badge variant={i.estado === 'activo' ? 'success' : i.estado === 'cerrado' ? 'danger' : 'warning'}>
                              {i.estado}
                            </Badge>
                          </div>
                          <span className="font-mono text-slate-800">
                            {formatMoneda(ultimoSaldo.get(i.id) ?? Number(i.capital_inicial), i.moneda)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal} title={editInv ? 'Editar inversor' : 'Nuevo inversor'} className="max-w-md">
        <InversorForm inv={editInv} onClose={() => setModal(false)} />
      </Modal>
    </div>
  )
}
