'use client'

import { useActionState, useState, useTransition, useMemo } from 'react'
import { createTarjeta, updateTarjeta, toggleTarjetaActiva, marcarCuotaPagada, pagarResumenTarjeta } from '@/app/actions/finanzas'
import type { TarjetaCredito, CuotaTarjeta, CuentaTitular } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils'
import {
  Plus, CreditCard, Pencil, Power, Loader2, Calendar,
  TrendingUp, AlertTriangle, CheckCircle2, Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface GastoConTarjeta {
  id: string
  concepto: string
  categoria: string
  monto: number
  mes: string
  fecha: string | null
  fecha_pago: string | null
  estado: string
  tarjeta_id: string | null
  notas: string | null
}

interface RetiroConTarjeta {
  id: string
  socio: string
  socio_id: string | null
  monto_pesos: number
  monto_usd: number
  fecha: string
  mes: string
  tarjeta_id: string | null
  notas: string | null
}

interface SocioLite {
  id: string
  alias: string | null
  nombre: string
}

interface Props {
  tarjetas: (TarjetaCredito & { socio?: SocioLite | null })[]
  titulares: CuentaTitular[]
  cuotas: (CuotaTarjeta & { tarjeta?: { nombre: string; banco: string } })[]
  cuentas: { id: string; nombre: string; banco: string }[]
  gastosConTarjeta: GastoConTarjeta[]
  retirosConTarjeta: RetiroConTarjeta[]
  socios: SocioLite[]
}

// ─── TarjetaForm ──────────────────────────────────────────────────────────────

function TarjetaForm({
  tarjeta,
  titulares,
  onClose,
}: {
  tarjeta?: TarjetaCredito
  titulares: CuentaTitular[]
  onClose: () => void
}) {
  const action = tarjeta ? updateTarjeta.bind(null, tarjeta.id) : createTarjeta
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Titular"
          name="titular_id"
          defaultValue={tarjeta?.titular_id ?? titulares[0]?.id}
          options={[{ value: '', label: '— Sin titular —' }, ...titulares.map((t) => ({ value: t.id, label: t.nombre }))]}
        />
        <Select
          label="Tipo"
          name="tipo"
          defaultValue={tarjeta?.tipo ?? 'CREDITO'}
          options={[
            { value: 'CREDITO', label: 'Crédito' },
            { value: 'DEBITO', label: 'Débito' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Nombre" name="nombre" placeholder="Ej: Galicia Visa Black" defaultValue={tarjeta?.nombre} required />
        <Input label="Banco" name="banco" placeholder="Ej: Galicia" defaultValue={tarjeta?.banco} required />
      </div>

      <Input label="Últimos 4 dígitos" name="ultimos_4" maxLength={4} defaultValue={tarjeta?.ultimos_4 ?? ''} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Día de cierre" name="dia_cierre" type="number" min="1" max="31"
          defaultValue={tarjeta?.dia_cierre ?? 25} required />
        <Input label="Día de vencimiento" name="dia_vencimiento" type="number" min="1" max="31"
          defaultValue={tarjeta?.dia_vencimiento ?? 10} required />
      </div>

      <Input label="Límite (ARS)" name="limite_ars" type="number" step="0.01"
        defaultValue={tarjeta?.limite_ars ?? ''} />

      <Input label="Notas" name="notas" defaultValue={tarjeta?.notas ?? ''} />

      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {tarjeta ? 'Guardar' : 'Crear tarjeta'}
        </Button>
      </div>
    </form>
  )
}

// ─── TarjetasClient ───────────────────────────────────────────────────────────

export function TarjetasClient({ tarjetas, titulares, cuotas, cuentas, gastosConTarjeta, retirosConTarjeta, socios: _socios }: Props) {
  const [modal, setModal] = useState(false)
  const [editTarjeta, setEditTarjeta] = useState<TarjetaCredito | undefined>()
  const [resumenTarjeta, setResumenTarjeta] = useState<TarjetaCredito | null>(null)
  const [detalleTarjeta, setDetalleTarjeta] = useState<(TarjetaCredito & { socio?: SocioLite | null }) | null>(null)
  const [isPending, startTransition] = useTransition()

  // Por tarjeta: total agregado pendiente (cuotas + gastos + retiros)
  const consumosPorTarjeta = useMemo(() => {
    const m = new Map<string, {
      totalCuotas: number
      totalGastos: number
      totalRetiros: number
      qtyCuotas: number
      qtyGastos: number
      qtyRetiros: number
    }>()
    for (const t of tarjetas) {
      m.set(t.id, { totalCuotas: 0, totalGastos: 0, totalRetiros: 0, qtyCuotas: 0, qtyGastos: 0, qtyRetiros: 0 })
    }
    for (const c of cuotas) {
      if (c.pagada) continue
      const v = m.get(c.tarjeta_id)
      if (!v) continue
      v.totalCuotas += Number(c.monto_cuota)
      v.qtyCuotas += 1
    }
    for (const g of gastosConTarjeta) {
      if (g.estado === 'PAGADO') continue
      if (!g.tarjeta_id) continue
      const v = m.get(g.tarjeta_id)
      if (!v) continue
      v.totalGastos += Number(g.monto)
      v.qtyGastos += 1
    }
    for (const r of retirosConTarjeta) {
      if (!r.tarjeta_id) continue
      const v = m.get(r.tarjeta_id)
      if (!v) continue
      v.totalRetiros += Number(r.monto_pesos)
      v.qtyRetiros += 1
    }
    return m
  }, [tarjetas, cuotas, gastosConTarjeta, retirosConTarjeta])

  function totalTarjeta(tarjetaId: string): number {
    const v = consumosPorTarjeta.get(tarjetaId)
    if (!v) return 0
    return v.totalCuotas + v.totalGastos + v.totalRetiros
  }

  // Proyección de pasivos por mes — suma cuotas + gastos + retiros con tarjeta_id.
  // Para retiros/gastos sin fecha_pago explícita, asumimos que el consumo del mes M
  // vence el mes siguiente (regla simple sin mirar día de cierre).
  function mesVencimiento(consumoMes: string): string {
    const [y, m] = consumoMes.split('-').map(Number)
    const d = new Date(y, m, 1) // m es índice 0-11, esto da m+1 efectivo
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const proyeccion = useMemo(() => {
    const mapa = new Map<string, { total: number; cantidad: number; pagado: number }>()

    for (const c of cuotas) {
      const k = c.mes_vencimiento
      if (!mapa.has(k)) mapa.set(k, { total: 0, cantidad: 0, pagado: 0 })
      if (c.pagada) {
        mapa.get(k)!.pagado += Number(c.monto_cuota)
      } else {
        const v = mapa.get(k)!
        v.total += Number(c.monto_cuota)
        v.cantidad += 1
      }
    }

    for (const g of gastosConTarjeta) {
      if (g.estado === 'PAGADO') continue
      const k = g.fecha_pago ? g.fecha_pago.substring(0, 7) : mesVencimiento(g.mes)
      if (!mapa.has(k)) mapa.set(k, { total: 0, cantidad: 0, pagado: 0 })
      const v = mapa.get(k)!
      v.total += Number(g.monto)
      v.cantidad += 1
    }

    for (const r of retirosConTarjeta) {
      const k = mesVencimiento(r.mes)
      if (!mapa.has(k)) mapa.set(k, { total: 0, cantidad: 0, pagado: 0 })
      const v = mapa.get(k)!
      v.total += Number(r.monto_pesos)
      v.cantidad += 1
    }

    return Array.from(mapa.entries())
      .map(([mes, v]) => ({ mes, ...v }))
      .sort((a, b) => a.mes.localeCompare(b.mes))
  }, [cuotas, gastosConTarjeta, retirosConTarjeta])

  const cuotasPendientes = cuotas.filter((c) => !c.pagada)

  // Pasivo total = suma de todas las tarjetas (cuotas + gastos + retiros pendientes)
  const totalPendiente = tarjetas.reduce((s, t) => s + totalTarjeta(t.id), 0)

  // Deuda vencida (cuotas que ya pasaron de mes)
  const mesActual = new Date().toISOString().substring(0, 7)
  const deudaVencida = cuotasPendientes
    .filter((c) => c.mes_vencimiento <= mesActual)
    .reduce((s, c) => s + c.monto_cuota, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">Tarjetas de crédito</h1>
          <p className="text-sm text-fg-muted mt-0.5">{tarjetas.length} tarjetas · {cuotasPendientes.length} cuotas pendientes</p>
        </div>
        <Button onClick={() => { setEditTarjeta(undefined); setModal(true) }}>
          <Plus className="w-4 h-4" />
          Nueva tarjeta
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Pasivo total</p>
          <p className="text-xl font-bold text-fg">{formatCurrency(totalPendiente)}</p>
          <p className="text-xs text-fg-soft mt-0.5">{cuotasPendientes.length} cuotas</p>
        </div>
        <div className={cn(
          'bg-surface border rounded-xl p-4',
          deudaVencida > 0 ? 'border-red-500/30' : 'border-border'
        )}>
          <p className="text-xs text-fg-muted mb-1">Deuda vencida</p>
          <p className={cn('text-xl font-bold', deudaVencida > 0 ? 'text-red-700' : 'text-fg')}>
            {formatCurrency(deudaVencida)}
          </p>
        </div>
        <div className="bg-surface border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Próximo vencimiento</p>
          {proyeccion[0] ? (
            <>
              <p className="text-xl font-bold text-amber-700">{formatCurrency(proyeccion[0].total)}</p>
              <p className="text-xs text-fg-soft mt-0.5">{formatMonth(proyeccion[0].mes)}</p>
            </>
          ) : (
            <p className="text-sm text-fg-soft">Sin cuotas</p>
          )}
        </div>
      </div>

      {/* Listado de tarjetas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tarjetas.length === 0 ? (
          <div className="col-span-2 bg-surface border border-border rounded-xl p-12 text-center">
            <CreditCard className="w-8 h-8 mx-auto mb-2 text-fg-muted" />
            <p className="text-fg-soft">No hay tarjetas registradas</p>
          </div>
        ) : (
          tarjetas.map((t) => {
            const cuotasT = cuotas.filter((c) => c.tarjeta_id === t.id && !c.pagada)
            const totalT = totalTarjeta(t.id)
            const desglose = consumosPorTarjeta.get(t.id)
            return (
              <div key={t.id} className={cn(
                'bg-surface border rounded-xl p-5',
                !t.activo ? 'border-border opacity-50' : 'border-border'
              )}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-semibold text-fg">{t.nombre}</p>
                      <p className="text-xs text-fg-soft">
                        {t.banco}
                        {t.ultimos_4 && <span className="ml-1 font-mono">···· {t.ultimos_4}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <Badge variant={t.tipo === 'CREDITO' ? 'info' : 'default'}>{t.tipo}</Badge>
                    {t.socio && (
                      <span className="text-xs text-fg-soft">
                        Titular: {t.socio.alias ?? t.socio.nombre}
                      </span>
                    )}
                    {!t.socio && t.titular && <span className="text-xs text-fg-soft">{t.titular.nombre}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                  <div className="bg-surface-2/60 rounded-lg p-2">
                    <p className="text-fg-soft">Cierre</p>
                    <p className="font-mono text-fg-muted font-medium">{t.dia_cierre}</p>
                  </div>
                  <div className="bg-surface-2/60 rounded-lg p-2">
                    <p className="text-fg-soft">Vencimiento</p>
                    <p className="font-mono text-fg-muted font-medium">{t.dia_vencimiento}</p>
                  </div>
                  <div className="bg-surface-2/60 rounded-lg p-2">
                    <p className="text-fg-soft">Límite</p>
                    <p className="font-mono text-fg-muted font-medium">
                      {t.limite_ars ? formatCurrency(t.limite_ars) : '—'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div>
                    <p className="text-xs text-fg-muted">Pasivo pendiente</p>
                    <p className="text-base font-mono font-bold text-amber-700">{formatCurrency(totalT)}</p>
                    {desglose && (totalT > 0) && (
                      <p className="text-xs text-fg-soft mt-0.5">
                        {desglose.qtyRetiros > 0 && (
                          <span title="Retiros de socios con esta TC">{desglose.qtyRetiros}R</span>
                        )}
                        {desglose.qtyGastos > 0 && (
                          <span className="ml-1" title="Gastos con esta TC">{desglose.qtyGastos}G</span>
                        )}
                        {desglose.qtyCuotas > 0 && (
                          <span className="ml-1" title="Cuotas pendientes">{desglose.qtyCuotas}C</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {totalT > 0 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setDetalleTarjeta(t)}
                        title="Ver el detalle de qué arma este pasivo"
                      >
                        Ver detalle
                      </Button>
                    )}
                    {cuotasT.length > 0 && (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => setResumenTarjeta(t)}
                        title="Liquidar cuotas con un único pago desde una cuenta"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        Pagar resumen
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setEditTarjeta(t); setModal(true) }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startTransition(() => toggleTarjetaActiva(t.id, !t.activo))}
                    >
                      <Power className={cn('w-3.5 h-3.5', t.activo ? 'text-red-700' : 'text-green-700')} />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Proyección de pasivos */}
      {proyeccion.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-fg">Proyección de pasivos por mes</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Mes</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Cuotas</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Pendiente</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Pagado</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Estado</th>
              </tr>
            </thead>
            <tbody>
              {proyeccion.map((p) => {
                const vencido = p.mes < mesActual && p.total > 0
                return (
                  <tr key={p.mes} className={cn(
                    'border-b border-border/60',
                    vencido && 'bg-red-500/5'
                  )}>
                    <td className="px-4 py-2 text-fg-muted font-medium">{formatMonth(p.mes)}</td>
                    <td className="px-4 py-2 text-right text-fg-muted text-xs">{p.cantidad}</td>
                    <td className="px-4 py-2 text-right font-mono text-amber-700 font-medium">
                      {formatCurrency(p.total)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-green-700 text-xs">
                      {p.pagado > 0 ? formatCurrency(p.pagado) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {vencido ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700">
                          <AlertTriangle className="w-3 h-3" /> Vencido
                        </span>
                      ) : p.total === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <CheckCircle2 className="w-3 h-3" /> Pagado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                          <Calendar className="w-3 h-3" /> Próximo
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalle de cuotas */}
      {cuotasPendientes.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-fg">Cuotas pendientes ({cuotasPendientes.length})</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Concepto</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Tarjeta</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Vence</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Monto</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {cuotasPendientes.map((c) => (
                <tr key={c.id} className="border-b border-border/60 hover:bg-surface-2/30">
                  <td className="px-4 py-2 text-fg-muted">{c.concepto}</td>
                  <td className="px-4 py-2 text-xs text-fg-muted">{c.tarjeta?.nombre ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-fg-muted">{formatMonth(c.mes_vencimiento)}</td>
                  <td className="px-4 py-2 text-right font-mono text-fg">{formatCurrency(c.monto_cuota)}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="success" onClick={() => startTransition(() => marcarCuotaPagada(c.id, true))}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal} onOpenChange={setModal} title={editTarjeta ? 'Editar tarjeta' : 'Nueva tarjeta'} className="max-w-md">
        <TarjetaForm tarjeta={editTarjeta} titulares={titulares} onClose={() => setModal(false)} />
      </Modal>

      <Modal
        open={!!resumenTarjeta}
        onOpenChange={(o) => { if (!o) setResumenTarjeta(null) }}
        title={`Pagar resumen — ${resumenTarjeta?.nombre ?? ''}`}
        className="max-w-lg"
      >
        {resumenTarjeta && (
          <PagarResumenForm
            tarjeta={resumenTarjeta}
            cuotas={cuotas.filter((c) => c.tarjeta_id === resumenTarjeta.id && !c.pagada)}
            cuentas={cuentas}
            onClose={() => setResumenTarjeta(null)}
          />
        )}
      </Modal>

      <Modal
        open={!!detalleTarjeta}
        onOpenChange={(o) => { if (!o) setDetalleTarjeta(null) }}
        title={`Detalle de consumos — ${detalleTarjeta?.nombre ?? ''}`}
        className="max-w-2xl"
      >
        {detalleTarjeta && (
          <DetalleTarjeta
            tarjeta={detalleTarjeta}
            retiros={retirosConTarjeta.filter((r) => r.tarjeta_id === detalleTarjeta.id)}
            gastos={gastosConTarjeta.filter((g) => g.tarjeta_id === detalleTarjeta.id && g.estado !== 'PAGADO')}
            cuotas={cuotas.filter((c) => c.tarjeta_id === detalleTarjeta.id && !c.pagada)}
          />
        )}
      </Modal>
    </div>
  )
}

// ─── DetalleTarjeta ───────────────────────────────────────────────────────────

function DetalleTarjeta({
  tarjeta: _tarjeta,
  retiros,
  gastos,
  cuotas,
}: {
  tarjeta: TarjetaCredito & { socio?: SocioLite | null }
  retiros: RetiroConTarjeta[]
  gastos: GastoConTarjeta[]
  cuotas: CuotaTarjeta[]
}) {
  // Agrupar todo por mes
  const porMes = useMemo(() => {
    const m = new Map<string, { retiros: RetiroConTarjeta[]; gastos: GastoConTarjeta[]; cuotas: CuotaTarjeta[]; total: number }>()
    for (const r of retiros) {
      const k = r.mes
      if (!m.has(k)) m.set(k, { retiros: [], gastos: [], cuotas: [], total: 0 })
      m.get(k)!.retiros.push(r)
      m.get(k)!.total += Number(r.monto_pesos)
    }
    for (const g of gastos) {
      const k = g.mes
      if (!m.has(k)) m.set(k, { retiros: [], gastos: [], cuotas: [], total: 0 })
      m.get(k)!.gastos.push(g)
      m.get(k)!.total += Number(g.monto)
    }
    for (const c of cuotas) {
      const k = c.mes_vencimiento
      if (!m.has(k)) m.set(k, { retiros: [], gastos: [], cuotas: [], total: 0 })
      m.get(k)!.cuotas.push(c)
      m.get(k)!.total += Number(c.monto_cuota)
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [retiros, gastos, cuotas])

  if (porMes.length === 0) {
    return <p className="text-sm text-fg-soft text-center py-6">Sin consumos pendientes en esta tarjeta.</p>
  }

  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto">
      {porMes.map(([mes, data]) => (
        <div key={mes} className="border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-surface-2/40 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-fg">{formatMonth(mes)}</p>
            <p className="text-sm font-mono font-bold text-amber-700">{formatCurrency(data.total)}</p>
          </div>
          <div className="divide-y divide-border/60">
            {data.retiros.map((r) => (
              <div key={`r-${r.id}`} className="px-3 py-2 flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="text-fg truncate">
                    <Badge variant="purple" className="mr-1.5">Retiro {r.socio.split(' ')[0]}</Badge>
                    {r.notas?.replace(/^\[WS [^\]]+\]\s*/, '') ?? '—'}
                  </p>
                  <p className="text-xs text-fg-soft">{formatDate(r.fecha)}</p>
                </div>
                <p className="font-mono text-fg whitespace-nowrap ml-3">{formatCurrency(r.monto_pesos)}</p>
              </div>
            ))}
            {data.gastos.map((g) => (
              <div key={`g-${g.id}`} className="px-3 py-2 flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="text-fg truncate">
                    <Badge variant="info" className="mr-1.5">Gasto</Badge>
                    {g.concepto}
                  </p>
                  <p className="text-xs text-fg-soft">{g.fecha ? formatDate(g.fecha) : '—'} · {g.categoria}</p>
                </div>
                <p className="font-mono text-fg whitespace-nowrap ml-3">{formatCurrency(g.monto)}</p>
              </div>
            ))}
            {data.cuotas.map((c) => (
              <div key={`c-${c.id}`} className="px-3 py-2 flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="text-fg truncate">
                    <Badge variant="default" className="mr-1.5">Cuota {c.cuota_numero}/{c.cuotas_total}</Badge>
                    {c.concepto}
                  </p>
                </div>
                <p className="font-mono text-fg whitespace-nowrap ml-3">{formatCurrency(c.monto_cuota)}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── PagarResumenForm ─────────────────────────────────────────────────────────

function PagarResumenForm({
  tarjeta,
  cuotas,
  cuentas,
  onClose,
}: {
  tarjeta: TarjetaCredito
  cuotas: CuotaTarjeta[]
  cuentas: { id: string; nombre: string; banco: string }[]
  onClose: () => void
}) {
  // Mes por defecto: el más alto entre todas las cuotas vencidas o el mes actual
  const mesActual = new Date().toISOString().substring(0, 7)
  const mesesUnicos = useMemo(() => {
    const set = new Set<string>()
    for (const c of cuotas) set.add(c.mes_vencimiento)
    return Array.from(set).sort()
  }, [cuotas])
  const mesDefault = mesesUnicos.find((m) => m >= mesActual) ?? mesesUnicos[mesesUnicos.length - 1] ?? mesActual

  const [hastaMes, setHastaMes] = useState(mesDefault)
  const [cuentaId, setCuentaId] = useState('')
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0])
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ ok: number; total: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  // Cuotas que se van a pagar con el "hasta mes" elegido
  const cuotasIncluidas = cuotas.filter((c) => c.mes_vencimiento <= hastaMes)
  const totalAPagar = cuotasIncluidas.reduce((s, c) => s + Number(c.monto_cuota), 0)

  function submit() {
    setError(null)
    setResultado(null)
    if (!cuentaId) { setError('Seleccioná la cuenta de origen'); return }
    if (cuotasIncluidas.length === 0) { setError('No hay cuotas para pagar con ese límite'); return }
    startTransition(async () => {
      try {
        const r = await pagarResumenTarjeta({
          tarjetaId: tarjeta.id,
          hastaMes,
          cuentaOrigenId: cuentaId,
          fechaPago,
        })
        setResultado({ ok: r.ok, total: r.total })
        if (r.errors.length === 0) {
          setTimeout(onClose, 1200)
        } else {
          setError(r.errors.join(' · '))
        }
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-2/60 rounded-lg p-3 border border-border-strong/40">
        <p className="text-xs text-fg-muted uppercase tracking-wider mb-1">Tarjeta</p>
        <p className="text-sm font-medium text-fg">{tarjeta.banco} · {tarjeta.nombre}</p>
        <p className="text-xs text-fg-soft mt-0.5">Día de vencimiento: {tarjeta.dia_vencimiento}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-fg-muted mb-1.5">Pagar hasta el mes</label>
          <input
            type="month"
            value={hastaMes}
            onChange={(e) => setHastaMes(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-border-strong rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
          <p className="text-[10px] text-fg-soft mt-1">Incluye todas las cuotas con vencimiento ≤ este mes</p>
        </div>
        <Input label="Fecha del pago" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
      </div>

      <Select
        label="Cuenta de origen"
        value={cuentaId}
        onChange={(e) => setCuentaId(e.target.value)}
        options={[{ value: '', label: '— Seleccionar cuenta —' }, ...cuentas.map((c) => ({ value: c.id, label: `${c.banco} · ${c.nombre}` }))]}
      />

      <div className="bg-surface-2/40 border border-border-strong/40 rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-border-strong/40 flex items-center justify-between">
          <p className="text-xs font-semibold text-fg-muted">
            Cuotas incluidas ({cuotasIncluidas.length})
          </p>
          <p className="font-mono text-sm font-bold text-amber-700">{formatCurrency(totalAPagar)}</p>
        </div>
        <div className="max-h-48 overflow-y-auto divide-y divide-slate-700/40">
          {cuotasIncluidas.length === 0 ? (
            <p className="px-3 py-3 text-xs text-fg-soft text-center">No hay cuotas con ese límite</p>
          ) : (
            cuotasIncluidas
              .sort((a, b) => a.mes_vencimiento.localeCompare(b.mes_vencimiento))
              .map((c) => (
                <div key={c.id} className="px-3 py-2 flex items-center justify-between text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="text-fg-muted truncate">{c.concepto}</p>
                    <p className="text-fg-soft">
                      {c.fecha_vencimiento ? formatDate(c.fecha_vencimiento) : formatMonth(c.mes_vencimiento)}
                      {c.cuotas_total > 1 && <span className="ml-1">· {c.cuota_numero}/{c.cuotas_total}</span>}
                    </p>
                  </div>
                  <p className="font-mono text-fg ml-2">{formatCurrency(c.monto_cuota)}</p>
                </div>
              ))
          )}
        </div>
      </div>

      {resultado && (
        <p className="text-sm text-green-700 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          ✓ {resultado.ok} cuota(s) pagada(s) por {formatCurrency(resultado.total)}
        </p>
      )}
      {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={submit} disabled={isPending || cuotasIncluidas.length === 0}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Liquidar {cuotasIncluidas.length} cuota(s) — {formatCurrency(totalAPagar)}
        </Button>
      </div>
    </div>
  )
}
