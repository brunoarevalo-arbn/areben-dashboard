'use client'

import { useActionState, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createInversor, updateInversor, toggleInversorActivo } from '@/app/actions/inversiones'
import type { Inversor, Instrumento, EstadoInstrumento } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { RenovarModal } from './renovar-modal'
import { formatMoneda } from '@/lib/inversiones-calc'
import { formatDate, cn } from '@/lib/utils'
import {
  Plus, Pencil, Power, Loader2, PiggyBank, TrendingUp, ChevronRight,
  Briefcase, User, Filter, Calendar, RefreshCw,
} from 'lucide-react'

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
    <form action={formAction} className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Datos básicos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Nombre" name="nombre" defaultValue={inv?.nombre} required />
          <Select label="Tipo" name="tipo" defaultValue={inv?.tipo ?? 'persona_fisica'} options={[
            { value: 'persona_fisica', label: 'Persona física' },
            { value: 'empresa', label: 'Empresa' },
          ]} />
        </div>
        <Textarea label="Notas internas" name="notas" defaultValue={inv?.notas ?? ''} placeholder="Datos del acuerdo, observaciones..." rows={2} />
      </section>

      <section className="space-y-3 pt-3 border-t border-border">
        <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide">
          Identificación formal <span className="text-fg-soft normal-case font-normal">(para comprobantes al inversor)</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="DNI" name="dni" defaultValue={inv?.dni ?? ''} placeholder="12.345.678" />
          <Input label="CUIT" name="cuit" defaultValue={inv?.cuit ?? ''} placeholder="XX-XXXXXXXX-X" />
        </div>
      </section>

      <section className="space-y-3 pt-3 border-t border-border">
        <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Domicilio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Calle y número" name="domicilio_calle" defaultValue={inv?.domicilio_calle ?? ''} placeholder="Ej: Av. Santa Fe 1234" />
          <Input label="Ciudad" name="domicilio_ciudad" defaultValue={inv?.domicilio_ciudad ?? ''} />
          <Input label="Provincia" name="domicilio_provincia" defaultValue={inv?.domicilio_provincia ?? ''} />
          <Input label="Código postal" name="domicilio_cp" defaultValue={inv?.domicilio_cp ?? ''} />
        </div>
      </section>

      <section className="space-y-3 pt-3 border-t border-border">
        <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Contacto</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Email" name="email" type="email" defaultValue={inv?.email ?? ''} placeholder="inversor@email.com" />
          <Input label="Teléfono" name="telefono" defaultValue={inv?.telefono ?? ''} placeholder="+54 11 1234-5678" />
        </div>
      </section>

      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3 pt-3 border-t border-border">
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
  const router = useRouter()
  const [modal, setModal] = useState(false)
  const [editInv, setEditInv] = useState<Inversor | undefined>()
  const [renovarModal, setRenovarModal] = useState<{ instr: Instrumento; saldo: number } | undefined>()
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
          <h1 className="text-2xl font-bold text-fg">Inversiones de Terceros</h1>
          <p className="text-sm text-fg-muted mt-0.5">{inversores.length} inversores · {instrumentos.length} instrumentos</p>
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
        <div className="bg-surface border border-green-500/20 rounded-xl p-5">
          <p className="text-xs text-fg-muted mb-1">Total invertido USD (saldos actuales)</p>
          <p className="text-2xl font-bold text-green-700">{formatMoneda(totalUsd, 'USD')}</p>
        </div>
        <div className="bg-surface border border-orange-500/20 rounded-xl p-5">
          <p className="text-xs text-fg-muted mb-1">Total invertido ARS (saldos actuales)</p>
          <p className="text-2xl font-bold text-primary">{formatMoneda(totalArs, 'ARS')}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Filter className="w-3.5 h-3.5" />
          Filtros:
        </div>
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
        <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer ml-auto">
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
          <div className="bg-surface border border-border rounded-xl p-12 text-center">
            <Briefcase className="w-8 h-8 mx-auto mb-2 text-fg-muted" />
            <p className="text-fg-soft">No hay inversores con esos filtros</p>
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
                  'bg-surface border rounded-xl p-5',
                  !inv.activo ? 'border-border opacity-50' : 'border-border hover:border-border-strong transition-colors'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {inv.tipo === 'empresa' ? <Briefcase className="w-5 h-5 text-primary" /> : <User className="w-5 h-5 text-fg-muted" />}
                    <div>
                      <Link href={`/inversiones/${inv.id}`} className="font-semibold text-fg hover:text-primary transition-colors">
                        {inv.nombre}
                      </Link>
                      <p className="text-xs text-fg-soft">
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
                      <Power className={cn('w-3.5 h-3.5', inv.activo ? 'text-red-700' : 'text-green-700')} />
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
                        <div className="bg-surface-2/40 rounded-lg p-3">
                          <p className="text-xs text-fg-soft">Total USD</p>
                          <p className="text-base font-mono font-bold text-green-700">{formatMoneda(totalUsdInv, 'USD')}</p>
                        </div>
                      )}
                      {totalArsInv > 0 && (
                        <div className="bg-surface-2/40 rounded-lg p-3">
                          <p className="text-xs text-fg-soft">Total ARS</p>
                          <p className="text-base font-mono font-bold text-primary">{formatMoneda(totalArsInv, 'ARS')}</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {insts.map((i) => {
                        const saldoInstr = ultimoSaldo.get(i.id) ?? Number(i.capital_inicial)
                        const dias = i.fecha_fin
                          ? Math.ceil((new Date(`${i.fecha_fin}T00:00:00`).getTime() - Date.now()) / 86_400_000)
                          : null
                        const vencColor = dias === null ? 'text-fg-muted'
                          : dias < 0 ? 'text-red-700 font-medium'
                          : dias <= 7 ? 'text-amber-700 font-medium'
                          : 'text-fg-muted'
                        return (
                          <div key={i.id} className="flex items-center justify-between gap-2 bg-surface-2/30 rounded-lg px-3 py-2 text-sm">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs text-fg-muted">{i.codigo ?? i.id.substring(0, 8)}</span>
                              <Badge variant={i.moneda === 'USD' ? 'success' : 'info'}>{i.moneda}</Badge>
                              <Badge variant={i.capitalizable ? 'purple' : 'default'}>
                                {i.capitalizable ? 'Capitalizable' : 'No cap.'}
                              </Badge>
                              <Badge variant={i.estado === 'activo' ? 'success' : i.estado === 'cerrado' ? 'danger' : 'warning'}>
                                {i.estado}
                              </Badge>
                              {i.fecha_fin && (
                                <span className={cn('inline-flex items-center gap-1 text-xs', vencColor)}>
                                  <Calendar className="w-3 h-3" />
                                  Vence {formatDate(i.fecha_fin)}
                                  {dias !== null && dias < 0 && ' · vencido'}
                                  {dias !== null && dias >= 0 && dias <= 7 && ` · en ${dias}d`}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-fg-muted">{formatMoneda(saldoInstr, i.moneda)}</span>
                              {i.estado === 'activo' && i.fecha_fin && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Renovar"
                                  onClick={() => setRenovarModal({ instr: i, saldo: saldoInstr })}
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal} title={editInv ? 'Editar inversor' : 'Nuevo inversor'} className="max-w-2xl">
        <InversorForm inv={editInv} onClose={() => setModal(false)} />
      </Modal>

      {renovarModal && (
        <Modal
          open={!!renovarModal}
          onOpenChange={(o) => { if (!o) setRenovarModal(undefined) }}
          title={`Renovar ${renovarModal.instr.codigo ?? 'instrumento'}`}
          className="max-w-lg"
        >
          <RenovarModal
            instrumento={renovarModal.instr}
            saldoActual={renovarModal.saldo}
            onDone={(r) => {
              if (r.kind === 'error') alert(`No se pudo renovar:\n\n${r.message}`)
              else { alert(`✓ ${r.message}\n\n${r.detail ?? ''}`); router.refresh() }
            }}
            onClose={() => setRenovarModal(undefined)}
          />
        </Modal>
      )}
    </div>
  )
}
