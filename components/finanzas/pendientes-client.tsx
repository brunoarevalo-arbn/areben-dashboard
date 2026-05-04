'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { acreditarCheque } from '@/app/actions/compras'
import { marcarCuotaPagada, marcarGastoPagado } from '@/app/actions/finanzas'
import type { Instrumento } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils'
import {
  CheckCircle2, AlertTriangle, Clock, FileCheck, Receipt, CreditCard,
  PiggyBank, Loader2, ChevronRight, AlertCircle, Sparkles, Wallet, Pencil,
} from 'lucide-react'
import { editCuotaHistorica } from '@/app/actions/historicos'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { RegistrarPagoModal, type PagoTarget } from './registrar-pago-modal'
import { CargarHistoricoModal, type HistoricoTipo } from './cargar-historico-modal'

interface ChequePendiente {
  id: string
  monto: number
  moneda: string
  fecha_vencimiento: string | null
  fecha_emision: string
  numero_cheque: string | null
  banco_emisor: string | null
  instrumento: string
  compra?: { descripcion: string; proveedor?: { nombre: string } | null } | null
}

interface CuotaPendiente {
  id: string
  concepto: string
  monto_cuota: number
  mes_vencimiento: string
  cuota_numero: number
  cuotas_total: number
  origen_tipo?: string | null
  tarjeta?: { nombre: string; banco: string } | null
  total_pagado?: number
  saldo_pendiente?: number
}

interface PagoCtaCte {
  id: string
  monto: number
  moneda: string
  fecha_vencimiento: string | null
  fecha_emision: string
  instrumento: string
  numero_cuota: number | null
  total_cuotas: number | null
  compra?: { descripcion: string; proveedor?: { nombre: string } | null } | null
}

interface CompraSinPlanPago {
  id: string
  descripcion: string
  fecha: string
  saldo_pendiente: number
  monto_total: number
  moneda: string
  proveedor?: { nombre: string } | null
}

interface GastoPend {
  id: string
  concepto: string
  categoria: string
  monto: number
  monto_neto: number
  moneda: string
  fecha_pago: string | null
  mes: string
  cuenta_id?: string | null
  total_pagado?: number
  saldo_pendiente?: number
}

type InstrumentoProximo = Omit<Instrumento, 'inversor'> & {
  inversor?: { nombre: string } | null
}

interface Props {
  mesActual: string
  hoy: string
  saldoActualARS: number
  saldoActualUSD: number
  cheques: ChequePendiente[]
  pagosCtaCte: PagoCtaCte[]
  comprasSinPlanPago: CompraSinPlanPago[]
  cuotas: CuotaPendiente[]
  instrumentosProximos: InstrumentoProximo[]
  gastosPendientes: GastoPend[]
  cuentas: { id: string; nombre: string; banco: string }[]
  tarjetas: { id: string; nombre: string; banco: string }[]
  proveedores: { id: string; nombre: string }[]
}

type GrupoFecha = 'VENCIDO' | 'ESTA_SEMANA' | 'ESTE_MES' | 'FUTURO'

function clasificarFecha(fecha: string, hoy: string): GrupoFecha {
  if (fecha < hoy) return 'VENCIDO'
  const f = new Date(fecha + 'T00:00:00')
  const h = new Date(hoy + 'T00:00:00')
  const diffDias = Math.ceil((f.getTime() - h.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDias <= 7) return 'ESTA_SEMANA'
  // fin de mes actual
  const finMes = new Date(h.getFullYear(), h.getMonth() + 1, 0)
  if (f <= finMes) return 'ESTE_MES'
  return 'FUTURO'
}

function fechaCuota(mes: string): string {
  return `${mes}-10` // típicamente las cuotas vencen alrededor del 10
}

function diasHasta(fecha: string, hoy: string): number {
  const f = new Date(fecha + 'T00:00:00')
  const h = new Date(hoy + 'T00:00:00')
  return Math.ceil((f.getTime() - h.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Saldo proyectado ──────────────────────────────────────────────────────────

function calcularSaldoProyectado(
  fechaObjetivo: string,
  moneda: 'ARS' | 'USD',
  saldoActual: number,
  cheques: ChequePendiente[],
  cuotas: CuotaPendiente[],
  cuotasMonedaARS = true,
): number {
  // Otros cheques pendientes con vencimiento <= fechaObjetivo (mismo currency)
  const otrosChequesAnteriores = cheques
    .filter((c) =>
      c.moneda === moneda &&
      c.fecha_vencimiento &&
      c.fecha_vencimiento < fechaObjetivo
    )
    .reduce((s, c) => s + Number(c.monto), 0)

  // Cuotas tarjeta no pagadas con vencimiento <= mes del cheque (asumimos ARS)
  const mesObjetivo = fechaObjetivo.substring(0, 7)
  const cuotasAnteriores = (moneda === 'ARS' && cuotasMonedaARS)
    ? cuotas
        .filter((c) => c.mes_vencimiento <= mesObjetivo)
        .reduce((s, c) => s + Number(c.monto_cuota), 0)
    : 0

  return saldoActual - otrosChequesAnteriores - cuotasAnteriores
}

// ─── Item Renderers ────────────────────────────────────────────────────────────

function ChequeItem({
  cheque, hoy, saldoActualARS, saldoActualUSD, otrosCheques, cuotas, onAcreditar,
}: {
  cheque: ChequePendiente
  hoy: string
  saldoActualARS: number
  saldoActualUSD: number
  otrosCheques: ChequePendiente[]
  cuotas: CuotaPendiente[]
  onAcreditar: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const moneda = (cheque.moneda === 'USD' ? 'USD' : 'ARS') as 'USD' | 'ARS'
  const fechaVenc = cheque.fecha_vencimiento

  if (!fechaVenc) return null

  const otros = otrosCheques.filter((c) => c.id !== cheque.id)
  const saldoBase = moneda === 'USD' ? saldoActualUSD : saldoActualARS
  const saldoProyectado = calcularSaldoProyectado(fechaVenc, moneda, saldoBase, otros, cuotas)
  const margen = saldoProyectado - cheque.monto
  const margenPct = cheque.monto > 0 ? margen / cheque.monto : 0

  let indicador: 'verde' | 'amarillo' | 'rojo'
  if (saldoProyectado < cheque.monto) indicador = 'rojo'
  else if (margenPct < 0.2) indicador = 'amarillo'
  else indicador = 'verde'

  const dias = diasHasta(fechaVenc, hoy)

  return (
    <div className={cn(
      'border-l-4 transition-colors',
      indicador === 'rojo' && 'border-red-500 bg-red-500/5',
      indicador === 'amarillo' && 'border-amber-500 bg-amber-500/5',
      indicador === 'verde' && 'border-transparent hover:bg-slate-800/40',
    )}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <FileCheck className={cn(
            'w-4 h-4 shrink-0',
            cheque.instrumento === 'ECHEQ' ? 'text-orange-400' : 'text-amber-400'
          )} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100 truncate">
              {cheque.compra?.proveedor?.nombre ?? cheque.compra?.descripcion ?? '—'}
              {cheque.numero_cheque && (
                <span className="text-xs text-slate-500 ml-2 font-mono">Nº {cheque.numero_cheque}</span>
              )}
            </p>
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <span>Acredita {formatDate(fechaVenc)}</span>
              {/* Cheque pasado fecha pero no acreditado: aún disponible para cobrar (no es deadline rígido) */}
              {dias < 0 && Math.abs(dias) <= 30 && (
                <span className="text-slate-400">(disponible — esperando depósito)</span>
              )}
              {dias < 0 && Math.abs(dias) > 30 && (
                <span className="text-red-400">({Math.abs(dias)} días sin cobrar — revisar)</span>
              )}
              {dias === 0 && <span className="text-amber-400">(disponible hoy)</span>}
              {dias > 0 && dias <= 7 && <span className="text-amber-400">(en {dias} días)</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="font-mono text-sm text-slate-100">{formatCurrency(cheque.monto, moneda)}</p>
            <div className={cn(
              'inline-flex items-center gap-1 text-[10px] font-medium mt-0.5',
              indicador === 'rojo' && 'text-red-400',
              indicador === 'amarillo' && 'text-amber-400',
              indicador === 'verde' && 'text-green-400',
            )}>
              {indicador === 'verde' && <><CheckCircle2 className="w-3 h-3" />Saldo OK</>}
              {indicador === 'amarillo' && <><AlertTriangle className="w-3 h-3" />Margen ajustado</>}
              {indicador === 'rojo' && <><AlertCircle className="w-3 h-3" />Saldo insuficiente</>}
            </div>
          </div>
          <Button
            size="sm"
            variant="success"
            disabled={isPending}
            onClick={() => startTransition(async () => { await acreditarCheque(cheque.id); onAcreditar() })}
            title="Confirmar acreditación del cheque"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Acreditar
          </Button>
        </div>
      </div>
      {(indicador === 'rojo' || indicador === 'amarillo') && (
        <div className={cn(
          'px-4 pb-2 -mt-1 text-xs flex items-center gap-3',
          indicador === 'rojo' ? 'text-red-300' : 'text-amber-300'
        )}>
          <span>Saldo proyectado al {formatDate(fechaVenc)}: <span className="font-mono">{formatCurrency(saldoProyectado, moneda)}</span></span>
          <span>·</span>
          <span>{indicador === 'rojo'
            ? <>Faltante: <span className="font-mono font-semibold">{formatCurrency(Math.abs(margen), moneda)}</span></>
            : <>Margen: <span className="font-mono">{formatCurrency(margen, moneda)} ({(margenPct * 100).toFixed(0)}%)</span></>
          }</span>
        </div>
      )}
    </div>
  )
}

function CuotaItem({ cuota, onPagar, onPagoParcial, onEditHistorica }: {
  cuota: CuotaPendiente
  onPagar: () => void
  onPagoParcial: (target: PagoTarget) => void
  onEditHistorica: (cuota: CuotaPendiente) => void
}) {
  const [isPending, startTransition] = useTransition()
  const totalPagado = cuota.total_pagado ?? 0
  const saldo = cuota.saldo_pendiente ?? Number(cuota.monto_cuota)
  const hayParciales = totalPagado > 0
  const pagadoPct = Number(cuota.monto_cuota) > 0 ? Math.min(100, (totalPagado / Number(cuota.monto_cuota)) * 100) : 0
  const esHistorica = cuota.origen_tipo === 'MANUAL'

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <CreditCard className="w-4 h-4 text-indigo-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-100 truncate">
            {cuota.concepto}
            {esHistorica && <Badge variant="warning" className="text-[10px] ml-2">histórica</Badge>}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {cuota.tarjeta?.nombre ?? '—'} · vence {formatMonth(cuota.mes_vencimiento)}
            {cuota.cuotas_total > 1 && <span className="ml-1">({cuota.cuota_numero}/{cuota.cuotas_total})</span>}
          </p>
          {hayParciales && (
            <div className="mt-1 space-y-0.5 max-w-[180px]">
              <div className="h-1 w-full bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 transition-all" style={{ width: `${pagadoPct}%` }} />
              </div>
              <p className="text-[10px] font-mono text-slate-400">
                <span className="text-green-400">{formatCurrency(totalPagado)}</span> pagado · resta <span className="text-amber-400">{formatCurrency(saldo)}</span>
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <p className="font-mono text-sm text-slate-100">{formatCurrency(cuota.monto_cuota)}</p>
        {esHistorica && !hayParciales && (
          <Button size="sm" variant="ghost" onClick={() => onEditHistorica(cuota)} title="Editar cuota histórica">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPagoParcial({
            tipo_origen: 'CUOTA',
            origen_id: cuota.id,
            monto_total: Number(cuota.monto_cuota),
            saldo_pendiente: saldo,
            descripcion: cuota.concepto,
            contexto: `${cuota.tarjeta?.banco ?? ''} ${cuota.tarjeta?.nombre ?? ''} · cuota ${cuota.cuota_numero}/${cuota.cuotas_total}`,
          })}
          title="Pago parcial o a cuenta de esta cuota"
        >
          <Wallet className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm"
          variant="success"
          disabled={isPending}
          onClick={() => startTransition(async () => { await marcarCuotaPagada(cuota.id, true); onPagar() })}
          title="Marcar cuota como totalmente pagada"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  )
}

function GastoPendItem({ gasto, hoy, cuentas, onPagoParcial }: { gasto: GastoPend; hoy: string; cuentas: { id: string; nombre: string; banco: string }[]; onPagoParcial: (t: PagoTarget) => void }) {
  const [pagarOpen, setPagarOpen] = useState(false)
  const moneda = (gasto.moneda === 'USD' ? 'USD' : 'ARS') as 'USD' | 'ARS'
  const fecha = gasto.fecha_pago
  const dias = fecha ? diasHasta(fecha, hoy) : null
  const esSueldo = gasto.categoria === 'Sueldos'
  const totalPagado = gasto.total_pagado ?? 0
  const saldo = gasto.saldo_pendiente ?? Number(gasto.monto)
  const hayParciales = totalPagado > 0
  const pagadoPct = Number(gasto.monto) > 0 ? Math.min(100, (totalPagado / Number(gasto.monto)) * 100) : 0

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {esSueldo ? (
            <CreditCard className="w-4 h-4 text-purple-400 shrink-0" />
          ) : (
            <Receipt className="w-4 h-4 text-indigo-400 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100 truncate">{gasto.concepto}</p>
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <span>{gasto.categoria}</span>
              {fecha && <><span>·</span><span>vence {formatDate(fecha)}</span></>}
              {dias !== null && dias < 0 && <span className="text-red-400">({Math.abs(dias)} días vencido)</span>}
              {dias !== null && dias >= 0 && dias <= 7 && <span className="text-amber-400">(en {dias} días)</span>}
            </p>
            {hayParciales && (
              <div className="mt-1 space-y-0.5 max-w-[180px]">
                <div className="h-1 w-full bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 transition-all" style={{ width: `${pagadoPct}%` }} />
                </div>
                <p className="text-[10px] font-mono text-slate-400">
                  <span className="text-green-400">{formatCurrency(totalPagado, moneda)}</span> pagado · resta <span className="text-amber-400">{formatCurrency(saldo, moneda)}</span>
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <p className="font-mono text-sm text-slate-100">{formatCurrency(gasto.monto, moneda)}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onPagoParcial({
              tipo_origen: 'GASTO',
              origen_id: gasto.id,
              monto_total: Number(gasto.monto),
              saldo_pendiente: saldo,
              moneda,
              descripcion: gasto.concepto,
              contexto: gasto.categoria,
              default_cuenta_id: gasto.cuenta_id ?? null,
            })}
            title="Pago parcial o a cuenta de este gasto"
          >
            <Wallet className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="success"
            onClick={() => setPagarOpen(true)}
            title="Marcar pagado con cuenta de origen (pago total simple)"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {pagarOpen && (
        <PagarGastoInline
          gasto={gasto}
          cuentas={cuentas}
          onClose={() => setPagarOpen(false)}
        />
      )}
    </>
  )
}

function PagarGastoInline({ gasto, cuentas, onClose }: { gasto: GastoPend; cuentas: { id: string; nombre: string; banco: string }[]; onClose: () => void }) {
  const [cuentaId, setCuentaId] = useState(gasto.cuenta_id ?? '')
  const [fechaPago, setFechaPago] = useState(gasto.fecha_pago ?? new Date().toISOString().split('T')[0])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function confirmar() {
    setError(null)
    if (!cuentaId) {
      setError('Seleccioná la cuenta de origen del pago')
      return
    }
    startTransition(async () => {
      try {
        await marcarGastoPagado(gasto.id, cuentaId, fechaPago)
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="px-4 py-3 bg-slate-800/60 border-t border-slate-700/40 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="date"
          value={fechaPago}
          onChange={(e) => setFechaPago(e.target.value)}
          className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
          className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:col-span-2"
        >
          <option value="">— Cuenta de origen —</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.banco} · {c.nombre}</option>)}
        </select>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button size="sm" variant="success" onClick={confirmar} disabled={isPending}>
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Confirmar pago
        </Button>
      </div>
    </div>
  )
}

function PagoCtaCteItem({ pago, hoy, onAcreditar }: { pago: PagoCtaCte; hoy: string; onAcreditar: () => void }) {
  const [isPending, startTransition] = useTransition()
  const moneda = (pago.moneda === 'USD' ? 'USD' : 'ARS') as 'USD' | 'ARS'
  const fecha = pago.fecha_vencimiento
  if (!fecha) return null
  const dias = diasHasta(fecha, hoy)
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Receipt className="w-4 h-4 text-blue-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-100 truncate">
            {pago.compra?.proveedor?.nombre ?? pago.compra?.descripcion ?? '—'}
            {pago.numero_cuota && pago.total_cuotas && pago.total_cuotas > 1 && (
              <span className="ml-2 text-xs text-slate-500">cuota {pago.numero_cuota}/{pago.total_cuotas}</span>
            )}
          </p>
          <p className="text-xs text-slate-500 flex items-center gap-2">
            <span>Cta. corriente · vence {formatDate(fecha)}</span>
            {dias < 0 && <span className="text-red-400">({Math.abs(dias)} días vencido)</span>}
            {dias > 0 && dias <= 7 && <span className="text-amber-400">(en {dias} días)</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <p className="font-mono text-sm text-slate-100">{formatCurrency(pago.monto, moneda)}</p>
        <Button
          size="sm"
          variant="success"
          disabled={isPending}
          onClick={() => startTransition(async () => { await acreditarCheque(pago.id); onAcreditar() })}
          title="Marcar como pagado"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Pagar
        </Button>
      </div>
    </div>
  )
}

function CompraSinPlanItem({ compra, onPagoParcial }: { compra: CompraSinPlanPago; onPagoParcial: (t: PagoTarget) => void }) {
  const moneda = (compra.moneda === 'USD' ? 'USD' : 'ARS') as 'USD' | 'ARS'
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-100 truncate">
            {compra.proveedor?.nombre ?? compra.descripcion}
          </p>
          <p className="text-xs text-slate-500">
            Compra del {formatDate(compra.fecha)} · sin plan de pago registrado
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className="font-mono text-sm text-amber-400 font-semibold">{formatCurrency(compra.saldo_pendiente, moneda)}</p>
          <p className="text-[10px] text-slate-500">de {formatCurrency(compra.monto_total, moneda)}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPagoParcial({
            tipo_origen: 'COMPRA',
            origen_id: compra.id,
            monto_total: Number(compra.monto_total),
            saldo_pendiente: Number(compra.saldo_pendiente),
            moneda,
            descripcion: compra.proveedor?.nombre ?? compra.descripcion,
            contexto: `Compra del ${formatDate(compra.fecha)}`,
          })}
          title="Registrar pago contra esta compra (parcial o total)"
        >
          <Wallet className="w-3.5 h-3.5" />
        </Button>
        <Link href="/compras/lista">
          <Button size="sm" variant="ghost" title="Ver compra completa">
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  )
}

function InstrumentoItem({ inst, hoy }: { inst: InstrumentoProximo; hoy: string }) {
  const dias = inst.fecha_fin ? diasHasta(inst.fecha_fin, hoy) : 0
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <PiggyBank className="w-4 h-4 text-purple-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-100 truncate">
            {inst.inversor?.nombre ?? '—'}
            {inst.codigo && <span className="text-xs text-slate-500 ml-2 font-mono">{inst.codigo}</span>}
          </p>
          <p className="text-xs text-slate-500 truncate">
            Vence {inst.fecha_fin && formatDate(inst.fecha_fin)} · {dias} día(s)
            {inst.capitalizable ? ' · capitalizable' : ' · no capitalizable'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <p className="font-mono text-sm text-slate-100">{formatCurrency(Number(inst.capital_inicial), inst.moneda)}</p>
        <Link href={`/inversiones/${inst.inversor_id}`}>
          <Button size="sm" variant="ghost" title="Ver detalle del inversor">
            <ChevronRight className="w-3.5 h-3.5" />
            Ver inversor
          </Button>
        </Link>
      </div>
    </div>
  )
}

// ─── Main Client ───────────────────────────────────────────────────────────────

interface ItemConFecha {
  fecha: string
  grupo: GrupoFecha
  tipo: 'cheque' | 'cuota' | 'instrumento' | 'pago_cta_cte' | 'compra_sin_plan' | 'gasto'
  prioridad: number // para ordenar dentro del grupo (cheques rojos primero)
  data: ChequePendiente | CuotaPendiente | InstrumentoProximo | PagoCtaCte | CompraSinPlanPago | GastoPend
}

export function PendientesClient({
  mesActual, hoy, saldoActualARS, saldoActualUSD,
  cheques, pagosCtaCte, comprasSinPlanPago, cuotas, instrumentosProximos,
  gastosPendientes, cuentas, tarjetas, proveedores,
}: Props) {
  const [_tick, setTick] = useState(0)
  const refetch = () => setTick((t) => t + 1)
  const [pagoTarget, setPagoTarget] = useState<PagoTarget | null>(null)
  const [pagoModalOpen, setPagoModalOpen] = useState(false)
  const [historicoTipo, setHistoricoTipo] = useState<HistoricoTipo | null>(null)
  const [historicoMenuOpen, setHistoricoMenuOpen] = useState(false)
  const [editCuotaTarget, setEditCuotaTarget] = useState<CuotaPendiente | null>(null)

  function abrirPagoParcial(target: PagoTarget) {
    setPagoTarget(target)
    setPagoModalOpen(true)
  }

  function abrirHistorico(tipo: HistoricoTipo) {
    setHistoricoMenuOpen(false)
    setHistoricoTipo(tipo)
  }

  // Construir lista unificada
  const items: ItemConFecha[] = useMemo(() => {
    const list: ItemConFecha[] = []

    for (const c of cheques) {
      if (!c.fecha_vencimiento) continue
      const fecha = c.fecha_vencimiento
      // calcular indicador para prioridad
      const otros = cheques.filter((x) => x.id !== c.id)
      const sBase = c.moneda === 'USD' ? saldoActualUSD : saldoActualARS
      const sProy = calcularSaldoProyectado(fecha, c.moneda === 'USD' ? 'USD' : 'ARS', sBase, otros, cuotas)
      const margen = sProy - c.monto
      const margenPct = c.monto > 0 ? margen / c.monto : 0
      const prioridad = sProy < c.monto ? 1 : margenPct < 0.2 ? 5 : 50
      list.push({ fecha, grupo: clasificarFecha(fecha, hoy), tipo: 'cheque', prioridad, data: c })
    }

    for (const c of cuotas) {
      const fecha = fechaCuota(c.mes_vencimiento)
      list.push({ fecha, grupo: clasificarFecha(fecha, hoy), tipo: 'cuota', prioridad: 50, data: c })
    }

    // Pagos a cuenta corriente / a plazo no acreditados
    for (const p of pagosCtaCte) {
      if (!p.fecha_vencimiento) continue
      list.push({ fecha: p.fecha_vencimiento, grupo: clasificarFecha(p.fecha_vencimiento, hoy), tipo: 'pago_cta_cte', prioridad: 50, data: p })
    }

    // Compras con saldo pendiente sin plan de pago — las muestro como "vencidas" si la fecha de compra ya pasó
    for (const c of comprasSinPlanPago) {
      list.push({ fecha: c.fecha, grupo: clasificarFecha(c.fecha, hoy), tipo: 'compra_sin_plan', prioridad: 10, data: c })
    }

    for (const i of instrumentosProximos) {
      if (!i.fecha_fin) continue
      list.push({ fecha: i.fecha_fin, grupo: clasificarFecha(i.fecha_fin, hoy), tipo: 'instrumento', prioridad: 30, data: i })
    }

    // Gastos pendientes (incluye nóminas auto-creadas)
    for (const g of gastosPendientes) {
      const fecha = g.fecha_pago ?? `${g.mes}-15`
      list.push({ fecha, grupo: clasificarFecha(fecha, hoy), tipo: 'gasto', prioridad: g.categoria === 'Sueldos' ? 20 : 50, data: g })
    }

    // Ordenar por (grupo > prioridad > fecha asc)
    return list.sort((a, b) => {
      const ordenGrupo: Record<GrupoFecha, number> = { VENCIDO: 0, ESTA_SEMANA: 1, ESTE_MES: 2, FUTURO: 3 }
      if (ordenGrupo[a.grupo] !== ordenGrupo[b.grupo]) return ordenGrupo[a.grupo] - ordenGrupo[b.grupo]
      if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad
      return a.fecha.localeCompare(b.fecha)
    })
  }, [cheques, pagosCtaCte, comprasSinPlanPago, cuotas, instrumentosProximos, gastosPendientes, mesActual, hoy, saldoActualARS, saldoActualUSD, _tick])

  // Mostrar todos los buckets ahora, incluyendo FUTURO para visualizar cuotas de tarjeta a futuro
  const visibles = items

  // KPIs
  const totalPagosARS = cuotas.reduce((s, c) => s + Number(c.monto_cuota), 0)
    + pagosCtaCte.filter((p) => p.moneda !== 'USD').reduce((s, p) => s + Number(p.monto), 0)
    + comprasSinPlanPago.filter((c) => c.moneda !== 'USD').reduce((s, c) => s + Number(c.saldo_pendiente), 0)
    + gastosPendientes.filter((g) => g.moneda !== 'USD').reduce((s, g) => s + Number(g.monto), 0)
  const totalPagosUSD = pagosCtaCte.filter((p) => p.moneda === 'USD').reduce((s, p) => s + Number(p.monto), 0)
    + comprasSinPlanPago.filter((c) => c.moneda === 'USD').reduce((s, c) => s + Number(c.saldo_pendiente), 0)
    + gastosPendientes.filter((g) => g.moneda === 'USD').reduce((s, g) => s + Number(g.monto), 0)
  const totalCheques = cheques.reduce((s, c) => s + Number(c.monto), 0)
  const chequesInsuficientes = cheques.filter((c) => {
    if (!c.fecha_vencimiento) return false
    const otros = cheques.filter((x) => x.id !== c.id)
    const sBase = c.moneda === 'USD' ? saldoActualUSD : saldoActualARS
    const sProy = calcularSaldoProyectado(c.fecha_vencimiento, c.moneda === 'USD' ? 'USD' : 'ARS', sBase, otros, cuotas)
    return sProy < c.monto
  })

  // Agrupados visibles
  const porGrupo: Record<GrupoFecha, ItemConFecha[]> = {
    VENCIDO: visibles.filter((i) => i.grupo === 'VENCIDO'),
    ESTA_SEMANA: visibles.filter((i) => i.grupo === 'ESTA_SEMANA'),
    ESTE_MES: visibles.filter((i) => i.grupo === 'ESTE_MES'),
    FUTURO: visibles.filter((i) => i.grupo === 'FUTURO' && i.tipo !== 'instrumento'),
  }

  function renderItem(it: ItemConFecha, key: number) {
    if (it.tipo === 'cheque') {
      return <ChequeItem
        key={key}
        cheque={it.data as ChequePendiente}
        hoy={hoy}
        saldoActualARS={saldoActualARS}
        saldoActualUSD={saldoActualUSD}
        otrosCheques={cheques}
        cuotas={cuotas}
        onAcreditar={refetch}
      />
    }
    if (it.tipo === 'cuota') {
      return <CuotaItem key={key} cuota={it.data as CuotaPendiente} onPagar={refetch} onPagoParcial={abrirPagoParcial} onEditHistorica={setEditCuotaTarget} />
    }
    if (it.tipo === 'pago_cta_cte') {
      return <PagoCtaCteItem key={key} pago={it.data as PagoCtaCte} hoy={hoy} onAcreditar={refetch} />
    }
    if (it.tipo === 'compra_sin_plan') {
      return <CompraSinPlanItem key={key} compra={it.data as CompraSinPlanPago} onPagoParcial={abrirPagoParcial} />
    }
    if (it.tipo === 'gasto') {
      return <GastoPendItem key={key} gasto={it.data as GastoPend} hoy={hoy} cuentas={cuentas} onPagoParcial={abrirPagoParcial} />
    }
    return <InstrumentoItem key={key} inst={it.data as InstrumentoProximo} hoy={hoy} />
  }

  const totalVisibles = visibles.length
  const totalInstrumentos = instrumentosProximos.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Clock className="w-6 h-6 text-amber-400" />
            Pendientes
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Todo lo que requiere acción financiera, ordenado por vencimiento
          </p>
        </div>
        <div className="relative">
          <Button
            variant="secondary"
            onClick={() => setHistoricoMenuOpen((v) => !v)}
            title="Cargar pasivos del pasado (mes 0): cheques, cuotas, cta. cte. o gastos pendientes ya existentes"
          >
            <FileCheck className="w-4 h-4" />
            Cargar pasivo histórico
            <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', historicoMenuOpen && 'rotate-90')} />
          </Button>
          {historicoMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setHistoricoMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-[260px]">
                <div className="px-3 py-2 border-b border-slate-800 bg-slate-800/40">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo de pasivo</p>
                </div>
                {([
                  { tipo: 'CHEQUE' as const, label: 'Cheque', desc: 'Cheque ya emitido sin asignar', Icon: FileCheck, color: 'text-blue-400' },
                  { tipo: 'CUOTA' as const, label: 'Cuotas tarjeta', desc: 'Cuotas que ya están girando', Icon: CreditCard, color: 'text-indigo-400' },
                  { tipo: 'CTA_CTE' as const, label: 'Cuenta corriente', desc: 'Saldo a plazo con proveedor', Icon: Receipt, color: 'text-amber-400' },
                  { tipo: 'GASTO' as const, label: 'Gasto pendiente', desc: 'Un gasto que ya quedaba pendiente', Icon: AlertCircle, color: 'text-purple-400' },
                ]).map(({ tipo, label, desc, Icon, color }) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => abrirHistorico(tipo)}
                    title={desc}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/60 transition-colors border-b border-slate-800/40 last:border-0 text-left"
                  >
                    <Icon className={cn('w-4 h-4 shrink-0', color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100">{label}</p>
                      <p className="text-xs text-slate-500 truncate">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Pagos pendientes ARS</p>
          <p className="text-xl font-bold text-amber-400">{formatCurrency(totalPagosARS)}</p>
        </div>
        <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Pagos pendientes USD</p>
          <p className="text-xl font-bold text-amber-400">{formatCurrency(totalPagosUSD, 'USD')}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Cheques por acreditar</p>
          <p className="text-xl font-bold text-slate-100">{formatCurrency(totalCheques)}</p>
          <p className="text-xs text-slate-500 mt-0.5">{cheques.length} cheque(s)</p>
        </div>
        <div className={cn(
          'bg-slate-900 border rounded-xl p-4',
          chequesInsuficientes.length > 0 ? 'border-red-500/40 bg-red-500/5' : 'border-slate-800'
        )}>
          <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
            {chequesInsuficientes.length > 0 && <AlertCircle className="w-3 h-3 text-red-400" />}
            Cheques con saldo insuficiente
          </p>
          <p className={cn('text-xl font-bold', chequesInsuficientes.length > 0 ? 'text-red-400' : 'text-slate-100')}>
            {chequesInsuficientes.length}
          </p>
        </div>
      </div>

      {/* Empty state */}
      {totalVisibles === 0 && totalInstrumentos === 0 && (
        <div className="bg-slate-900 border border-green-500/20 rounded-xl p-12 text-center">
          <Sparkles className="w-10 h-10 mx-auto mb-3 text-green-400" />
          <p className="text-lg font-medium text-slate-100 mb-1">¡Todo al día!</p>
          <p className="text-sm text-slate-400">No hay pendientes financieros que requieran acción</p>
        </div>
      )}

      {/* Grupos */}
      {(['VENCIDO', 'ESTA_SEMANA', 'ESTE_MES', 'FUTURO'] as const).map((grupo) => {
        const its = porGrupo[grupo]
        if (its.length === 0) return null
        const config = {
          VENCIDO: { label: 'Vencidos', color: 'border-red-500/40', textColor: 'text-red-400', icon: AlertCircle },
          ESTA_SEMANA: { label: 'Esta semana', color: 'border-amber-500/40', textColor: 'text-amber-400', icon: AlertTriangle },
          ESTE_MES: { label: 'Este mes', color: 'border-slate-700', textColor: 'text-slate-300', icon: Clock },
          FUTURO: { label: 'Próximos meses', color: 'border-slate-700/60', textColor: 'text-slate-400', icon: Clock },
        }[grupo]
        const Icon = config.icon
        return (
          <div key={grupo} className={cn('bg-slate-900 border rounded-xl overflow-x-auto', config.color)}>
            <div className={cn('px-4 py-2.5 border-b flex items-center justify-between', config.color)}>
              <h2 className={cn('text-sm font-semibold flex items-center gap-2', config.textColor)}>
                <Icon className="w-4 h-4" />
                {config.label}
              </h2>
              <Badge variant="default">{its.length}</Badge>
            </div>
            <div className="divide-y divide-slate-800/60">
              {its.map((it, i) => renderItem(it, i))}
            </div>
          </div>
        )
      })}

      {/* Instrumentos próximos a vencer (siempre al final) */}
      {instrumentosProximos.length > 0 && (
        <div className="bg-slate-900 border border-purple-500/20 rounded-xl overflow-x-auto">
          <div className="px-4 py-2.5 border-b border-purple-500/20 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-purple-400 flex items-center gap-2">
              <PiggyBank className="w-4 h-4" />
              Inversiones próximas a vencer (≤ 30 días)
            </h2>
            <Badge variant="purple">{instrumentosProximos.length}</Badge>
          </div>
          <div className="divide-y divide-slate-800/60">
            {instrumentosProximos
              .sort((a, b) => (a.fecha_fin ?? '').localeCompare(b.fecha_fin ?? ''))
              .map((i) => <InstrumentoItem key={i.id} inst={i} hoy={hoy} />)}
          </div>
        </div>
      )}

      <RegistrarPagoModal
        open={pagoModalOpen}
        onOpenChange={setPagoModalOpen}
        target={pagoTarget}
        cuentas={cuentas}
        onSuccess={refetch}
      />

      <CargarHistoricoModal
        open={!!historicoTipo}
        tipo={historicoTipo}
        onOpenChange={(o) => { if (!o) setHistoricoTipo(null) }}
        cuentas={cuentas}
        tarjetas={tarjetas}
        proveedores={proveedores}
        onSuccess={refetch}
      />

      {editCuotaTarget && (
        <EditCuotaHistoricaModal
          cuota={editCuotaTarget}
          onClose={() => { setEditCuotaTarget(null); refetch() }}
        />
      )}
    </div>
  )
}

// ─── EditCuotaHistoricaModal ─────────────────────────────────────────────────

function EditCuotaHistoricaModal({ cuota, onClose }: { cuota: CuotaPendiente; onClose: () => void }) {
  const [concepto, setConcepto] = useState(cuota.concepto)
  const [monto, setMonto] = useState(Number(cuota.monto_cuota))
  const [mes, setMes] = useState(cuota.mes_vencimiento)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    if (monto <= 0) { setError('Monto debe ser positivo'); return }
    if (!concepto.trim()) { setError('Concepto requerido'); return }
    startTransition(async () => {
      try {
        await editCuotaHistorica(cuota.id, {
          concepto,
          monto_cuota: monto,
          mes_vencimiento: mes,
        })
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <Modal open={!!cuota} onOpenChange={(o) => { if (!o) onClose() }} title="Editar cuota histórica" className="max-w-md">
      <div className="space-y-4">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-200">
          Editás una cuota cargada manualmente (mes 0). Los datos se aplican sólo si la cuota no está pagada.
        </div>
        <Input label="Concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Monto de la cuota</label>
            <input type="number" step="0.01" min="0.01" value={monto || ''} onChange={(e) => setMonto(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Mes de vencimiento</label>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar cambios
          </Button>
        </div>
      </div>
    </Modal>
  )
}
