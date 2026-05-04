'use client'

import { useActionState, useState, useTransition, useMemo } from 'react'
import { createTarjeta, updateTarjeta, toggleTarjetaActiva, marcarCuotaPagada } from '@/app/actions/finanzas'
import type { TarjetaCredito, CuotaTarjeta, CuentaTitular } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatMonth } from '@/lib/utils'
import {
  Plus, CreditCard, Pencil, Power, Loader2, Calendar,
  TrendingUp, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  tarjetas: TarjetaCredito[]
  titulares: CuentaTitular[]
  cuotas: (CuotaTarjeta & { tarjeta?: { nombre: string; banco: string } })[]
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

      {error && <p className="text-sm text-red-400">{error}</p>}
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

export function TarjetasClient({ tarjetas, titulares, cuotas }: Props) {
  const [modal, setModal] = useState(false)
  const [editTarjeta, setEditTarjeta] = useState<TarjetaCredito | undefined>()
  const [isPending, startTransition] = useTransition()

  // Proyección de pasivos por mes
  const proyeccion = useMemo(() => {
    const mapa = new Map<string, { total: number; cantidad: number; pagado: number }>()
    for (const c of cuotas) {
      if (c.pagada) {
        const k = c.mes_vencimiento
        if (!mapa.has(k)) mapa.set(k, { total: 0, cantidad: 0, pagado: 0 })
        mapa.get(k)!.pagado += c.monto_cuota
        continue
      }
      const k = c.mes_vencimiento
      if (!mapa.has(k)) mapa.set(k, { total: 0, cantidad: 0, pagado: 0 })
      const v = mapa.get(k)!
      v.total += c.monto_cuota
      v.cantidad += 1
    }
    return Array.from(mapa.entries())
      .map(([mes, v]) => ({ mes, ...v }))
      .sort((a, b) => a.mes.localeCompare(b.mes))
  }, [cuotas])

  const cuotasPendientes = cuotas.filter((c) => !c.pagada)
  const totalPendiente = cuotasPendientes.reduce((s, c) => s + c.monto_cuota, 0)

  // Deuda gastos viejos (ya cerraron pero no se pagaron — vencimiento <= mes actual)
  const mesActual = new Date().toISOString().substring(0, 7)
  const deudaVencida = cuotasPendientes
    .filter((c) => c.mes_vencimiento <= mesActual)
    .reduce((s, c) => s + c.monto_cuota, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Tarjetas de crédito</h1>
          <p className="text-sm text-slate-400 mt-0.5">{tarjetas.length} tarjetas · {cuotasPendientes.length} cuotas pendientes</p>
        </div>
        <Button onClick={() => { setEditTarjeta(undefined); setModal(true) }}>
          <Plus className="w-4 h-4" />
          Nueva tarjeta
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Pasivo total</p>
          <p className="text-xl font-bold text-slate-100">{formatCurrency(totalPendiente)}</p>
          <p className="text-xs text-slate-500 mt-0.5">{cuotasPendientes.length} cuotas</p>
        </div>
        <div className={cn(
          'bg-slate-900 border rounded-xl p-4',
          deudaVencida > 0 ? 'border-red-500/30' : 'border-slate-800'
        )}>
          <p className="text-xs text-slate-400 mb-1">Deuda vencida</p>
          <p className={cn('text-xl font-bold', deudaVencida > 0 ? 'text-red-400' : 'text-slate-100')}>
            {formatCurrency(deudaVencida)}
          </p>
        </div>
        <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Próximo vencimiento</p>
          {proyeccion[0] ? (
            <>
              <p className="text-xl font-bold text-amber-400">{formatCurrency(proyeccion[0].total)}</p>
              <p className="text-xs text-slate-500 mt-0.5">{formatMonth(proyeccion[0].mes)}</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Sin cuotas</p>
          )}
        </div>
      </div>

      {/* Listado de tarjetas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tarjetas.length === 0 ? (
          <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
            <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p className="text-slate-500">No hay tarjetas registradas</p>
          </div>
        ) : (
          tarjetas.map((t) => {
            const cuotasT = cuotas.filter((c) => c.tarjeta_id === t.id && !c.pagada)
            const totalT = cuotasT.reduce((s, c) => s + c.monto_cuota, 0)
            return (
              <div key={t.id} className={cn(
                'bg-slate-900 border rounded-xl p-5',
                !t.activo ? 'border-slate-800 opacity-50' : 'border-slate-800'
              )}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-indigo-400" />
                    <div>
                      <p className="font-semibold text-slate-100">{t.nombre}</p>
                      <p className="text-xs text-slate-500">
                        {t.banco}
                        {t.ultimos_4 && <span className="ml-1 font-mono">···· {t.ultimos_4}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <Badge variant={t.tipo === 'CREDITO' ? 'info' : 'default'}>{t.tipo}</Badge>
                    {t.titular && <span className="text-xs text-slate-500">{t.titular.nombre}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                  <div className="bg-slate-800/60 rounded-lg p-2">
                    <p className="text-slate-500">Cierre</p>
                    <p className="font-mono text-slate-200 font-medium">{t.dia_cierre}</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-2">
                    <p className="text-slate-500">Vencimiento</p>
                    <p className="font-mono text-slate-200 font-medium">{t.dia_vencimiento}</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-2">
                    <p className="text-slate-500">Límite</p>
                    <p className="font-mono text-slate-200 font-medium">
                      {t.limite_ars ? formatCurrency(t.limite_ars) : '—'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                  <div>
                    <p className="text-xs text-slate-400">Pasivo pendiente</p>
                    <p className="text-base font-mono font-bold text-amber-400">{formatCurrency(totalT)}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditTarjeta(t); setModal(true) }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startTransition(() => toggleTarjetaActiva(t.id, !t.activo))}
                    >
                      <Power className={cn('w-3.5 h-3.5', t.activo ? 'text-red-400' : 'text-green-400')} />
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-100">Proyección de pasivos por mes</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-400 uppercase">Mes</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-400 uppercase">Cuotas</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-400 uppercase">Pendiente</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-400 uppercase">Pagado</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-400 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody>
              {proyeccion.map((p) => {
                const vencido = p.mes < mesActual && p.total > 0
                return (
                  <tr key={p.mes} className={cn(
                    'border-b border-slate-800/60',
                    vencido && 'bg-red-500/5'
                  )}>
                    <td className="px-4 py-2 text-slate-200 font-medium">{formatMonth(p.mes)}</td>
                    <td className="px-4 py-2 text-right text-slate-400 text-xs">{p.cantidad}</td>
                    <td className="px-4 py-2 text-right font-mono text-amber-400 font-medium">
                      {formatCurrency(p.total)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-green-400 text-xs">
                      {p.pagado > 0 ? formatCurrency(p.pagado) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {vencido ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-400">
                          <AlertTriangle className="w-3 h-3" /> Vencido
                        </span>
                      ) : p.total === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400">
                          <CheckCircle2 className="w-3 h-3" /> Pagado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-100">Cuotas pendientes ({cuotasPendientes.length})</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-400 uppercase">Concepto</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-400 uppercase">Tarjeta</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-400 uppercase">Vence</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-400 uppercase">Monto</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {cuotasPendientes.map((c) => (
                <tr key={c.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-slate-200">{c.concepto}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{c.tarjeta?.nombre ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{formatMonth(c.mes_vencimiento)}</td>
                  <td className="px-4 py-2 text-right font-mono text-slate-100">{formatCurrency(c.monto_cuota)}</td>
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
    </div>
  )
}
