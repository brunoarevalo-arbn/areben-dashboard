'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createPlanAfip, marcarCuotaPlanPagada, desmarcarCuotaPlanPagada, cancelarPlanAfip, eliminarPlanAfip } from '@/app/actions/planes-afip'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatDate, formatMonth, labelCuenta, ordenarCuentas } from '@/lib/utils'
import { Plus, FileText, CheckCircle2, Loader2, ChevronDown, ChevronRight, Trash2, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConfirmarPagoModal } from './confirmar-pago-modal'

interface Plan {
  id: string
  nombre: string
  numero_plan: string | null
  fecha_inicio: string
  monto_deuda_original: number
  pago_contado: number
  capital_financiado: number
  cantidad_cuotas: number
  monto_cuota: number
  total_a_pagar: number
  intereses: number
  dia_debito: number
  cuenta_debito_id: string | null
  estado: string
  notas: string | null
  cuenta?: { id: string; nombre: string; banco: string } | null
}

interface Cuota {
  id: string
  plan_afip_id: string
  cuota_numero: number
  total_cuotas: number
  capital: number
  interes: number
  monto_total: number
  fecha_vencimiento: string
  pagada: boolean
  fecha_pago: string | null
}

interface Cuenta {
  id: string
  nombre: string
  banco: string
  titular?: { nombre: string } | null
}

interface GastoDisponible {
  id: string
  concepto: string
  monto: number
  mes: string
  fecha_pago: string | null
}

interface Props {
  planes: Plan[]
  cuotas: Cuota[]
  cuentas: Cuenta[]
  gastosDisponibles: GastoDisponible[]
}

export function PlanesAfipClient({ planes, cuotas, cuentas, gastosDisponibles }: Props) {
  const router = useRouter()
  const [crearOpen, setCrearOpen] = useState(false)
  const [expandido, setExpandido] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [confirmarPagoCuota, setConfirmarPagoCuota] = useState<Cuota | null>(null)

  function toggleExpand(id: string) {
    setExpandido((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Stats por plan
  const statsPorPlan = useMemo(() => {
    const m = new Map<string, { pagadas: number; pendientes: number; totalPagado: number; totalPendiente: number; proximoVenc: string | null }>()
    for (const c of cuotas) {
      if (!m.has(c.plan_afip_id)) {
        m.set(c.plan_afip_id, { pagadas: 0, pendientes: 0, totalPagado: 0, totalPendiente: 0, proximoVenc: null })
      }
      const v = m.get(c.plan_afip_id)!
      if (c.pagada) {
        v.pagadas += 1
        v.totalPagado += Number(c.monto_total)
      } else {
        v.pendientes += 1
        v.totalPendiente += Number(c.monto_total)
        if (!v.proximoVenc || c.fecha_vencimiento < v.proximoVenc) {
          v.proximoVenc = c.fecha_vencimiento
        }
      }
    }
    return m
  }, [cuotas])

  const planesActivos = planes.filter((p) => p.estado === 'ACTIVO')
  const totalDeuda = planesActivos.reduce((s, p) => {
    const st = statsPorPlan.get(p.id)
    return s + (st?.totalPendiente ?? 0)
  }, 0)
  const totalIntereses = planesActivos.reduce((s, p) => s + Number(p.intereses), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Planes de Pago AFIP
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">
            Planes vigentes con débito automático. Cada cuota se ve también en Pendientes.
          </p>
        </div>
        <Button onClick={() => setCrearOpen(true)}>
          <Plus className="w-4 h-4" />
          Nuevo plan
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Planes activos</p>
          <p className="text-2xl font-bold text-fg">{planesActivos.length}</p>
        </div>
        <div className="bg-surface border border-amber-500/30 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Deuda pendiente total</p>
          <p className="text-2xl font-bold text-amber-700 font-mono">{formatCurrency(totalDeuda)}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Costo financiero total</p>
          <p className="text-2xl font-bold text-red-700 font-mono">{formatCurrency(totalIntereses)}</p>
        </div>
      </div>

      {/* Lista de planes */}
      {planes.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 text-fg-muted opacity-50" />
          <p className="text-fg font-medium">Sin planes de pago AFIP cargados</p>
          <p className="text-fg-soft text-sm mt-1">Crea el primero con el botón de arriba.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...planes].sort((a, b) => {
            const order = { ACTIVO: 0, TERMINADO: 1, CADUCO: 2, CANCELADO: 3 } as Record<string, number>
            const da = order[a.estado] ?? 4
            const db = order[b.estado] ?? 4
            if (da !== db) return da - db
            return (b.fecha_inicio ?? '').localeCompare(a.fecha_inicio ?? '')
          }).map((p) => {
            const isExp = expandido.has(p.id)
            const st = statsPorPlan.get(p.id) ?? { pagadas: 0, pendientes: 0, totalPagado: 0, totalPendiente: 0, proximoVenc: null }
            const cuotasPlan = cuotas.filter((c) => c.plan_afip_id === p.id).sort((a, b) => a.cuota_numero - b.cuota_numero)
            const avancePct = p.cantidad_cuotas > 0 ? (st.pagadas / p.cantidad_cuotas) * 100 : 0
            return (
              <div key={p.id} className={cn(
                'bg-surface border border-border rounded-xl overflow-hidden',
                p.estado !== 'ACTIVO' && 'opacity-60'
              )}>
                <div
                  className="px-5 py-4 flex items-center justify-between hover:bg-surface-2/30 cursor-pointer flex-wrap gap-3"
                  onClick={() => toggleExpand(p.id)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button type="button" className="p-1 -ml-1 rounded hover:bg-surface-2 text-fg-soft" onClick={(e) => { e.stopPropagation(); toggleExpand(p.id) }}>
                      {isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="min-w-0">
                      <p className="font-semibold text-fg">{p.nombre}</p>
                      <p className="text-xs text-fg-soft">
                        {p.numero_plan && <span className="font-mono">#{p.numero_plan} · </span>}
                        Inicio {formatDate(p.fecha_inicio)} · {p.cantidad_cuotas} cuotas de {formatCurrency(p.monto_cuota)} · Débito día {p.dia_debito}
                        {p.cuenta && <span> en {p.cuenta.banco}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      {p.estado === 'ACTIVO' ? (
                        <>
                          <p className="text-xs text-fg-muted">Pendiente</p>
                          <p className="font-mono font-bold text-amber-700">{formatCurrency(st.totalPendiente)}</p>
                          <p className="text-xs text-fg-soft">{st.pendientes}/{p.cantidad_cuotas} cuotas</p>
                        </>
                      ) : (
                        <>
                          <span className={cn(
                            'inline-block px-2.5 py-1 rounded-full text-xs font-semibold border',
                            p.estado === 'TERMINADO' && 'bg-green-500/10 text-green-700 border-green-500/30',
                            p.estado === 'CADUCO' && 'bg-red-500/10 text-red-700 border-red-500/30',
                            p.estado === 'CANCELADO' && 'bg-surface-2 text-fg-muted border-border'
                          )}>
                            {p.estado === 'TERMINADO' ? 'Terminado' : p.estado === 'CADUCO' ? 'Caduco (refinanciado)' : 'Cancelado'}
                          </span>
                          <p className="text-xs text-fg-soft mt-1">{st.pagadas}/{p.cantidad_cuotas} cuotas pagadas</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Barra de progreso (solo si tiene sentido mostrarla) */}
                {(p.estado === 'ACTIVO' || st.pagadas > 0) && (
                  <div className="px-5 pb-3">
                    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500/50 transition-all" style={{ width: `${avancePct}%` }} />
                    </div>
                    <p className="text-xs text-fg-soft mt-1">
                      {Math.round(avancePct)}% pagado · {formatCurrency(st.totalPagado)} de {formatCurrency(p.total_a_pagar)}
                      {p.intereses > 0 && (
                        <span className="ml-2 text-red-700">Intereses totales: {formatCurrency(p.intereses)}</span>
                      )}
                    </p>
                  </div>
                )}

                {/* Cuotas expandidas */}
                {isExp && (
                  <div className="border-t border-border bg-surface-2/20">
                    <div className="divide-y divide-border/60">
                      {cuotasPlan.map((c) => (
                        <div key={c.id} className="px-5 py-2.5 flex items-center justify-between text-sm">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={cn(
                              'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-mono',
                              c.pagada
                                ? 'bg-green-500/15 text-green-700 border border-green-500/20'
                                : 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                            )}>{c.cuota_numero}</span>
                            <div>
                              <p className="text-fg">{formatDate(c.fecha_vencimiento)}</p>
                              <p className="text-xs text-fg-soft">
                                Capital {formatCurrency(c.capital)} + Interés {formatCurrency(c.interes)}
                                {c.pagada && c.fecha_pago && <span className="text-green-700 ml-2">Pagada el {formatDate(c.fecha_pago)}</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-fg font-medium">{formatCurrency(c.monto_total)}</p>
                            {c.pagada ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startTransition(async () => { await desmarcarCuotaPlanPagada(c.id); router.refresh() })}
                                disabled={isPending}
                                title="Desmarcar pagada"
                              >
                                <X className="w-3.5 h-3.5 text-fg-soft" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="success"
                                onClick={() => setConfirmarPagoCuota(c)}
                                disabled={isPending}
                                title="Marcar pagada (pide fecha del débito)"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="px-5 py-3 border-t border-border bg-surface-2/40 flex items-center justify-between">
                      <div className="text-xs text-fg-soft">
                        Capital financiado: {formatCurrency(p.capital_financiado)} · Total a pagar: {formatCurrency(p.total_a_pagar)} · Intereses: {formatCurrency(p.intereses)}
                      </div>
                      <div className="flex gap-2">
                        {p.estado === 'ACTIVO' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              if (!confirm(`¿Cancelar el plan "${p.nombre}"? Marcará el plan como CANCELADO pero no toca los datos.`)) return
                              startTransition(async () => { await cancelarPlanAfip(p.id); router.refresh() })
                            }}
                            disabled={isPending}
                          >
                            Cancelar plan
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            if (!confirm(`¿Eliminar el plan "${p.nombre}"? Borra el plan y todas sus cuotas. Los gastos vinculados vuelven a PENDIENTE.`)) return
                            startTransition(async () => { await eliminarPlanAfip(p.id); router.refresh() })
                          }}
                          disabled={isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={crearOpen}
        onOpenChange={(o) => { if (!o) setCrearOpen(false) }}
        title="Nuevo plan de pago AFIP"
        className="max-w-2xl"
      >
        <CrearPlanForm
          cuentas={cuentas}
          gastosDisponibles={gastosDisponibles}
          onClose={() => { setCrearOpen(false); router.refresh() }}
        />
      </Modal>

      <ConfirmarPagoModal
        open={!!confirmarPagoCuota}
        onOpenChange={(o) => { if (!o) setConfirmarPagoCuota(null) }}
        title="Marcar cuota pagada"
        descripcion={confirmarPagoCuota ? `Cuota ${confirmarPagoCuota.cuota_numero}/${confirmarPagoCuota.total_cuotas} · vence ${confirmarPagoCuota.fecha_vencimiento}` : undefined}
        monto={confirmarPagoCuota?.monto_total}
        defaultFecha={confirmarPagoCuota?.fecha_vencimiento}
        onConfirm={async (fecha) => {
          if (!confirmarPagoCuota) return
          await marcarCuotaPlanPagada(confirmarPagoCuota.id, fecha)
          setConfirmarPagoCuota(null)
          router.refresh()
        }}
      />
    </div>
  )
}

// ─── CrearPlanForm ───────────────────────────────────────────────────────────

function CrearPlanForm({
  cuentas,
  gastosDisponibles,
  onClose,
}: {
  cuentas: Cuenta[]
  gastosDisponibles: GastoDisponible[]
  onClose: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [numeroPlan, setNumeroPlan] = useState('')
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0])
  const [pagoContado, setPagoContado] = useState(0)
  const [cantidadCuotas, setCantidadCuotas] = useState(6)
  const [montoCuota, setMontoCuota] = useState(0)
  const [diaDebito, setDiaDebito] = useState(15)
  const [cuentaDebitoId, setCuentaDebitoId] = useState(cuentas[0]?.id ?? '')
  const [gastosSeleccionados, setGastosSeleccionados] = useState<Set<string>>(new Set())
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggleGasto(id: string) {
    setGastosSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalGastosSeleccionados = gastosDisponibles
    .filter((g) => gastosSeleccionados.has(g.id))
    .reduce((s, g) => s + Number(g.monto), 0)

  // Capital financiado = total gastos seleccionados − pago contado
  // Si no hay gastos seleccionados, capital se carga manualmente
  const capitalFinanciado = totalGastosSeleccionados > 0
    ? totalGastosSeleccionados - pagoContado
    : 0
  const totalAPagar = montoCuota * cantidadCuotas
  const intereses = totalAPagar - capitalFinanciado

  function submit() {
    setError(null)
    if (!nombre) { setError('Falta el nombre del plan'); return }
    if (capitalFinanciado <= 0) { setError('El capital financiado debe ser positivo. Seleccioná gastos y/o ajustá el pago contado.'); return }
    if (montoCuota <= 0) { setError('El monto de cuota debe ser positivo'); return }
    if (cantidadCuotas <= 0) { setError('Tiene que haber al menos 1 cuota'); return }
    startTransition(async () => {
      try {
        await createPlanAfip({
          nombre,
          numero_plan: numeroPlan || null,
          fecha_inicio: fechaInicio,
          monto_deuda_original: totalGastosSeleccionados,
          pago_contado: pagoContado,
          capital_financiado: capitalFinanciado,
          cantidad_cuotas: cantidadCuotas,
          monto_cuota: montoCuota,
          dia_debito: diaDebito,
          cuenta_debito_id: cuentaDebitoId || null,
          gasto_ids: Array.from(gastosSeleccionados),
          notas: notas || null,
        })
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Nombre del plan"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Cargas Sociales Mayo 2026"
          required
        />
        <Input
          label="Nº de plan AFIP"
          value={numeroPlan}
          onChange={(e) => setNumeroPlan(e.target.value)}
          placeholder="(opcional)"
        />
      </div>

      {/* Selección de gastos a cubrir */}
      {gastosDisponibles.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-fg-muted">
            Gastos de Cargas Sociales a cubrir con el plan
          </label>
          <div className="bg-surface-2 rounded-lg border border-border max-h-48 overflow-y-auto divide-y divide-border/40">
            {gastosDisponibles.map((g) => {
              const checked = gastosSeleccionados.has(g.id)
              return (
                <label
                  key={g.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 hover:bg-surface cursor-pointer',
                    checked && 'bg-orange-500/5'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleGasto(g.id)}
                    className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2 text-orange-600 focus:ring-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-fg truncate">{g.concepto}</p>
                    <p className="text-xs text-fg-soft">{formatMonth(g.mes)}</p>
                  </div>
                  <p className="font-mono text-sm text-fg">{formatCurrency(g.monto)}</p>
                </label>
              )
            })}
          </div>
          {totalGastosSeleccionados > 0 && (
            <p className="text-xs text-fg-soft">
              Seleccionados: {formatCurrency(totalGastosSeleccionados)}
            </p>
          )}
        </div>
      )}
      {gastosDisponibles.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-fg">
            No hay gastos de Cargas Sociales pendientes para vincular. Cargá la nómina primero
            (en <code>/rrhh/nomina</code>) o el plan se crea sin vinculación a gastos existentes.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Pago contado (al inicio)</label>
          <input
            type="number"
            step="0.01"
            value={pagoContado || ''}
            onChange={(e) => setPagoContado(Number(e.target.value))}
            placeholder="0"
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Cantidad de cuotas</label>
          <input
            type="number"
            min="1"
            value={cantidadCuotas || ''}
            onChange={(e) => setCantidadCuotas(Number(e.target.value))}
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Monto de cada cuota</label>
          <input
            type="number"
            step="0.01"
            value={montoCuota || ''}
            onChange={(e) => setMontoCuota(Number(e.target.value))}
            placeholder="0"
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Fecha de inicio</label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Día de débito mensual</label>
          <input
            type="number"
            min="1" max="31"
            value={diaDebito}
            onChange={(e) => setDiaDebito(Number(e.target.value))}
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Cuenta de débito</label>
          <select
            value={cuentaDebitoId}
            onChange={(e) => setCuentaDebitoId(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          >
            <option value="">Sin asignar</option>
            {ordenarCuentas(cuentas).map((c) => <option key={c.id} value={c.id}>{labelCuenta(c)}</option>)}
          </select>
        </div>
      </div>

      {/* Resumen calculado */}
      <div className="bg-surface-2 rounded-lg p-3 space-y-1 border border-border">
        <div className="flex justify-between text-xs">
          <span className="text-fg-muted">Capital financiado:</span>
          <span className="font-mono text-fg">{formatCurrency(capitalFinanciado)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-fg-muted">Total a pagar ({cantidadCuotas} cuotas × {formatCurrency(montoCuota)}):</span>
          <span className="font-mono text-fg">{formatCurrency(totalAPagar)}</span>
        </div>
        <div className="flex justify-between text-sm pt-1 border-t border-border">
          <span className="text-red-700 font-medium">Costo financiero (intereses):</span>
          <span className="font-mono font-bold text-red-700">{formatCurrency(intereses)}</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-fg-muted mb-1">Notas</label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          placeholder="(opcional) referencia, condiciones, etc."
          className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-2 sticky bottom-0 bg-surface pt-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>Cancelar</Button>
        <Button type="button" variant="success" onClick={submit} disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Crear plan
        </Button>
      </div>
    </div>
  )
}
