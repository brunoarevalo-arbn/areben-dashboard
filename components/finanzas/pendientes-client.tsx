'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { acreditarCheque, pagarCtaCteParcial } from '@/app/actions/compras'
import { marcarCuotaPagada, marcarGastoPagado } from '@/app/actions/finanzas'
import type { Instrumento } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatMonth, labelCuenta, ordenarCuentas } from '@/lib/utils'
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
import { ConfirmarPagoModal } from './confirmar-pago-modal'

interface ChequePendiente {
  id: string
  monto: number
  moneda: string
  fecha_vencimiento: string | null
  fecha_emision: string
  numero_cheque: string | null
  banco_emisor: string | null
  instrumento: string
  tipo_origen?: string | null
  origen_id?: string | null
  compra?: { descripcion: string; proveedor?: { nombre: string } | null } | null
  gasto?: { concepto: string; categoria: string } | null
}

interface CuotaPendiente {
  id: string
  concepto: string
  monto_cuota: number
  mes_vencimiento: string
  cuota_numero: number
  cuotas_total: number
  tarjeta_id?: string | null
  origen_tipo?: string | null
  tarjeta?: { nombre: string; banco: string } | null
  total_pagado?: number
  saldo_pendiente?: number
}

interface CuotaTcGrupo {
  tarjeta_id: string
  tarjeta_nombre: string
  tarjeta_banco: string
  mes_vencimiento: string
  cuotas: CuotaPendiente[]
  totalSaldo: number
  cantidad: number
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
  tipo_origen?: string | null
  origen_id?: string | null
  compra?: { descripcion: string; proveedor?: { nombre: string } | null } | null
  gasto?: { concepto: string; categoria: string } | null
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
  recurrente?: { notas: string | null } | null
}

type InstrumentoProximo = Omit<Instrumento, 'inversor'> & {
  inversor?: { nombre: string } | null
}

interface CuotaPlanAfip {
  id: string
  plan_afip_id: string
  cuota_numero: number
  total_cuotas: number
  capital: number
  interes: number
  monto_total: number
  fecha_vencimiento: string
  pagada: boolean
  plan?: { id: string; nombre: string; numero_plan: string | null; cuenta_debito_id: string | null } | null
}

interface CuotaPrestamo {
  id: string
  prestamo_id: string
  cuota_numero: number
  total_cuotas: number
  capital: number
  interes: number
  monto_total: number
  fecha_vencimiento: string
  pagada: boolean
  saldo_pendiente?: number
  total_pagado?: number
  prestamo?: { id: string; nombre: string; acreedor: string; moneda: string; cuenta_pago_id: string | null } | null
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
  cuentas: { id: string; nombre: string; banco: string; titular?: { nombre: string } | null }[]
  tarjetas: { id: string; nombre: string; banco: string }[]
  proveedores: { id: string; nombre: string }[]
  cuotasPlanAfip?: CuotaPlanAfip[]
  cuotasPrestamo?: CuotaPrestamo[]
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

// Chip compacto de estado de vencimiento (rojo vencido / ámbar próximo / nada si falta mucho).
function EstadoVencimientoChip({ dias }: { dias: number | null }) {
  if (dias === null || dias > 7) return null
  const vencido = dias < 0
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap',
      vencido ? 'bg-red-500/15 text-red-700' : 'bg-amber-500/15 text-amber-700',
    )}>
      {vencido && <AlertCircle className="w-3 h-3" />}
      {vencido ? `${Math.abs(dias)}d venc.` : dias === 0 ? 'vence hoy' : `en ${dias}d`}
    </span>
  )
}

// Barra fina de evolución de pago parcial, para renderizar debajo de la fila.
function EvolucionPagoBar({ totalPagado, saldo, pct, moneda }: {
  totalPagado: number
  saldo: number
  pct: number
  moneda?: 'ARS' | 'USD'
}) {
  return (
    <div className="px-4 pb-1.5 pl-11 flex items-center gap-2">
      <div className="h-1 flex-1 max-w-[240px] bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] font-mono text-fg-muted whitespace-nowrap">
        <span className="text-green-700">{formatCurrency(totalPagado, moneda)}</span> pagado · resta <span className="text-amber-700">{formatCurrency(saldo, moneda)}</span>
      </p>
    </div>
  )
}

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
      indicador === 'verde' && 'border-transparent hover:bg-surface-2/40',
    )}>
      <div className="flex items-center gap-3 px-4 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <FileCheck className={cn(
            'w-4 h-4 shrink-0',
            cheque.instrumento === 'ECHEQ' ? 'text-orange-400' : 'text-amber-700'
          )} />
          <p className="text-sm font-medium text-fg truncate min-w-0">
            {cheque.compra?.proveedor?.nombre
              ?? cheque.compra?.descripcion
              ?? cheque.gasto?.concepto
              ?? '—'}
            <span className="text-fg-soft font-normal"> · {cheque.gasto?.categoria && !cheque.compra ? `${cheque.gasto.categoria} · ` : ''}{cheque.numero_cheque ? `Nº ${cheque.numero_cheque} · ` : ''}acredita {formatDate(fechaVenc)}</span>
          </p>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2 text-[11px]">
          {/* Cheque pasado fecha pero no acreditado: aún disponible para cobrar (no es deadline rígido) */}
          {dias < 0 && Math.abs(dias) <= 30 && <span className="text-fg-muted whitespace-nowrap">esperando depósito</span>}
          {dias < 0 && Math.abs(dias) > 30 && <span className="text-red-700 font-medium whitespace-nowrap">{Math.abs(dias)}d sin cobrar — revisar</span>}
          {dias === 0 && <span className="text-amber-700 whitespace-nowrap">disponible hoy</span>}
          {dias > 0 && dias <= 7 && <span className="text-amber-700 whitespace-nowrap">en {dias} días</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="font-mono text-sm text-fg whitespace-nowrap">{formatCurrency(cheque.monto, moneda)}</p>
            <div className={cn(
              'inline-flex items-center gap-1 text-[10px] font-medium mt-0.5',
              indicador === 'rojo' && 'text-red-700',
              indicador === 'amarillo' && 'text-amber-700',
              indicador === 'verde' && 'text-green-700',
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
          indicador === 'rojo' ? 'text-danger' : 'text-amber-800'
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

function CuotaItem({ cuota, hoy, onPagar, onPagoParcial, onEditHistorica }: {
  cuota: CuotaPendiente
  hoy: string
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
  const dias = diasHasta(fechaCuota(cuota.mes_vencimiento), hoy)

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <CreditCard className="w-4 h-4 text-primary shrink-0" />
        <p className="text-sm font-medium text-fg truncate min-w-0">
          {cuota.concepto}
          {esHistorica && <Badge variant="warning" className="text-[10px] ml-2">histórica</Badge>}
          <span className="text-fg-soft font-normal"> · {cuota.tarjeta?.nombre ?? '—'} · vence {formatMonth(cuota.mes_vencimiento)}{cuota.cuotas_total > 1 ? ` (${cuota.cuota_numero}/${cuota.cuotas_total})` : ''}</span>
        </p>
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <EstadoVencimientoChip dias={dias} />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <p className="font-mono text-sm text-fg whitespace-nowrap">{formatCurrency(cuota.monto_cuota)}</p>
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
      {hayParciales && <EvolucionPagoBar totalPagado={totalPagado} saldo={saldo} pct={pagadoPct} />}
    </div>
  )
}

function GastoPendItem({ gasto, hoy, cuentas, onPagoParcial }: { gasto: GastoPend; hoy: string; cuentas: { id: string; nombre: string; banco: string; titular?: { nombre: string } | null }[]; onPagoParcial: (t: PagoTarget) => void }) {
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
      <div className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2/40 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          {esSueldo ? (
            <CreditCard className="w-4 h-4 text-purple-700 shrink-0" />
          ) : (
            <Receipt className="w-4 h-4 text-primary shrink-0" />
          )}
          <p className="text-sm font-medium text-fg truncate min-w-0">
            {gasto.concepto}
            {gasto.recurrente?.notas && (
              <span
                title={gasto.recurrente.notas}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/15 text-amber-700 text-[10px] font-bold cursor-help align-middle ml-1.5"
              >i</span>
            )}
            <span className="text-fg-soft font-normal"> · {gasto.categoria}{fecha ? ` · vence ${formatDate(fecha)}` : ''}</span>
          </p>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <EstadoVencimientoChip dias={dias} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <p className="font-mono text-sm text-fg whitespace-nowrap">{formatCurrency(gasto.monto, moneda)}</p>
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
      {hayParciales && <EvolucionPagoBar totalPagado={totalPagado} saldo={saldo} pct={pagadoPct} moneda={moneda} />}
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

function PagarGastoInline({ gasto, cuentas, onClose }: { gasto: GastoPend; cuentas: { id: string; nombre: string; banco: string; titular?: { nombre: string } | null }[]; onClose: () => void }) {
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
    <div className="px-4 py-3 bg-surface-2/60 border-t border-border-strong/40 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="date"
          value={fechaPago}
          onChange={(e) => setFechaPago(e.target.value)}
          className="px-2 py-1.5 bg-surface-2 border border-[#c8c0b0] rounded text-fg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
          className="px-2 py-1.5 bg-surface-2 border border-[#c8c0b0] rounded text-fg text-xs focus:outline-none focus:ring-1 focus:ring-primary sm:col-span-2"
        >
          <option value="">— Cuenta de origen —</option>
          {ordenarCuentas(cuentas).map((c) => <option key={c.id} value={c.id}>{labelCuenta(c)}</option>)}
        </select>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
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

function PagoCtaCteItem({ pago, hoy, cuentas, onAcreditar }: { pago: PagoCtaCte; hoy: string; cuentas: { id: string; nombre: string; banco: string; titular?: { nombre: string } | null }[]; onAcreditar: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [abierto, setAbierto] = useState(false)
  const moneda = (pago.moneda === 'USD' ? 'USD' : 'ARS') as 'USD' | 'ARS'
  const fecha = pago.fecha_vencimiento
  if (!fecha) return null
  const dias = diasHasta(fecha, hoy)
  // Solo las CC ligadas a una compra usan el flujo de pago parcial con notas (el saldo lo
  // recalcula el trigger sumando los pagos acreditados). Para gastos se mantiene el botón simple.
  const esCompra = pago.tipo_origen === 'COMPRA'
  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2/40 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <Receipt className="w-4 h-4 text-blue-700 shrink-0" />
          <p className="text-sm font-medium text-fg truncate min-w-0">
            {pago.compra?.proveedor?.nombre
              ?? pago.compra?.descripcion
              ?? pago.gasto?.concepto
              ?? '—'}
            <span className="text-fg-soft font-normal"> · {pago.gasto?.categoria && !pago.compra ? `${pago.gasto.categoria} · ` : ''}Cta. corriente · vence {formatDate(fecha)}{pago.numero_cuota && pago.total_cuotas && pago.total_cuotas > 1 ? ` (cuota ${pago.numero_cuota}/${pago.total_cuotas})` : ''}</span>
          </p>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <EstadoVencimientoChip dias={dias} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <p className="font-mono text-sm text-fg whitespace-nowrap">{formatCurrency(pago.monto, moneda)}</p>
          {esCompra ? (
            <Button
              size="sm"
              variant="success"
              onClick={() => setAbierto((v) => !v)}
              title="Registrar pago (parcial o total) con nota"
            >
              <Wallet className="w-3.5 h-3.5" />
              Pagar
            </Button>
          ) : (
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
          )}
        </div>
      </div>
      {esCompra && abierto && (
        <PagarCtaCteInline
          pago={pago}
          cuentas={cuentas}
          onClose={() => setAbierto(false)}
          onDone={() => { setAbierto(false); onAcreditar() }}
        />
      )}
    </div>
  )
}

function PagarCtaCteInline({ pago, cuentas, onClose, onDone }: { pago: PagoCtaCte; cuentas: { id: string; nombre: string; banco: string; titular?: { nombre: string } | null }[]; onClose: () => void; onDone: () => void }) {
  const moneda = (pago.moneda === 'USD' ? 'USD' : 'ARS') as 'USD' | 'ARS'
  const restante = Number(pago.monto)
  const [monto, setMonto] = useState<number>(restante)
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0])
  const [cuentaId, setCuentaId] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const total = monto >= restante - 0.01

  function confirmar() {
    setError(null)
    if (!monto || monto <= 0) {
      setError('Ingresá un monto mayor a cero')
      return
    }
    startTransition(async () => {
      try {
        await pagarCtaCteParcial(pago.id, { monto, fecha: fechaPago, cuenta_id: cuentaId || null, notas: notas || null })
        onDone()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="px-4 py-3 bg-surface-2/60 border-t border-border-strong/40 space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-fg-muted">Monto a pagar</label>
        <button
          type="button"
          onClick={() => setMonto(restante)}
          className="text-xs text-primary hover:text-orange-600"
          title="Cargar el saldo restante completo"
        >
          Pagar todo ({formatCurrency(restante, moneda)})
        </button>
      </div>
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={monto || ''}
        onChange={(e) => setMonto(Number(e.target.value))}
        placeholder="0,00"
        className="w-full px-2 py-1.5 bg-surface-2 border border-[#c8c0b0] rounded text-fg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {monto > restante + 0.01 && (
        <p className="text-xs text-amber-700">El monto supera el saldo restante; se saldará la cuenta corriente.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          type="date"
          value={fechaPago}
          onChange={(e) => setFechaPago(e.target.value)}
          className="px-2 py-1.5 bg-surface-2 border border-[#c8c0b0] rounded text-fg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
          className="px-2 py-1.5 bg-surface-2 border border-[#c8c0b0] rounded text-fg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">— Cuenta de origen (opcional) —</option>
          {ordenarCuentas(cuentas).map((c) => <option key={c.id} value={c.id}>{labelCuenta(c)}</option>)}
        </select>
      </div>
      <input
        type="text"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Nota (ej. adelanto, pago parcial…)"
        className="w-full px-2 py-1.5 bg-surface-2 border border-[#c8c0b0] rounded text-fg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button size="sm" variant="success" onClick={confirmar} disabled={isPending || !monto}>
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {total ? 'Saldar' : 'Registrar pago'}
        </Button>
      </div>
    </div>
  )
}

function CompraSinPlanItem({ compra, onPagoParcial }: { compra: CompraSinPlanPago; onPagoParcial: (t: PagoTarget) => void }) {
  const moneda = (compra.moneda === 'USD' ? 'USD' : 'ARS') as 'USD' | 'ARS'
  return (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
        <p className="text-sm font-medium text-fg truncate min-w-0">
          {compra.proveedor?.nombre ?? compra.descripcion}
          <span className="text-fg-soft font-normal"> · Compra del {formatDate(compra.fecha)} · sin plan de pago</span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className="font-mono text-sm text-amber-700 font-semibold whitespace-nowrap">{formatCurrency(compra.saldo_pendiente, moneda)}</p>
          <p className="text-[10px] text-fg-soft">de {formatCurrency(compra.monto_total, moneda)}</p>
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
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <PiggyBank className="w-4 h-4 text-purple-700 shrink-0" />
        <p className="text-sm font-medium text-fg truncate min-w-0">
          {inst.inversor?.nombre ?? '—'}
          {inst.codigo && <span className="text-fg-soft font-normal font-mono ml-2">{inst.codigo}</span>}
          <span className="text-fg-soft font-normal"> · vence {inst.fecha_fin && formatDate(inst.fecha_fin)}{inst.capitalizable ? ' · capitalizable' : ' · no capitalizable'}</span>
        </p>
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <EstadoVencimientoChip dias={inst.fecha_fin ? dias : null} />
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <p className="font-mono text-sm text-fg whitespace-nowrap">{formatCurrency(Number(inst.capital_inicial), inst.moneda)}</p>
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

// ─── CuotaTcGrupoItem ──────────────────────────────────────────────────────────

function CuotaTcGrupoItem({
  grupo, hoy, onRefetch,
}: {
  grupo: CuotaTcGrupo
  hoy: string
  onRefetch: () => void
}) {
  const [expandido, setExpandido] = useState(false)
  const [confirmarOpen, setConfirmarOpen] = useState(false)
  const fechaVenc = fechaCuota(grupo.mes_vencimiento)
  const dias = (() => {
    const f = new Date(fechaVenc + 'T00:00:00')
    const h = new Date(hoy + 'T00:00:00')
    return Math.ceil((f.getTime() - h.getTime()) / (1000 * 60 * 60 * 24))
  })()
  const colorBorder = dias < 0 ? 'border-red-500' : dias <= 7 ? 'border-amber-500' : 'border-transparent'
  const colorBg = dias < 0 ? 'bg-red-500/5' : dias <= 7 ? 'bg-amber-500/5' : ''

  async function marcarTodasPagadas(fecha: string) {
    const { marcarCuotaPagada } = await import('@/app/actions/finanzas')
    for (const c of grupo.cuotas) {
      try {
        await marcarCuotaPagada(c.id, true, fecha)
      } catch {
        // ignorar errores individuales
      }
    }
    onRefetch()
  }

  return (
    <div className={cn('border-l-4', colorBorder, colorBg)}>
      <div className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2/30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="p-1 -ml-1 rounded hover:bg-surface-2 text-fg-soft"
          >
            {expandido ? <ChevronRight className="w-4 h-4 rotate-90" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <CreditCard className="w-5 h-5 text-purple-700 shrink-0" />
          <p className="text-fg font-medium truncate min-w-0">
            Resumen {grupo.tarjeta_nombre}
            <span className="text-fg-soft font-normal text-xs ml-2">({grupo.cantidad} consumo{grupo.cantidad > 1 ? 's' : ''})</span>
            <span className="text-fg-soft font-normal"> · vence {formatMonth(grupo.mes_vencimiento)}</span>
          </p>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <EstadoVencimientoChip dias={dias} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <p className="font-mono font-bold text-amber-700 whitespace-nowrap">{formatCurrency(grupo.totalSaldo)}</p>
          <Button
            size="sm"
            variant="success"
            onClick={() => setConfirmarOpen(true)}
            title="Marcar todo el resumen como pagado (pide fecha)"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Pagar todo
          </Button>
        </div>
      </div>
      {expandido && (
        <div className="border-t border-border/60 bg-surface-2/20 divide-y divide-border/40">
          {grupo.cuotas.map((c) => (
            <div key={c.id} className="px-4 py-2 pl-12 flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="text-fg-muted text-xs truncate">
                  {c.concepto}
                  {c.cuotas_total > 1 && <span className="ml-1 text-fg-soft">(cuota {c.cuota_numero}/{c.cuotas_total})</span>}
                </p>
              </div>
              <p className="font-mono text-xs text-fg">{formatCurrency(c.saldo_pendiente ?? c.monto_cuota)}</p>
            </div>
          ))}
        </div>
      )}

      <ConfirmarPagoModal
        open={confirmarOpen}
        onOpenChange={setConfirmarOpen}
        title={`Marcar resumen TC pagado · ${grupo.tarjeta_nombre}`}
        descripcion={`${grupo.cantidad} cuota${grupo.cantidad > 1 ? 's' : ''} de ${formatMonth(grupo.mes_vencimiento)}`}
        monto={grupo.totalSaldo}
        defaultFecha={fechaVenc}
        onConfirm={async (fecha) => { await marcarTodasPagadas(fecha) }}
      />
    </div>
  )
}

// ─── CuotaPrestamoItem ─────────────────────────────────────────────────────────

function CuotaPrestamoItem({
  cuota, hoy, onPagoParcial,
}: {
  cuota: CuotaPrestamo
  hoy: string
  onPagoParcial: (t: PagoTarget) => void
}) {
  const moneda = (cuota.prestamo?.moneda === 'USD' ? 'USD' : 'ARS') as 'USD' | 'ARS'
  const saldo = Number(cuota.saldo_pendiente ?? cuota.monto_total)
  const pagado = Number(cuota.total_pagado ?? 0)
  const dias = (() => {
    const f = new Date(cuota.fecha_vencimiento + 'T00:00:00')
    const h = new Date(hoy + 'T00:00:00')
    return Math.ceil((f.getTime() - h.getTime()) / (1000 * 60 * 60 * 24))
  })()
  const colorBorder = dias < 0 ? 'border-red-500' : dias <= 7 ? 'border-amber-500' : 'border-transparent'
  const colorBg = dias < 0 ? 'bg-red-500/5' : dias <= 7 ? 'bg-amber-500/5' : ''
  return (
    <div className={cn('border-l-4', colorBorder, colorBg)}>
      <div className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2/30">
        <div className="flex items-center gap-3 min-w-0">
          <Receipt className="w-5 h-5 text-fg-muted shrink-0" />
          <p className="text-fg font-medium truncate min-w-0">
            {cuota.prestamo?.nombre ?? 'Préstamo'} · Cuota {cuota.cuota_numero}/{cuota.total_cuotas}
            {cuota.prestamo?.acreedor && <span className="text-fg-soft font-normal text-xs ml-2">— {cuota.prestamo.acreedor}</span>}
            <span className="text-fg-soft font-normal"> · vence {formatDate(cuota.fecha_vencimiento)}</span>
          </p>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <EstadoVencimientoChip dias={dias} />
          <span className="text-[11px] text-fg-soft whitespace-nowrap hidden md:inline">Cap {formatCurrency(cuota.capital, moneda)} + Int {formatCurrency(cuota.interes, moneda)}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="font-mono font-bold text-fg whitespace-nowrap">{formatCurrency(saldo, moneda)}</p>
            {pagado > 0.01 && <p className="text-xs text-fg-soft whitespace-nowrap">de {formatCurrency(cuota.monto_total, moneda)} · pagado {formatCurrency(pagado, moneda)}</p>}
          </div>
          <Button
            size="sm"
            variant="success"
            onClick={() => onPagoParcial({
              tipo_origen: 'PRESTAMO',
              origen_id: cuota.id,
              monto_total: Number(cuota.monto_total),
              saldo_pendiente: saldo,
              moneda,
              descripcion: `${cuota.prestamo?.nombre ?? 'Préstamo'} · Cuota ${cuota.cuota_numero}/${cuota.total_cuotas}`,
              contexto: cuota.prestamo?.acreedor ? `Acreedor: ${cuota.prestamo.acreedor}` : `Vence ${formatDate(cuota.fecha_vencimiento)}`,
              default_cuenta_id: cuota.prestamo?.cuenta_pago_id ?? null,
            })}
            title="Registrar pago (parcial o total) con nota"
          >
            <Wallet className="w-3.5 h-3.5" />
            Pagar
          </Button>
        </div>
      </div>
      {pagado > 0.01 && <EvolucionPagoBar totalPagado={pagado} saldo={saldo} pct={Math.min(100, (pagado / Number(cuota.monto_total || 1)) * 100)} moneda={moneda} />}
    </div>
  )
}

// ─── CuotaPlanAfipItem ─────────────────────────────────────────────────────────

function CuotaPlanAfipItem({
  cuota, hoy, onRefetch,
}: {
  cuota: CuotaPlanAfip
  hoy: string
  onRefetch: () => void
}) {
  const [isPending, _startTransition] = useTransition()
  const [confirmarOpen, setConfirmarOpen] = useState(false)
  const dias = (() => {
    const f = new Date(cuota.fecha_vencimiento + 'T00:00:00')
    const h = new Date(hoy + 'T00:00:00')
    return Math.ceil((f.getTime() - h.getTime()) / (1000 * 60 * 60 * 24))
  })()
  const colorBorder = dias < 0 ? 'border-red-500' : dias <= 7 ? 'border-amber-500' : 'border-transparent'
  const colorBg = dias < 0 ? 'bg-red-500/5' : dias <= 7 ? 'bg-amber-500/5' : ''
  const nombrePlan = cuota.plan?.nombre ?? 'Plan AFIP'
  return (
    <div className={cn('border-l-4', colorBorder, colorBg)}>
      <div className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2/30">
        <div className="flex items-center gap-3 min-w-0">
          <FileCheck className="w-5 h-5 text-blue-700 shrink-0" />
          <p className="text-fg font-medium truncate min-w-0">
            {nombrePlan} · Cuota {cuota.cuota_numero}/{cuota.total_cuotas}
            {cuota.plan?.numero_plan && <span className="text-fg-soft font-normal font-mono ml-2">#{cuota.plan.numero_plan}</span>}
            <span className="text-fg-soft font-normal"> · Débito automático · vence {formatDate(cuota.fecha_vencimiento)}</span>
          </p>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <EstadoVencimientoChip dias={dias} />
          <span className="text-[11px] text-fg-soft whitespace-nowrap hidden md:inline">Cap {formatCurrency(cuota.capital)} + Int {formatCurrency(cuota.interes)}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <p className="font-mono font-bold text-fg whitespace-nowrap">{formatCurrency(cuota.monto_total)}</p>
          <Button
            size="sm"
            variant="success"
            disabled={isPending}
            onClick={() => setConfirmarOpen(true)}
            title="Marcar pagada (pide fecha del débito real)"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Pagada
          </Button>
        </div>
      </div>

      <ConfirmarPagoModal
        open={confirmarOpen}
        onOpenChange={setConfirmarOpen}
        title="Marcar cuota plan AFIP pagada"
        descripcion={`${nombrePlan} · Cuota ${cuota.cuota_numero}/${cuota.total_cuotas} · vence ${cuota.fecha_vencimiento}`}
        monto={cuota.monto_total}
        defaultFecha={cuota.fecha_vencimiento}
        onConfirm={async (fecha) => {
          const { marcarCuotaPlanPagada } = await import('@/app/actions/planes-afip')
          await marcarCuotaPlanPagada(cuota.id, fecha)
          onRefetch()
        }}
      />
    </div>
  )
}

// ─── GastoGrupoCargasItem ──────────────────────────────────────────────────────

function GastoGrupoCargasItem({
  grupo,
  hoy,
  cuentas,
  onPagoParcial,
  onRefetch,
}: {
  grupo: { mes: string; categoria: string; gastos: GastoPend[]; totalSaldo: number; cantidad: number }
  hoy: string
  cuentas: { id: string; nombre: string; banco: string; titular?: { nombre: string } | null }[]
  onPagoParcial: (t: PagoTarget) => void
  onRefetch: () => void
}) {
  const [expandido, setExpandido] = useState(false)
  const [pagarTodoOpen, setPagarTodoOpen] = useState(false)
  const fechaVenc = grupo.gastos[0]?.fecha_pago ?? `${grupo.mes}-15`
  const dias = (() => {
    const f = new Date(fechaVenc + 'T00:00:00')
    const h = new Date(hoy + 'T00:00:00')
    return Math.ceil((f.getTime() - h.getTime()) / (1000 * 60 * 60 * 24))
  })()
  const colorBorder = dias < 0 ? 'border-red-500' : dias <= 7 ? 'border-amber-500' : 'border-transparent'
  const colorBg = dias < 0 ? 'bg-red-500/5' : dias <= 7 ? 'bg-amber-500/5' : ''
  return (
    <div className={cn('border-l-4', colorBorder, colorBg)}>
      <div className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2/30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="p-1 -ml-1 rounded hover:bg-surface-2 text-fg-soft"
          >
            {expandido ? <ChevronRight className="w-4 h-4 rotate-90" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <Receipt className="w-5 h-5 text-purple-700 shrink-0" />
          <p className="text-fg font-medium truncate min-w-0">
            Cargas Sociales · {formatMonth(grupo.mes)}
            <span className="text-fg-soft font-normal text-xs ml-2">({grupo.cantidad} empleado{grupo.cantidad > 1 ? 's' : ''})</span>
            <span className="text-fg-soft font-normal"> · vence {formatDate(fechaVenc)}</span>
          </p>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <EstadoVencimientoChip dias={dias} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <p className="font-mono font-bold text-amber-700 whitespace-nowrap">{formatCurrency(grupo.totalSaldo)}</p>
          <Button size="sm" variant="success" onClick={() => setPagarTodoOpen(true)} title="Marcar pagados todos los aportes de este mes">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Pagar todo
          </Button>
        </div>
      </div>
      {expandido && (
        <div className="border-t border-border/60 bg-surface-2/20 divide-y divide-border/40">
          {grupo.gastos.map((g) => (
            <div key={g.id} className="px-4 py-2 pl-12 flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="text-fg-muted text-xs flex items-center gap-1.5">
                  <span className="truncate">{g.concepto}</span>
                  {g.recurrente?.notas && (
                    <span
                      title={g.recurrente.notas}
                      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-500/15 text-amber-700 text-[9px] font-bold cursor-help shrink-0"
                    >i</span>
                  )}
                </p>
                {g.total_pagado && g.total_pagado > 0 && (
                  <p className="text-xs text-amber-700">
                    Pagado parcial: {formatCurrency(g.total_pagado)} de {formatCurrency(g.monto)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs text-fg">{formatCurrency(g.saldo_pendiente ?? Number(g.monto))}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onPagoParcial({
                    tipo_origen: 'GASTO',
                    origen_id: g.id,
                    monto_total: g.monto,
                    saldo_pendiente: g.saldo_pendiente,
                    moneda: g.moneda === 'USD' ? 'USD' : 'ARS',
                    descripcion: g.concepto,
                    contexto: g.categoria,
                  })}
                  title="Pagar este individual (parcial o total)"
                >
                  Pagar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal pagar todo el grupo */}
      <Modal
        open={pagarTodoOpen}
        onOpenChange={(o) => { if (!o) setPagarTodoOpen(false) }}
        title={`Pagar todas las Cargas Sociales · ${formatMonth(grupo.mes)}`}
        className="max-w-md"
      >
        <PagarGrupoForm
          grupo={grupo}
          cuentas={cuentas}
          onClose={() => { setPagarTodoOpen(false); onRefetch() }}
        />
      </Modal>
    </div>
  )
}

function PagarGrupoForm({
  grupo,
  cuentas,
  onClose,
}: {
  grupo: { mes: string; categoria: string; gastos: GastoPend[]; totalSaldo: number; cantidad: number }
  cuentas: { id: string; nombre: string; banco: string; titular?: { nombre: string } | null }[]
  onClose: () => void
}) {
  const [cuentaId, setCuentaId] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    if (!cuentaId) { setError('Seleccioná la cuenta de origen'); return }
    startTransition(async () => {
      try {
        for (const g of grupo.gastos) {
          try {
            await marcarGastoPagado(g.id, cuentaId, fecha)
          } catch {
            // ignorar errores individuales
          }
        }
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
        <p className="text-sm text-fg">
          Vas a pagar <strong>{grupo.cantidad}</strong> aporte{grupo.cantidad > 1 ? 's' : ''} de Cargas Sociales de <strong>{formatMonth(grupo.mes)}</strong>:
        </p>
        <p className="text-xl font-mono font-bold text-amber-700 mt-1">{formatCurrency(grupo.totalSaldo)}</p>
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-fg-muted">Cuenta de origen</label>
        <select
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
          required
          className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
        >
          <option value="">Seleccioná...</option>
          {ordenarCuentas(cuentas).map((c) => <option key={c.id} value={c.id}>{labelCuenta(c)}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-fg-muted">Fecha de pago</label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>Cancelar</Button>
        <Button type="button" variant="success" onClick={submit} disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Marcar todos pagados
        </Button>
      </div>
    </div>
  )
}

// ─── Main Client ───────────────────────────────────────────────────────────────

interface GastoGrupoCargas {
  mes: string
  categoria: string
  gastos: GastoPend[]
  totalSaldo: number
  cantidad: number
}

interface ItemConFecha {
  fecha: string
  grupo: GrupoFecha
  tipo: 'cheque' | 'cuota' | 'instrumento' | 'pago_cta_cte' | 'compra_sin_plan' | 'gasto' | 'gasto_grupo' | 'cuota_plan_afip' | 'cuota_prestamo' | 'cuota_tc_grupo'
  prioridad: number // para ordenar dentro del grupo (cheques rojos primero)
  data: ChequePendiente | CuotaPendiente | InstrumentoProximo | PagoCtaCte | CompraSinPlanPago | GastoPend | GastoGrupoCargas | CuotaPlanAfip | CuotaPrestamo | CuotaTcGrupo
}

export function PendientesClient({
  mesActual, hoy, saldoActualARS, saldoActualUSD,
  cheques, pagosCtaCte, comprasSinPlanPago, cuotas, instrumentosProximos,
  gastosPendientes, cuentas, tarjetas, proveedores,
  cuotasPlanAfip = [],
  cuotasPrestamo = [],
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

    // Agrupar cuotas de TC por tarjeta + mes_vencimiento (resumen consolidado)
    const cuotasPorTarjetaMes = new Map<string, CuotaPendiente[]>()
    for (const c of cuotas) {
      const key = `${c.tarjeta_id ?? 'sin'}::${c.mes_vencimiento}`
      const arr = cuotasPorTarjetaMes.get(key) ?? []
      arr.push(c)
      cuotasPorTarjetaMes.set(key, arr)
    }
    for (const [key, cuotasGrupo] of cuotasPorTarjetaMes.entries()) {
      const primera = cuotasGrupo[0]
      const fecha = fechaCuota(primera.mes_vencimiento)
      const totalSaldo = cuotasGrupo.reduce((s, x) => s + Number(x.saldo_pendiente ?? x.monto_cuota), 0)
      list.push({
        fecha,
        grupo: clasificarFecha(fecha, hoy),
        tipo: 'cuota_tc_grupo',
        prioridad: 30,
        data: {
          tarjeta_id: primera.tarjeta_id ?? key.split('::')[0],
          tarjeta_nombre: primera.tarjeta?.nombre ?? 'Sin tarjeta',
          tarjeta_banco: primera.tarjeta?.banco ?? '',
          mes_vencimiento: primera.mes_vencimiento,
          cuotas: cuotasGrupo,
          totalSaldo,
          cantidad: cuotasGrupo.length,
        } as CuotaTcGrupo,
      })
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

    // Gastos pendientes (incluye nóminas auto-creadas).
    // Las Cargas Sociales (auto-creadas por la nómina, 1 por empleado) se
    // agrupan por mes para mostrar un total agregado en vez de N líneas.
    const cargasSocialesPorMes = new Map<string, GastoPend[]>()
    for (const g of gastosPendientes) {
      if (g.categoria === 'Cargas Sociales') {
        const arr = cargasSocialesPorMes.get(g.mes) ?? []
        arr.push(g)
        cargasSocialesPorMes.set(g.mes, arr)
        continue
      }
      const fecha = g.fecha_pago ?? `${g.mes}-15`
      list.push({ fecha, grupo: clasificarFecha(fecha, hoy), tipo: 'gasto', prioridad: g.categoria === 'Sueldos' ? 20 : 50, data: g })
    }
    for (const [mes, gastos] of cargasSocialesPorMes.entries()) {
      const fecha = gastos[0]?.fecha_pago ?? `${mes}-15`
      const totalSaldo = gastos.reduce((s, x) => s + (x.saldo_pendiente ?? Number(x.monto)), 0)
      list.push({
        fecha,
        grupo: clasificarFecha(fecha, hoy),
        tipo: 'gasto_grupo',
        prioridad: 25, // entre sueldos (20) y resto (50)
        data: { mes, categoria: 'Cargas Sociales', gastos, totalSaldo, cantidad: gastos.length } as GastoGrupoCargas,
      })
    }

    // Cuotas de planes AFIP no pagadas (débito automático)
    for (const c of cuotasPlanAfip) {
      const fecha = c.fecha_vencimiento
      list.push({
        fecha,
        grupo: clasificarFecha(fecha, hoy),
        tipo: 'cuota_plan_afip',
        prioridad: 15, // alta prioridad (débito automático, no podés evitarlo)
        data: c,
      })
    }

    // Cuotas de préstamos no pagadas
    for (const c of cuotasPrestamo) {
      const fecha = c.fecha_vencimiento
      list.push({
        fecha,
        grupo: clasificarFecha(fecha, hoy),
        tipo: 'cuota_prestamo',
        prioridad: 18, // entre AFIP y resto
        data: c,
      })
    }

    // Ordenar por (grupo > prioridad > fecha asc)
    return list.sort((a, b) => {
      const ordenGrupo: Record<GrupoFecha, number> = { VENCIDO: 0, ESTA_SEMANA: 1, ESTE_MES: 2, FUTURO: 3 }
      if (ordenGrupo[a.grupo] !== ordenGrupo[b.grupo]) return ordenGrupo[a.grupo] - ordenGrupo[b.grupo]
      if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad
      return a.fecha.localeCompare(b.fecha)
    })
  }, [cheques, pagosCtaCte, comprasSinPlanPago, cuotas, instrumentosProximos, gastosPendientes, cuotasPlanAfip, cuotasPrestamo, mesActual, hoy, saldoActualARS, saldoActualUSD, _tick])

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
      return <CuotaItem key={key} cuota={it.data as CuotaPendiente} hoy={hoy} onPagar={refetch} onPagoParcial={abrirPagoParcial} onEditHistorica={setEditCuotaTarget} />
    }
    if (it.tipo === 'pago_cta_cte') {
      return <PagoCtaCteItem key={key} pago={it.data as PagoCtaCte} hoy={hoy} cuentas={cuentas} onAcreditar={refetch} />
    }
    if (it.tipo === 'compra_sin_plan') {
      return <CompraSinPlanItem key={key} compra={it.data as CompraSinPlanPago} onPagoParcial={abrirPagoParcial} />
    }
    if (it.tipo === 'gasto') {
      return <GastoPendItem key={key} gasto={it.data as GastoPend} hoy={hoy} cuentas={cuentas} onPagoParcial={abrirPagoParcial} />
    }
    if (it.tipo === 'gasto_grupo') {
      return <GastoGrupoCargasItem key={key} grupo={it.data as GastoGrupoCargas} hoy={hoy} cuentas={cuentas} onPagoParcial={abrirPagoParcial} onRefetch={refetch} />
    }
    if (it.tipo === 'cuota_plan_afip') {
      return <CuotaPlanAfipItem key={key} cuota={it.data as CuotaPlanAfip} hoy={hoy} onRefetch={refetch} />
    }
    if (it.tipo === 'cuota_prestamo') {
      return <CuotaPrestamoItem key={key} cuota={it.data as CuotaPrestamo} hoy={hoy} onPagoParcial={abrirPagoParcial} />
    }
    if (it.tipo === 'cuota_tc_grupo') {
      return <CuotaTcGrupoItem key={key} grupo={it.data as CuotaTcGrupo} hoy={hoy} onRefetch={refetch} />
    }
    return <InstrumentoItem key={key} inst={it.data as InstrumentoProximo} hoy={hoy} />
  }

  const totalVisibles = visibles.length
  const totalInstrumentos = instrumentosProximos.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Clock className="w-6 h-6 text-amber-700" />
            Pendientes
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">
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
              <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border-strong rounded-xl shadow-2xl overflow-hidden min-w-[260px]">
                <div className="px-3 py-2 border-b border-border bg-surface-2/40">
                  <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Tipo de pasivo</p>
                </div>
                {([
                  { tipo: 'CHEQUE' as const, label: 'Cheque', desc: 'Cheque ya emitido sin asignar', Icon: FileCheck, color: 'text-blue-700' },
                  { tipo: 'CUOTA' as const, label: 'Cuotas tarjeta', desc: 'Cuotas que ya están girando', Icon: CreditCard, color: 'text-primary' },
                  { tipo: 'CTA_CTE' as const, label: 'Cuenta corriente', desc: 'Saldo a plazo con proveedor', Icon: Receipt, color: 'text-amber-700' },
                  { tipo: 'GASTO' as const, label: 'Gasto pendiente', desc: 'Un gasto que ya quedaba pendiente', Icon: AlertCircle, color: 'text-purple-700' },
                ]).map(({ tipo, label, desc, Icon, color }) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => abrirHistorico(tipo)}
                    title={desc}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60 transition-colors border-b border-border/40 last:border-0 text-left"
                  >
                    <Icon className={cn('w-4 h-4 shrink-0', color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fg">{label}</p>
                      <p className="text-xs text-fg-soft truncate">{desc}</p>
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
        <div className="bg-surface border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Pagos pendientes ARS</p>
          <p className="text-xl font-bold text-amber-700">{formatCurrency(totalPagosARS)}</p>
        </div>
        <div className="bg-surface border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Pagos pendientes USD</p>
          <p className="text-xl font-bold text-amber-700">{formatCurrency(totalPagosUSD, 'USD')}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Cheques por acreditar</p>
          <p className="text-xl font-bold text-fg">{formatCurrency(totalCheques)}</p>
          <p className="text-xs text-fg-soft mt-0.5">{cheques.length} cheque(s)</p>
        </div>
        <div className={cn(
          'bg-surface border rounded-xl p-4',
          chequesInsuficientes.length > 0 ? 'border-red-500/40 bg-red-500/5' : 'border-border'
        )}>
          <p className="text-xs text-fg-muted mb-1 flex items-center gap-1">
            {chequesInsuficientes.length > 0 && <AlertCircle className="w-3 h-3 text-red-700" />}
            Cheques con saldo insuficiente
          </p>
          <p className={cn('text-xl font-bold', chequesInsuficientes.length > 0 ? 'text-red-700' : 'text-fg')}>
            {chequesInsuficientes.length}
          </p>
        </div>
      </div>

      {/* Empty state */}
      {totalVisibles === 0 && totalInstrumentos === 0 && (
        <div className="bg-surface border border-green-500/20 rounded-xl p-12 text-center">
          <Sparkles className="w-10 h-10 mx-auto mb-3 text-green-700" />
          <p className="text-lg font-medium text-fg mb-1">¡Todo al día!</p>
          <p className="text-sm text-fg-muted">No hay pendientes financieros que requieran acción</p>
        </div>
      )}

      {/* Grupos */}
      {(['VENCIDO', 'ESTA_SEMANA', 'ESTE_MES', 'FUTURO'] as const).map((grupo) => {
        const its = porGrupo[grupo]
        if (its.length === 0) return null
        const config = {
          VENCIDO: { label: 'Vencidos', color: 'border-red-500/40', textColor: 'text-red-700', icon: AlertCircle },
          ESTA_SEMANA: { label: 'Esta semana', color: 'border-amber-500/40', textColor: 'text-amber-700', icon: AlertTriangle },
          ESTE_MES: { label: 'Este mes', color: 'border-border-strong', textColor: 'text-fg-muted', icon: Clock },
          FUTURO: { label: 'Próximos meses', color: 'border-border-strong/60', textColor: 'text-fg-muted', icon: Clock },
        }[grupo]
        const Icon = config.icon
        return (
          <div key={grupo} className={cn('bg-surface border rounded-xl overflow-x-auto', config.color)}>
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
        <div className="bg-surface border border-purple-500/20 rounded-xl overflow-x-auto">
          <div className="px-4 py-2.5 border-b border-purple-500/20 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-purple-700 flex items-center gap-2">
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
            <label className="block text-xs font-medium text-fg-muted mb-1.5">Monto de la cuota</label>
            <input type="number" step="0.01" min="0.01" value={monto || ''} onChange={(e) => setMonto(Number(e.target.value))}
              className="w-full px-3 py-2 bg-surface-2 border border-border-strong rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-muted mb-1.5">Mes de vencimiento</label>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
              className="w-full px-3 py-2 bg-surface-2 border border-border-strong rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
        {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
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
