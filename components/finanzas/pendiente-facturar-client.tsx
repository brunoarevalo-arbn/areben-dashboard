'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type {
  FacturacionMes,
  FacturacionPeriodo,
  FacturaEmitida,
  FacturacionDetalle,
} from '@/types/database'
import {
  sincronizarFacturacionGN,
  cerrarCalculoFacturacion,
  reabrirCalculoFacturacion,
  agregarFactura,
  eliminarFactura,
} from '@/app/actions/gestion-nube'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { nombreRevisor, fechaCorta } from '@/lib/saldos-revision'
import { formatCurrency, getMonthOptions, formatMonth, formatDate } from '@/lib/utils'
import { Loader2, RefreshCw, FileText, Lock, LockOpen, Plus, Trash2, AlertTriangle } from 'lucide-react'

type Props = {
  mes: string
  cobrado: FacturacionMes[]
  periodo: FacturacionPeriodo | null
  facturas: FacturaEmitida[]
  detalle: FacturacionDetalle[]
}

export function PendienteFacturarClient({ mes, cobrado, periodo, facturas, detalle }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [alta, setAlta] = useState(false)
  const [nueva, setNueva] = useState({ numero: '', fecha: '', monto: 0 })

  const cerrado = periodo?.estado === 'cerrado'
  // Con el mes cerrado manda el número congelado: es contra ese que se está facturando.
  const totalCobrado = cerrado
    ? Number(periodo?.cobrado_congelado ?? 0)
    : cobrado.reduce((s, f) => s + Number(f.cobrado), 0)
  const totalFacturado = facturas.reduce((s, f) => s + Number(f.monto), 0)
  const pendiente = totalCobrado - totalFacturado

  function setMes(m: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('mes', m)
    router.push(`?${p.toString()}`)
  }

  function correr(fn: () => Promise<{ ok: boolean; mensaje?: string }>, exito: string) {
    setMsg(null)
    start(async () => {
      const r = await fn()
      setMsg({ ok: r.ok, texto: r.mensaje ?? exito })
      if (r.ok) router.refresh()
    })
  }

  const sinClasificar = detalle.filter((d) => d.tipo === 'cuenta_sin_clasificar')
  const compraPendiente = detalle.filter((d) => d.tipo === 'compra_pendiente_facturada')

  return (
    <div className="space-y-4">
      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" /> Pendiente de facturar
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">
            Lo que entró a cuentas Areben en {formatMonth(mes)} y todavía no se facturó
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            options={getMonthOptions(24)}
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="w-40"
          />
          <Button
            variant="secondary"
            onClick={() => correr(() => sincronizarFacturacionGN(mes), 'Sincronizado.')}
            disabled={pending || cerrado}
            title={cerrado ? 'El mes está cerrado: el cobrado quedó congelado' : undefined}
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}{' '}
            Sincronizar
          </Button>
          {cerrado ? (
            <Button
              variant="secondary"
              onClick={() => correr(() => reabrirCalculoFacturacion(mes), 'Mes reabierto.')}
              disabled={pending}
            >
              <LockOpen className="w-4 h-4" /> Reabrir
            </Button>
          ) : (
            <Button
              onClick={() => correr(() => cerrarCalculoFacturacion(mes), 'Cálculo cerrado.')}
              disabled={pending || !totalCobrado}
            >
              <Lock className="w-4 h-4" /> Cerrar cálculo
            </Button>
          )}
        </div>
      </div>

      {msg && (
        <p
          className={`text-sm rounded-lg p-2 ${
            msg.ok ? 'text-fg-soft bg-surface-2' : 'text-danger bg-danger/10'
          }`}
        >
          {msg.texto}
        </p>
      )}

      {/* ── El saldo ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1 flex items-center gap-1">
            Entró a cuentas Areben — hay que facturar hasta acá
            {cerrado && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface-2 text-fg-muted">
                <Lock className="w-2.5 h-2.5" /> congelado
              </span>
            )}
          </p>
          <p className="text-xl font-bold text-fg">{formatCurrency(totalCobrado)}</p>
          {cerrado && periodo?.cerrado_at && (
            <p className="text-[11px] text-fg-soft mt-1">
              Cerrado por {nombreRevisor(periodo.cerrado_por) ?? 'alguien'} el {fechaCorta(periodo.cerrado_at)}
            </p>
          )}
        </div>
        <div className="bg-surface border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Facturado</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totalFacturado)}</p>
          <p className="text-[11px] text-fg-soft mt-1">
            {facturas.length} factura{facturas.length === 1 ? '' : 's'} — de ventas cobradas, no cobradas o libres
          </p>
        </div>
        <div className="bg-surface border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Falta facturar</p>
          <p className={`text-xl font-bold ${pendiente > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {formatCurrency(pendiente)}
          </p>
          {!cerrado && (
            <p className="text-[11px] text-fg-soft mt-1">Cerrá el cálculo antes de empezar a facturar</p>
          )}
        </div>
      </div>

      {/* ── De dónde salió el cobrado ── */}
      {cobrado.length > 0 ? (
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Cuenta de cobro</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Origen</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Cobros</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Cobrado</th>
              </tr>
            </thead>
            <tbody>
              {cobrado.map((f) => (
                <tr key={f.id} className="border-b border-border/60 hover:bg-surface-2/30">
                  <td className="px-4 py-3 text-fg">{f.cuenta}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-2 text-fg-muted">
                      GN {f.cuenta_gn}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-fg-muted">{f.cantidad}</td>
                  <td className="px-4 py-3 text-right font-mono text-fg">{formatCurrency(f.cobrado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-fg-soft text-sm">
          Sin datos para este mes. Apretá <b>Sincronizar</b>. (Si no aparece nada, revisá que haya cuentas
          marcadas como <b>Areben</b> en Configuración → Cuentas de cobro.)
        </div>
      )}

      {/* ── Las facturas emitidas ── */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-fg">Facturas emitidas</h2>
          <Button variant="secondary" onClick={() => setAlta((v) => !v)} disabled={pending}>
            <Plus className="w-4 h-4" /> Cargar factura
          </Button>
        </div>

        {alta && (
          <div className="px-4 py-3 border-b border-border bg-surface-2/40 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <Input
              label="Número"
              value={nueva.numero}
              onChange={(e) => setNueva({ ...nueva, numero: e.target.value })}
              placeholder="A 00002-00000164"
            />
            <Input
              label="Fecha"
              type="date"
              value={nueva.fecha}
              onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })}
            />
            <MoneyInput
              label="Monto"
              value={nueva.monto}
              onChange={(monto) => setNueva({ ...nueva, monto })}
            />
            <Button
              onClick={() =>
                correr(async () => {
                  const r = await agregarFactura({ mes, ...nueva })
                  if (r.ok) {
                    setNueva({ numero: '', fecha: '', monto: 0 })
                    setAlta(false)
                  }
                  return r
                }, 'Factura cargada.')
              }
              disabled={pending || !(nueva.monto > 0)}
            >
              Guardar
            </Button>
          </div>
        )}

        {facturas.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-fg-muted uppercase">Número</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-fg-muted uppercase">Fecha</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-fg-muted uppercase">Origen</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-fg-muted uppercase">Monto</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id} className="border-b border-border/60 hover:bg-surface-2/30">
                  <td className="px-4 py-2.5 text-fg">{f.numero ?? '—'}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{f.fecha ? formatDate(f.fecha) : '—'}</td>
                  <td className="px-4 py-2.5">
                    {f.origen === 'gn' ? (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-2 text-fg-muted">
                        ya facturada en GN
                      </span>
                    ) : (
                      <span className="text-[11px] text-fg-soft">
                        {nombreRevisor(f.cargado_por) ?? 'a mano'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-fg">{formatCurrency(f.monto)}</td>
                  <td className="px-2">
                    {f.origen === 'manual' && (
                      <button
                        onClick={() => correr(() => eliminarFactura(f.id), 'Factura eliminada.')}
                        disabled={pending}
                        className="p-1.5 rounded-md text-fg-soft hover:text-danger hover:bg-danger/10 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-fg-soft">
            Todavía no cargaste ninguna factura de este mes.
          </p>
        )}
      </div>

      {/* ── Detalle técnico ── */}
      {(sinClasificar.length > 0 || compraPendiente.length > 0) && (
        <details className="bg-surface border border-border rounded-xl">
          <summary className="px-4 py-3 text-sm font-semibold text-fg cursor-pointer select-none">
            Detalle técnico
            {sinClasificar.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700">
                <AlertTriangle className="w-3 h-3" /> {sinClasificar.length} cuenta
                {sinClasificar.length === 1 ? '' : 's'} sin clasificar
              </span>
            )}
          </summary>
          <div className="px-4 pb-4 space-y-4 text-sm">
            {sinClasificar.length > 0 && (
              <div>
                <p className="text-xs font-medium text-fg-muted uppercase mb-1.5">
                  Cuentas de cobro que no están en el catálogo
                </p>
                <p className="text-xs text-fg-soft mb-2">
                  Cobran plata en GN pero el dashboard no las conoce, así que hoy no se facturan. Cargalas
                  en Configuración → Cuentas de cobro para que sea una decisión y no un descuido.
                </p>
                <ul className="space-y-1">
                  {sinClasificar.map((d) => (
                    <li key={d.id} className="flex justify-between gap-3 text-fg">
                      <span>{d.referencia}</span>
                      <span className="font-mono text-fg-muted">
                        {formatCurrency(d.monto ?? 0)} · {d.cantidad} cobro{d.cantidad === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {compraPendiente.length > 0 && (
              <div>
                <p className="text-xs font-medium text-fg-muted uppercase mb-1.5">
                  Ventas en «Compra Pendiente» ya facturadas
                </p>
                <p className="text-xs text-fg-soft mb-2">
                  Facturadas pero todavía sin entregar. Para seguimiento.
                </p>
                <ul className="space-y-1">
                  {compraPendiente.map((d) => (
                    <li key={d.id} className="flex justify-between gap-3 text-fg">
                      <span>{d.referencia}</span>
                      <span className="font-mono text-fg-muted">{formatCurrency(d.monto ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      <p className="text-xs text-fg-soft">
        Los dos lados son independientes. <b>Cobrado</b> es todo lo que entró a cuentas Areben en el
        mes y marca <b>hasta cuánto</b> hay que facturar: sale de los cobros de Gestión Nube (monto,
        fecha y cuenta de cada uno), así que una venta pagada mitad en efectivo entra solo por la parte
        que fue a una cuenta Areben, y se imputa por <b>fecha de cobro</b>. <b>Facturado</b> son{' '}
        <b>todas</b> las facturas del mes, por su monto completo, sin importar de qué venta salgan ni
        si esa venta se cobró — incluidas las libres, que se cargan con <i>Cargar factura</i>. Nada de
        esto cuadra con Análisis → Ventas, que mide lo vendido.
      </p>
    </div>
  )
}
