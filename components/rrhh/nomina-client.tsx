'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { marcarNominaPagada, deleteNomina } from '@/app/actions/rrhh'
import { RegistrarPagoModal, type PagoHistorialItem } from '@/components/finanzas/registrar-pago-modal'
import type { NominaMensual, ConfiguracionAporte, HoraExtraRegistro } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { EstadoBadge } from '@/components/ui/badge'
import { formatCurrency, getMonthOptions, formatMonth } from '@/lib/utils'
import {
  Plus, Trash2, CheckCircle, FileText, Pencil,
  Receipt, Printer, PiggyBank, BadgeCheck,
  Wallet, Users,
} from 'lucide-react'
import { NominaForm } from './nomina-form'
import { LiquidacionMasivaModal } from './liquidacion-masiva-modal'

export interface EmpleadoBasico {
  id: string
  nombre: string
  apellido: string
  dni?: string
  tipo_empleado: string
  sueldo_basico: number
  valor_hora: number
  horas_mensuales: number
  corresponde_aguinaldo: boolean
  porcentaje_aguinaldo: number
  monto_comidas: number
  presentismo_pct: number
  horas_acuerdo_negro: number
  plus_negro_tipo?: 'MONTO' | 'PORCENTAJE' | null
  plus_negro_valor?: number | null
}

// ─── ReciboModal ──────────────────────────────────────────────────────────────

interface ReciboData {
  empleado: { nombre: string; apellido: string; dni?: string; tipo_empleado: string }
  mes: string
  esRecboNegroDeBlanco: boolean
  conceptos: { label: string; monto: number }[]
  descuentos: { label: string; monto: number }[]
  total: number
}

function ReciboModal({ data, onClose }: { data: ReciboData; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const esNegroPuro = data.empleado.tipo_empleado === 'NEGRO' && !data.esRecboNegroDeBlanco
  // Para NEGRO puro: sin firmas, sin banner "RECIBO INTERNO", labels distintos
  const ocultarFirmas = esNegroPuro
  const ocultarBannerInterno = esNegroPuro
  const labelTotal = esNegroPuro ? 'Total' : 'Total a pagar'
  const labelEmpleado = esNegroPuro ? 'Nombre' : 'Empleado'

  function imprimir() {
    if (!ref.current) return
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const html = ref.current.innerHTML
    win.document.write(`
      <!DOCTYPE html><html><head><title>Recibo - ${data.empleado.apellido}, ${data.empleado.nombre}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 30px; color: #000; background: #fff; }
        .recibo { max-width: 600px; margin: 0 auto; border: 2px solid #000; padding: 24px; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        h2 { font-size: 14px; margin: 0 0 16px; color: #555; font-weight: normal; }
        .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ccc; }
        .row:last-child { border: none; }
        .total { margin-top: 16px; padding: 12px; background: #000; color: #fff; display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; }
        .header { border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
        .label { color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        .interno { background: #fef3c7; padding: 6px 10px; font-size: 11px; margin-bottom: 12px; border-left: 3px solid #f59e0b; }
        .firma { margin-top: 40px; display: flex; justify-content: space-between; padding-top: 30px; }
        .firma > div { width: 45%; border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 11px; }
      </style></head>
      <body>${html}<script>setTimeout(() => { window.print(); }, 250)</script></body></html>
    `)
    win.document.close()
  }

  return (
    <div className="space-y-4">
      <div ref={ref}>
        <div className="recibo bg-white text-black p-6 rounded">
          {data.esRecboNegroDeBlanco && (
            <div className="interno bg-amber-50 border-l-4 border-amber-500 px-3 py-2 text-xs text-amber-900 mb-3">
              <strong>RECIBO INTERNO</strong> — Este documento NO reemplaza al recibo de sueldo oficial.
              Corresponde únicamente al adicional no registrado pagado al empleado.
            </div>
          )}
          {!ocultarBannerInterno && !data.esRecboNegroDeBlanco && data.empleado.tipo_empleado === 'NEGRO' && null}

          <div className="header border-b-2 border-black pb-3 mb-4">
            <h1 className="text-lg font-bold mb-1">{esNegroPuro ? 'Detalle de pago' : 'Recibo de pago'}</h1>
            <h2 className="text-sm font-normal text-slate-600">Período: {formatMonth(data.mes)}</h2>
          </div>
          <div className="space-y-1 mb-4 text-sm">
            <div className="row flex justify-between py-1.5 border-b border-dashed border-slate-300">
              <span className="label uppercase text-xs text-slate-500">{labelEmpleado}</span>
              <span>{data.empleado.apellido}, {data.empleado.nombre}</span>
            </div>
            {data.empleado.dni && (
              <div className="row flex justify-between py-1.5 border-b border-dashed border-slate-300">
                <span className="label uppercase text-xs text-slate-500">DNI</span>
                <span>{data.empleado.dni}</span>
              </div>
            )}
            <div className="row flex justify-between py-1.5 border-b border-dashed border-slate-300">
              <span className="label uppercase text-xs text-slate-500">Fecha</span>
              <span>{new Date().toLocaleDateString('es-AR')}</span>
            </div>
          </div>

          <div className="space-y-1 mb-4 text-sm">
            <div className="font-semibold text-xs uppercase text-slate-600 mb-1 mt-2">Conceptos</div>
            {data.conceptos.filter((c) => c.monto > 0).map((c, i) => (
              <div key={i} className="row flex justify-between py-1.5 border-b border-dashed border-slate-300">
                <span>{c.label}</span>
                <span className="font-mono">{formatCurrency(c.monto)}</span>
              </div>
            ))}
          </div>

          {data.descuentos.length > 0 && data.descuentos.some((d) => d.monto > 0) && (
            <div className="space-y-1 mb-4 text-sm">
              <div className="font-semibold text-xs uppercase text-slate-600 mb-1 mt-2">Descuentos</div>
              {data.descuentos.filter((d) => d.monto > 0).map((d, i) => (
                <div key={i} className="row flex justify-between py-1.5 border-b border-dashed border-slate-300">
                  <span>{d.label}</span>
                  <span className="font-mono text-red-700">- {formatCurrency(d.monto)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="total bg-black text-white px-3 py-2 flex justify-between font-bold text-base mt-3">
            <span>{labelTotal.toUpperCase()}</span>
            <span className="font-mono">{formatCurrency(data.total)}</span>
          </div>

          {!ocultarFirmas && (
            <div className="firma flex justify-between mt-12 pt-8">
              <div className="w-[45%] border-t border-black pt-1 text-center text-xs">Firma empleado</div>
              <div className="w-[45%] border-t border-black pt-1 text-center text-xs">Firma empresa</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button>
        <Button type="button" onClick={imprimir}>
          <Printer className="w-4 h-4" />
          Imprimir
        </Button>
      </div>
    </div>
  )
}

// ─── NominaClient ─────────────────────────────────────────────────────────────

interface NominaClientProps {
  nominas: (NominaMensual & { empleado: { nombre: string; apellido: string; dni?: string; tipo_empleado: string } | null })[]
  empleados: EmpleadoBasico[]
  aportes: ConfiguracionAporte[]
  mes: string
  horasExtrasMes: HoraExtraRegistro[]
  cajaAguinaldos: Record<string, number>
  cuentas: { id: string; nombre: string; banco: string }[]
}

export function NominaClient({ nominas, empleados, aportes, mes, horasExtrasMes, cajaAguinaldos, cuentas }: NominaClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [editNomina, setEditNomina] = useState<NominaMensual | null>(null)
  const [recibo, setRecibo] = useState<ReciboData | null>(null)
  const [pagosNomina, setPagosNomina] = useState<typeof nominas[number] | null>(null)
  const [liqMasivaOpen, setLiqMasivaOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Quick action: ?nuevo=1 abre el modal de nueva nómina automáticamente
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') {
      setModalOpen(true)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('nuevo')
      router.replace(`?${params.toString()}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nominasExistentes = nominas.map((n) => n.empleado_id)
  const totalNeto = nominas.reduce((s, n) => s + n.neto, 0)
  const totalCosto = nominas.reduce((s, n) => s + n.costo_empresa, 0)
  const totalProvisionAg = nominas.reduce((s, n) => s + (n.aguinaldo_provisionado || 0), 0)
  // Saldo real: total - suma de pagos parciales (excluyendo nóminas ya marcadas PAGADAS)
  const totalPendiente = nominas
    .filter((n) => n.estado !== 'PAGADO')
    .reduce((s, n) => s + (n.saldo_pendiente ?? n.neto), 0)
  const totalPagadoParcial = nominas.reduce((s, n) => s + (n.total_pagado ?? 0), 0)
  const totalCaja = Object.values(cajaAguinaldos).reduce((s, v) => s + v, 0)

  function generarRecibo(n: typeof nominas[number], modo: 'COMPLETO' | 'INTERNO_NEGRO') {
    if (!n.empleado) return
    const esBlanco = n.empleado.tipo_empleado === 'BLANCO'
    const horas_extras_monto = n.horas_extras * n.valor_hora * (1 + (n.porcentaje_extras || 50) / 100)

    if (modo === 'INTERNO_NEGRO' && esBlanco) {
      setRecibo({
        empleado: n.empleado,
        mes: n.mes,
        esRecboNegroDeBlanco: true,
        conceptos: [{ label: 'Adicional no registrado', monto: n.adicional_no_registrado }],
        descuentos: [],
        total: n.adicional_no_registrado,
      })
      return
    }

    const conceptos = [
      {
        label: esBlanco
          ? `Sueldo básico (${n.horas_trabajadas} hs × ${formatCurrency(n.valor_hora)})`
          : 'Sueldo básico',
        monto: n.sueldo_basico,
      },
      { label: `Horas extras (${n.horas_extras} hs al ${n.porcentaje_extras || 50}%)`, monto: horas_extras_monto },
      { label: 'Comida', monto: n.comida },
      { label: 'Presentismo', monto: n.presentismo_monto || 0 },
      { label: 'Aguinaldo (caja)', monto: n.aguinaldo_pagado_de_caja || 0 },
      ...((n.bono_monto ?? 0) > 0 ? [{
        label: `${(n.bono_concepto ?? 'Bono')[0] + (n.bono_concepto ?? 'Bono').slice(1).toLowerCase()}${n.bono_descripcion ? ` — ${n.bono_descripcion}` : ''}`,
        monto: n.bono_monto ?? 0,
      }] : []),
    ]

    const descuentos: { label: string; monto: number }[] = []
    if ((n.ausencias_descuento ?? 0) > 0) {
      const horas = n.ausencias_horas ?? 0
      descuentos.push({
        label: `Faltas / ausencias (${horas} hs)${n.ausencias_motivo ? ` — ${n.ausencias_motivo}` : ''}`,
        monto: n.ausencias_descuento ?? 0,
      })
    }
    if ((n.descuento_otro_monto ?? 0) > 0) {
      const concepto = n.descuento_otro_concepto
        ? n.descuento_otro_concepto.replace('_', ' ').toLowerCase()
        : 'Descuento'
      descuentos.push({
        label: `${concepto.charAt(0).toUpperCase() + concepto.slice(1)}${n.descuento_otro_descripcion ? ` — ${n.descuento_otro_descripcion}` : ''}`,
        monto: n.descuento_otro_monto ?? 0,
      })
    }

    setRecibo({
      empleado: n.empleado,
      mes: n.mes,
      esRecboNegroDeBlanco: false,
      conceptos,
      descuentos,
      // Total = neto que efectivamente se paga (sin descontar aportes empleado, eso lo maneja el recibo oficial externo)
      total: n.neto,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Nómina</h1>
          <p className="text-sm text-slate-400 mt-0.5">{nominas.length} empleados · {formatMonth(mes)}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={searchParams.get('mes') ?? mes}
            onChange={(e) => router.push(`?mes=${e.target.value}`)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {getMonthOptions().map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={() => setLiqMasivaOpen(true)}
            title="Liquidar varios empleados a la vez con sus valores por defecto"
          >
            <Users className="w-4 h-4" />
            Liquidación masiva
          </Button>
          <Button onClick={() => setModalOpen(true)} title="Crear una nómina completa con todos los detalles">
            <Plus className="w-4 h-4" />
            Nueva nómina
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total neto', value: totalNeto, color: 'text-slate-100' },
          { label: 'Pagado a cuenta', value: totalPagadoParcial, color: 'text-green-400' },
          { label: 'Pendiente real', value: totalPendiente, color: 'text-amber-400' },
          { label: 'Costo empresa', value: totalCosto, color: 'text-indigo-400' },
        ].map((item) => (
          <div key={item.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{formatCurrency(item.value)}</p>
          </div>
        ))}
      </div>

      {/* Caja Aguinaldos por empleado */}
      {totalCaja > 0 && (
        <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <PiggyBank className="w-4 h-4 text-amber-400" />
              Caja de Aguinaldos (acumulado disponible)
            </h2>
            <span className="text-sm font-mono font-bold text-amber-400">{formatCurrency(totalCaja)}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(cajaAguinaldos).filter(([, v]) => v > 0).map(([eid, v]) => {
              const emp = empleados.find((e) => e.id === eid)
              if (!emp) return null
              return (
                <div key={eid} className="bg-slate-800/40 rounded-lg p-2 flex items-center justify-between">
                  <span className="text-xs text-slate-300">{emp.apellido}, {emp.nombre}</span>
                  <span className="text-xs font-mono text-amber-400 font-semibold">{formatCurrency(v)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <div className="px-4 py-3 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">{formatMonth(mes)}</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Empleado</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Básico</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Subtotal</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Patronales</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Neto</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Provisión SAC</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Costo emp.</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {nominas.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No hay nómina para {formatMonth(mes)}
                </td>
              </tr>
            ) : (
              nominas.map((n) => {
                const esBlanco = n.empleado?.tipo_empleado === 'BLANCO'
                const tieneAdicional = n.adicional_no_registrado > 0
                const pagado = n.total_pagado ?? 0
                const saldo = n.saldo_pendiente ?? n.neto
                const hayParciales = pagado > 0
                const pagadoPct = n.neto > 0 ? Math.min(100, (pagado / n.neto) * 100) : 0
                return (
                  <tr key={n.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-100">{n.empleado?.apellido}, {n.empleado?.nombre}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-2">
                        {n.empleado?.tipo_empleado}
                        {n.asistencia_completa && <span className="text-green-400 flex items-center gap-0.5"><BadgeCheck className="w-3 h-3" />presentismo</span>}
                        {tieneAdicional && esBlanco && <span className="text-amber-400">+ adicional</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{formatCurrency(n.sueldo_basico)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{formatCurrency(n.subtotal)}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-400">{formatCurrency(n.aportes_patronales)}</td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-mono font-semibold text-green-400">{formatCurrency(n.neto)}</p>
                      {hayParciales && n.estado !== 'PAGADO' && (
                        <div className="mt-1 space-y-0.5">
                          <div className="h-1 w-full bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 transition-all" style={{ width: `${pagadoPct}%` }} />
                          </div>
                          <p className="text-[10px] font-mono text-slate-400">
                            <span className="text-green-400">{formatCurrency(pagado)}</span>
                            {' / '}
                            <span className="text-amber-400">{formatCurrency(saldo)}</span> resta
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-amber-300 text-xs">
                      {n.aguinaldo_provisionado > 0 ? formatCurrency(n.aguinaldo_provisionado) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-indigo-400">{formatCurrency(n.costo_empresa)}</td>
                    <td className="px-4 py-3"><EstadoBadge estado={n.estado} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => generarRecibo(n, 'COMPLETO')} title={esBlanco ? 'Recibo oficial' : 'Detalle pago'}>
                          <Receipt className="w-3.5 h-3.5" />
                        </Button>
                        {esBlanco && tieneAdicional && (
                          <Button size="sm" variant="warning" onClick={() => generarRecibo(n, 'INTERNO_NEGRO')} title="Recibo interno del adicional">
                            <FileText className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditNomina(n); setModalOpen(true) }}
                          title={n.estado === 'PAGADO' ? 'Editar nómina (sólo notas — está pagada)' : 'Editar nómina (cambiar horas extras, faltas, comida, etc.)'}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {n.estado !== 'PAGADO' && (
                          <Button size="sm" variant="ghost" onClick={() => setPagosNomina(n)} title="Cargar pago a cuenta / ver historial de pagos parciales">
                            <Wallet className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {n.estado === 'PENDIENTE' && (
                          <Button size="sm" variant="success" disabled={isPending}
                            title="Marcar nómina como totalmente pagada"
                            onClick={() => startTransition(() => marcarNominaPagada(n.id))}>
                            <CheckCircle className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="danger" disabled={isPending}
                          title="Eliminar nómina"
                          onClick={() => {
                            if (!confirm('¿Eliminar esta nómina?')) return
                            startTransition(() => deleteNomina(n.id))
                          }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          {nominas.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-700 bg-slate-800/50">
                <td className="px-4 py-3 text-sm font-semibold text-slate-300">TOTAL</td>
                <td />
                <td className="px-4 py-3 text-right font-mono font-semibold text-slate-200">{formatCurrency(nominas.reduce((s, n) => s + n.subtotal, 0))}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-amber-400">{formatCurrency(nominas.reduce((s, n) => s + n.aportes_patronales, 0))}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-green-400">{formatCurrency(totalNeto)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-amber-300">{formatCurrency(totalProvisionAg)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-indigo-400">{formatCurrency(totalCosto)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Modal open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) setEditNomina(null) }} title={editNomina ? 'Editar nómina' : 'Nueva nómina'} className="max-w-2xl">
        <NominaForm
          empleados={empleados}
          aportes={aportes}
          mes={mes}
          nominasExistentes={nominasExistentes}
          horasExtrasMes={horasExtrasMes}
          cajaAguinaldos={cajaAguinaldos}
          nomina={editNomina ?? undefined}
          onClose={() => { setModalOpen(false); setEditNomina(null) }}
        />
      </Modal>

      <RegistrarPagoModal
        open={!!pagosNomina}
        onOpenChange={(o) => { if (!o) setPagosNomina(null) }}
        target={pagosNomina ? {
          tipo_origen: 'NOMINA',
          origen_id: pagosNomina.id,
          monto_total: Number(pagosNomina.neto),
          saldo_pendiente: pagosNomina.saldo_pendiente ?? Number(pagosNomina.neto),
          moneda: 'ARS',
          descripcion: `Sueldo ${pagosNomina.empleado?.apellido ?? ''}, ${pagosNomina.empleado?.nombre ?? ''}`.trim(),
          contexto: pagosNomina.mes,
        } : null}
        cuentas={cuentas}
        historial={pagosNomina?.pagos_parciales?.map((p) => ({
          id: p.id,
          fecha_emision: p.fecha,
          fecha_vencimiento: p.fecha_vencimiento,
          monto: Number(p.monto),
          moneda: p.moneda,
          instrumento: p.medio_pago,
          cuenta_id: p.cuenta_id,
          numero_cheque: p.numero_cheque,
          banco_emisor: p.banco_emisor,
          notas: p.notas,
        })) as PagoHistorialItem[] | undefined}
      />

      <Modal
        open={liqMasivaOpen}
        onOpenChange={setLiqMasivaOpen}
        title={`Liquidación masiva — ${formatMonth(mes)}`}
        className="max-w-lg"
      >
        <LiquidacionMasivaModal
          empleados={empleados}
          mes={mes}
          nominasExistentes={nominasExistentes}
          onClose={() => setLiqMasivaOpen(false)}
        />
      </Modal>

      {recibo && (
        <Modal
          open={!!recibo}
          onOpenChange={(o) => { if (!o) setRecibo(null) }}
          title={recibo.esRecboNegroDeBlanco ? 'Recibo interno (adicional no registrado)' : 'Detalle de pago'}
          className="max-w-2xl"
        >
          <ReciboModal data={recibo} onClose={() => setRecibo(null)} />
        </Modal>
      )}
    </div>
  )
}
