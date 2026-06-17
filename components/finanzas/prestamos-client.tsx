'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createPrestamo, marcarCuotaPrestamoPagada, desmarcarCuotaPrestamoPagada, cancelarPrestamo, eliminarPrestamo } from '@/app/actions/prestamos'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Banknote, CheckCircle2, Loader2, ChevronDown, ChevronRight, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConfirmarPagoModal } from './confirmar-pago-modal'

interface Prestamo {
  id: string
  nombre: string
  acreedor: string
  titular_formal: string | null
  moneda: string
  fecha_inicio: string
  capital_original: number
  total_intereses: number
  total_a_pagar: number
  cantidad_cuotas: number
  dia_pago: number
  cuenta_pago_id: string | null
  estado: string
  notas: string | null
  cuenta?: { id: string; nombre: string; banco: string } | null
}

interface Cuota {
  id: string
  prestamo_id: string
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
}

interface Props {
  prestamos: Prestamo[]
  cuotas: Cuota[]
  cuentas: Cuenta[]
}

export function PrestamosClient({ prestamos, cuotas, cuentas }: Props) {
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

  const statsPorPrestamo = useMemo(() => {
    const m = new Map<string, { pagadas: number; pendientes: number; totalPagado: number; totalPendiente: number; proximoVenc: string | null }>()
    for (const c of cuotas) {
      if (!m.has(c.prestamo_id)) m.set(c.prestamo_id, { pagadas: 0, pendientes: 0, totalPagado: 0, totalPendiente: 0, proximoVenc: null })
      const v = m.get(c.prestamo_id)!
      if (c.pagada) {
        v.pagadas += 1
        v.totalPagado += Number(c.monto_total)
      } else {
        v.pendientes += 1
        v.totalPendiente += Number(c.monto_total)
        if (!v.proximoVenc || c.fecha_vencimiento < v.proximoVenc) v.proximoVenc = c.fecha_vencimiento
      }
    }
    return m
  }, [cuotas])

  const activos = prestamos.filter((p) => p.estado === 'ACTIVO')
  const totalDeuda = activos.reduce((s, p) => s + (statsPorPrestamo.get(p.id)?.totalPendiente ?? 0), 0)
  const totalIntereses = activos.reduce((s, p) => s + Number(p.total_intereses), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Banknote className="w-6 h-6 text-primary" />
            Préstamos
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">Préstamos con cuotas. Cada cuota pendiente aparece en /finanzas/pendientes y devenga el interés del mes en P&L.</p>
        </div>
        <Button onClick={() => setCrearOpen(true)}>
          <Plus className="w-4 h-4" />
          Nuevo préstamo
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Préstamos activos</p>
          <p className="text-2xl font-bold text-fg">{activos.length}</p>
        </div>
        <div className="bg-surface border border-amber-500/30 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Deuda pendiente total</p>
          <p className="text-2xl font-bold text-amber-700 font-mono">{formatCurrency(totalDeuda)}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Intereses totales originales</p>
          <p className="text-2xl font-bold text-red-700 font-mono">{formatCurrency(totalIntereses)}</p>
        </div>
      </div>

      {prestamos.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <Banknote className="w-10 h-10 mx-auto mb-3 text-fg-muted opacity-50" />
          <p className="text-fg font-medium">Sin préstamos cargados</p>
          <p className="text-fg-soft text-sm mt-1">Crea el primero con el botón de arriba.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {prestamos.map((p) => {
            const isExp = expandido.has(p.id)
            const st = statsPorPrestamo.get(p.id) ?? { pagadas: 0, pendientes: 0, totalPagado: 0, totalPendiente: 0, proximoVenc: null }
            const cuotasP = cuotas.filter((c) => c.prestamo_id === p.id).sort((a, b) => a.cuota_numero - b.cuota_numero)
            const avancePct = p.cantidad_cuotas > 0 ? (st.pagadas / p.cantidad_cuotas) * 100 : 0
            return (
              <div key={p.id} className={cn('bg-surface border border-border rounded-xl overflow-hidden', p.estado !== 'ACTIVO' && 'opacity-60')}>
                <div className="px-5 py-4 flex items-center justify-between hover:bg-surface-2/30 cursor-pointer flex-wrap gap-3" onClick={() => toggleExpand(p.id)}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button type="button" className="p-1 -ml-1 rounded hover:bg-surface-2 text-fg-soft" onClick={(e) => { e.stopPropagation(); toggleExpand(p.id) }}>
                      {isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="min-w-0">
                      <p className="font-semibold text-fg">{p.nombre}</p>
                      <p className="text-xs text-fg-soft">
                        {p.acreedor}
                        {p.titular_formal && <span className="ml-1">· Titular: {p.titular_formal}</span>}
                        {' · '}Inicio {formatDate(p.fecha_inicio)} · {p.cantidad_cuotas} cuotas · Día {p.dia_pago}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-fg-muted">Pendiente</p>
                      <p className="font-mono font-bold text-amber-700">{formatCurrency(st.totalPendiente)}</p>
                      <p className="text-xs text-fg-soft">{st.pendientes}/{p.cantidad_cuotas} cuotas</p>
                    </div>
                  </div>
                </div>

                <div className="px-5 pb-3">
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500/50 transition-all" style={{ width: `${avancePct}%` }} />
                  </div>
                  <p className="text-xs text-fg-soft mt-1">
                    {Math.round(avancePct)}% pagado · {formatCurrency(st.totalPagado)} de {formatCurrency(p.total_a_pagar)}
                    {p.total_intereses > 0 && (
                      <span className="ml-2 text-red-700">Intereses totales: {formatCurrency(p.total_intereses)}</span>
                    )}
                  </p>
                </div>

                {isExp && (
                  <div className="border-t border-border bg-surface-2/20">
                    <div className="divide-y divide-border/60">
                      {cuotasP.map((c) => (
                        <div key={c.id} className="px-5 py-2.5 flex items-center justify-between text-sm">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={cn(
                              'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-mono',
                              c.pagada ? 'bg-green-500/15 text-green-700 border border-green-500/20' : 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
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
                              <Button size="sm" variant="ghost" disabled={isPending}
                                onClick={() => startTransition(async () => { await desmarcarCuotaPrestamoPagada(c.id); router.refresh() })}
                                title="Desmarcar pagada">
                                <X className="w-3.5 h-3.5 text-fg-soft" />
                              </Button>
                            ) : (
                              <Button size="sm" variant="success" disabled={isPending}
                                onClick={() => setConfirmarPagoCuota(c)}
                                title="Marcar pagada (pide fecha del débito)">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="px-5 py-3 border-t border-border bg-surface-2/40 flex items-center justify-between">
                      <div className="text-xs text-fg-soft">
                        Capital original: {formatCurrency(p.capital_original)} · Total a pagar: {formatCurrency(p.total_a_pagar)} · Intereses: {formatCurrency(p.total_intereses)}
                      </div>
                      <div className="flex gap-2">
                        {p.estado === 'ACTIVO' && (
                          <Button size="sm" variant="secondary" disabled={isPending}
                            onClick={() => {
                              if (!confirm(`¿Cancelar el préstamo "${p.nombre}"?`)) return
                              startTransition(async () => { await cancelarPrestamo(p.id); router.refresh() })
                            }}>
                            Cancelar
                          </Button>
                        )}
                        <Button size="sm" variant="danger" disabled={isPending}
                          onClick={() => {
                            if (!confirm(`¿Eliminar el préstamo "${p.nombre}"? Borra el préstamo, cuotas y gastos financieros asociados.`)) return
                            startTransition(async () => { await eliminarPrestamo(p.id); router.refresh() })
                          }}>
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
        title="Nuevo préstamo"
        className="max-w-2xl"
      >
        <CrearPrestamoForm cuentas={cuentas} onClose={() => { setCrearOpen(false); router.refresh() }} />
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
          await marcarCuotaPrestamoPagada(confirmarPagoCuota.id, fecha)
          setConfirmarPagoCuota(null)
          router.refresh()
        }}
      />
    </div>
  )
}

function CrearPrestamoForm({ cuentas, onClose }: { cuentas: Cuenta[]; onClose: () => void }) {
  const [nombre, setNombre] = useState('')
  const [acreedor, setAcreedor] = useState('')
  const [titularFormal, setTitularFormal] = useState('')
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS')
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0])
  const [capitalOriginal, setCapitalOriginal] = useState(0)
  const [totalIntereses, setTotalIntereses] = useState(0)
  const [cantidadCuotas, setCantidadCuotas] = useState(6)
  const [diaPago, setDiaPago] = useState(1)
  const [cuentaPagoId, setCuentaPagoId] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const totalAPagar = capitalOriginal + totalIntereses
  const cuotaPromedio = cantidadCuotas > 0 ? totalAPagar / cantidadCuotas : 0

  function submit() {
    setError(null)
    if (!nombre) { setError('Falta nombre'); return }
    if (!acreedor) { setError('Falta acreedor'); return }
    if (capitalOriginal <= 0) { setError('Capital original debe ser positivo'); return }
    if (cantidadCuotas <= 0) { setError('Tiene que haber al menos 1 cuota'); return }

    // Generar las N cuotas con capital + interés repartidos en partes iguales (aproximación simple)
    const capitalPorCuota = Math.round((capitalOriginal / cantidadCuotas) * 100) / 100
    const interesPorCuota = Math.round((totalIntereses / cantidadCuotas) * 100) / 100
    const montoCuota = capitalPorCuota + interesPorCuota
    const hoy = new Date().toISOString().split('T')[0]
    const [y, m] = fechaInicio.split('-').map(Number)
    const cuotasGen = Array.from({ length: cantidadCuotas }, (_, i) => {
      const fecha = new Date(y, m - 1 + i + 1, diaPago)
      const fechaStr = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
      return {
        cuota_numero: i + 1,
        capital: capitalPorCuota,
        interes: interesPorCuota,
        monto_total: montoCuota,
        fecha_vencimiento: fechaStr,
        pagada: fechaStr < hoy,
      }
    })

    startTransition(async () => {
      try {
        await createPrestamo({
          nombre, acreedor, titular_formal: titularFormal || null, moneda, fecha_inicio: fechaInicio,
          capital_original: capitalOriginal, total_intereses: totalIntereses, cantidad_cuotas: cantidadCuotas,
          dia_pago: diaPago, cuenta_pago_id: cuentaPagoId || null, cuotas: cuotasGen, notas: notas || null,
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
        <Input label="Nombre del préstamo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Préstamo BBVA Junio" required />
        <Input label="Acreedor" value={acreedor} onChange={(e) => setAcreedor(e.target.value)} placeholder="Ej: BBVA, La Mutual Médica" required />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Titular formal (si difiere de Areben)" value={titularFormal} onChange={(e) => setTitularFormal(e.target.value)} placeholder="(opcional)" />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Moneda</label>
          <select value={moneda} onChange={(e) => setMoneda(e.target.value as 'ARS' | 'USD')}
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm">
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Capital original</label>
          <input type="number" step="0.01" value={capitalOriginal || ''} onChange={(e) => setCapitalOriginal(Number(e.target.value))} placeholder="0"
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Intereses totales</label>
          <input type="number" step="0.01" value={totalIntereses || ''} onChange={(e) => setTotalIntereses(Number(e.target.value))} placeholder="0"
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Cantidad de cuotas</label>
          <input type="number" min="1" value={cantidadCuotas || ''} onChange={(e) => setCantidadCuotas(Number(e.target.value))}
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Fecha de inicio</label>
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Día de pago</label>
          <input type="number" min="1" max="31" value={diaPago} onChange={(e) => setDiaPago(Number(e.target.value))}
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Cuenta de pago (opcional)</label>
          <select value={cuentaPagoId} onChange={(e) => setCuentaPagoId(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm">
            <option value="">Sin asignar</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.banco} — {c.nombre}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-surface-2 rounded-lg p-3 space-y-1 border border-border">
        <div className="flex justify-between text-xs">
          <span className="text-fg-muted">Total a pagar:</span>
          <span className="font-mono text-fg">{formatCurrency(totalAPagar)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-fg-muted">Cuota promedio ({cantidadCuotas} cuotas):</span>
          <span className="font-mono text-fg">{formatCurrency(cuotaPromedio)}</span>
        </div>
        <p className="text-xs text-fg-soft mt-1">
          Las cuotas se generan con capital + interés repartidos en partes iguales. Si tu préstamo tiene amortización francesa (cuotas con capital/interés variable), después podés editarlas individualmente con SQL o cargarlas via SQL directo desde el inicio.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-fg-muted mb-1">Notas</label>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2}
          className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
      </div>

      {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-2 sticky bottom-0 bg-surface pt-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>Cancelar</Button>
        <Button type="button" variant="success" onClick={submit} disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Crear préstamo
        </Button>
      </div>
    </div>
  )
}
