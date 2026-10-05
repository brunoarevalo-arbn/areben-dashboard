'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { deleteNomina } from '@/app/actions/rrhh'
import { RegistrarPagoModal, type PagoHistorialItem } from '@/components/finanzas/registrar-pago-modal'
import type { NominaMensual, ConfiguracionAporte, HoraExtraRegistro } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { EstadoBadge } from '@/components/ui/badge'
import { useSort, SortTh } from '@/components/ui/sortable'
import { formatHoras } from '@/lib/horas'
import { formatCurrency, getMonthOptions, formatMonth } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  Plus, Trash2, FileText, Pencil,
  Receipt, Printer, PiggyBank, BadgeCheck, ChevronDown, DollarSign,
  Users,
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

// Estilos de la hoja impresa. Todo en negro pleno y sin fondos: muchas impresoras no
// imprimen fondos (el TOTAL era texto blanco sobre negro y salía en blanco) y los
// grises claros se pierden en una láser con poco tóner.
const CSS_IMPRESION = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { margin: 10mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; color: #000; background: #fff; font-size: 13px; }
  .recibo { max-width: 600px; margin: 0 auto; border: 2px solid #000; padding: 20px; color: #000; }
  h1 { font-size: 18px; margin: 0 0 4px; font-weight: 800; }
  h2 { font-size: 13px; margin: 0; color: #000; font-weight: 600; }
  .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 12px; }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px solid #777; }
  .row:last-child { border-bottom: none; }
  .label { color: #000; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .seccion { font-size: 11px; font-weight: 800; text-transform: uppercase; margin: 10px 0 2px; }
  .monto { font-family: ui-monospace, Menlo, monospace; font-weight: 600; white-space: nowrap; }
  .total { margin-top: 12px; padding: 8px 10px; border: 2px solid #000; display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; }
  .firma { margin-top: 40px; display: flex; justify-content: space-between; padding-top: 24px; }
  .firma > div { width: 45%; border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 11px; }
  /* Varios por hoja: de a dos por fila, y ninguno partido entre dos hojas */
  .lote { font-size: 11.5px; padding: 0; }
  .lote .recibo { display: inline-block; vertical-align: top; width: 49%; max-width: none; margin: 0 0 10px; padding: 12px; break-inside: avoid; page-break-inside: avoid; }
  .lote .recibo:nth-child(odd) { margin-right: 2%; }
  .lote h1 { font-size: 15px; }
  .lote .total { font-size: 13.5px; }
  .lote .firma { margin-top: 22px; padding-top: 14px; }
`

function imprimirHTML(html: string, titulo: string, lote = false) {
  const win = window.open('', '_blank', 'width=900,height=900')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><title>${titulo}</title><style>${CSS_IMPRESION}</style></head>
    <body class="${lote ? 'lote' : ''}">${html}<script>setTimeout(() => { window.print(); }, 250)</script></body></html>`)
  win.document.close()
}

function ReciboCuerpo({ data }: { data: ReciboData }) {
  const esNegroPuro = data.empleado.tipo_empleado === 'NEGRO' && !data.esRecboNegroDeBlanco
  // Para NEGRO puro: sin firmas, labels distintos.
  // El recibo INTERNO (adicional de un BLANCO) tampoco lleva firmas.
  const ocultarFirmas = esNegroPuro || data.esRecboNegroDeBlanco
  const labelTotal = esNegroPuro ? 'Total' : 'Total a pagar'
  const labelEmpleado = esNegroPuro ? 'Nombre' : 'Empleado'
  const titulo = esNegroPuro ? 'Detalle de pago' : data.esRecboNegroDeBlanco ? 'Recibo interno' : 'Recibo de pago'
  const fila = 'row flex justify-between gap-3 py-1.5 border-b border-neutral-400'
  return (
    <div className="recibo bg-white text-black p-6 rounded border-2 border-black">
      <div className="header border-b-2 border-black pb-3 mb-3">
        <h1 className="text-lg font-extrabold mb-1">{titulo}</h1>
        <h2 className="text-sm font-semibold">Período: {formatMonth(data.mes)}</h2>
      </div>
      <div className="mb-3 text-sm">
        <div className={fila}>
          <span className="label uppercase text-xs font-bold">{labelEmpleado}</span>
          <span>{data.empleado.apellido}, {data.empleado.nombre}</span>
        </div>
        {data.empleado.dni && (
          <div className={fila}>
            <span className="label uppercase text-xs font-bold">DNI</span>
            <span>{data.empleado.dni}</span>
          </div>
        )}
        <div className={fila}>
          <span className="label uppercase text-xs font-bold">Fecha</span>
          <span>{new Date().toLocaleDateString('es-AR')}</span>
        </div>
      </div>

      <div className="mb-3 text-sm">
        <div className="seccion font-extrabold text-xs uppercase mt-2 mb-1">Conceptos</div>
        {data.conceptos.filter((c) => c.monto > 0).map((c, i) => (
          <div key={i} className={fila}>
            <span>{c.label}</span>
            <span className="monto font-mono font-semibold">{formatCurrency(c.monto)}</span>
          </div>
        ))}
      </div>

      {data.descuentos.some((d) => d.monto > 0) && (
        <div className="mb-3 text-sm">
          <div className="seccion font-extrabold text-xs uppercase mt-2 mb-1">Descuentos</div>
          {data.descuentos.filter((d) => d.monto > 0).map((d, i) => (
            <div key={i} className={fila}>
              <span>{d.label}</span>
              <span className="monto font-mono font-semibold">- {formatCurrency(d.monto)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="total border-2 border-black px-3 py-2 flex justify-between font-extrabold text-base mt-3">
        <span>{labelTotal.toUpperCase()}</span>
        <span className="monto font-mono">{formatCurrency(data.total)}</span>
      </div>

      {!ocultarFirmas && (
        <div className="firma flex justify-between mt-10 pt-6">
          <div className="w-[45%] border-t border-black pt-1 text-center text-xs">Firma empleado</div>
          <div className="w-[45%] border-t border-black pt-1 text-center text-xs">Firma empresa</div>
        </div>
      )}
    </div>
  )
}

function ReciboModal({ data, onClose }: { data: ReciboData; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  function imprimir() {
    if (!ref.current) return
    imprimirHTML(ref.current.innerHTML, `Recibo - ${data.empleado.apellido}, ${data.empleado.nombre}`)
  }

  return (
    <div className="space-y-4">
      <div ref={ref}>
        <ReciboCuerpo data={data} />
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

// Imprimir los recibos de todo el mes juntos, de a varios por hoja.
function ImprimirTodosModal({ filas, armar, onClose }: {
  filas: NominaFila[]
  armar: (n: NominaFila, modo: 'COMPLETO' | 'INTERNO_NEGRO') => ReciboData | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(filas.map((n) => n.id)))
  const [conInternos, setConInternos] = useState(true)
  const tieneInterno = (n: NominaFila) => n.empleado?.tipo_empleado === 'BLANCO' && (n.adicional_no_registrado ?? 0) > 0
  const hayInternos = filas.some(tieneInterno)

  const recibos = filas
    .filter((n) => elegidos.has(n.id))
    .flatMap((n) => [
      armar(n, 'COMPLETO'),
      conInternos && tieneInterno(n) ? armar(n, 'INTERNO_NEGRO') : null,
    ])
    .filter((r): r is ReciboData => !!r)

  function toggle(id: string) {
    setElegidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function imprimir() {
    if (!ref.current || recibos.length === 0) return
    imprimirHTML(ref.current.innerHTML, `Recibos ${filas[0] ? formatMonth(filas[0].mes) : ''}`, true)
  }

  const todos = elegidos.size === filas.length
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Salen de a dos por fila, varios por hoja, y ninguno queda cortado entre dos hojas.
      </p>
      <div className="border border-border rounded-lg divide-y divide-border/60 max-h-80 overflow-y-auto">
        <label className="flex items-center gap-3 px-3 py-2 bg-surface-2/50 text-sm font-medium cursor-pointer">
          <input type="checkbox" checked={todos} onChange={() => setElegidos(todos ? new Set() : new Set(filas.map((n) => n.id)))} />
          Todos
        </label>
        {filas.map((n) => (
          <label key={n.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-surface-2/30">
            <input type="checkbox" checked={elegidos.has(n.id)} onChange={() => toggle(n.id)} />
            <span className="flex-1">{n.empleado?.apellido}, {n.empleado?.nombre}</span>
            <span className="text-xs text-fg-soft">{n.empleado?.tipo_empleado === 'BLANCO' ? 'En blanco' : 'En negro'}</span>
            <span className="font-mono text-xs w-28 text-right">{formatCurrency(n.neto)}</span>
          </label>
        ))}
      </div>
      {hayInternos && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={conInternos} onChange={(e) => setConInternos(e.target.checked)} />
          Incluir también el recibo interno del adicional (empleados en blanco)
        </label>
      )}

      {/* Lo que se imprime: se arma acá oculto y se copia a la hoja */}
      <div ref={ref} className="hidden">
        {recibos.map((r, i) => <ReciboCuerpo key={i} data={r} />)}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button>
        <Button type="button" onClick={imprimir} disabled={recibos.length === 0}>
          <Printer className="w-4 h-4" />
          Imprimir {recibos.length} recibo{recibos.length !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  )
}

// ─── NominaClient ─────────────────────────────────────────────────────────────

interface NominaClientProps {
  nominas: (NominaMensual & { empleado: { nombre: string; apellido: string; dni?: string; tipo_empleado: string; horas_acuerdo_negro?: number; plus_negro_tipo?: 'MONTO' | 'PORCENTAJE' | null; plus_negro_valor?: number | null } | null })[]
  empleados: EmpleadoBasico[]
  aportes: ConfiguracionAporte[]
  mes: string
  horasExtrasMes: HoraExtraRegistro[]
  registrosExtras: HoraExtraRegistro[]
  cajaAguinaldos: Record<string, number>
  cuentas: { id: string; nombre: string; banco: string; titular?: { nombre: string } | null }[]
}

type NominaFila = NominaClientProps['nominas'][number]

// Fila de nómina: primario (empleado/neto/estado/acciones) + detalle contable expandible.
function NominaRow({ n, isPending, onRecibo, onEdit, onPago, onPagoBlanco, onDelete }: {
  n: NominaFila
  isPending: boolean
  onRecibo: (modo: 'COMPLETO' | 'INTERNO_NEGRO') => void
  onEdit: () => void
  onPago: () => void
  onPagoBlanco: (monto: number) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const esBlanco = n.empleado?.tipo_empleado === 'BLANCO'
  const tieneAdicional = (n.adicional_no_registrado ?? 0) > 0
  const pagado = n.total_pagado ?? 0
  const saldo = n.saldo_pendiente ?? n.neto
  const hayParciales = pagado > 0
  const nPagos = n.pagos_parciales?.length ?? 0
  const pagadoPct = n.neto > 0 ? Math.min(100, (pagado / n.neto) * 100) : 0
  const pagada = n.estado === 'PAGADO'
  // Empleado en blanco con adicional: el recibo oficial se suele pagar aparte (banco).
  // Mientras no esté cubierto, se ofrece pagar sólo esa parte y el adicional queda debiendo.
  const recibo = Number(n.monto_recibo_oficial ?? 0)
  const faltaBlanco = esBlanco && tieneAdicional && !pagada && recibo > 0 && pagado < recibo - 0.01
    ? Math.min(recibo - pagado, saldo)
    : 0
  return (
    <>
      <tr className={cn(
        'border-b border-border/60',
        // Pagada: la fila entera en verde, para separar a simple vista lo que se debe de lo que no
        pagada ? 'bg-green-500/15 hover:bg-green-500/20' : 'hover:bg-surface-2/30',
      )}>
        <td className="px-2 py-3 text-center">
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-fg-soft hover:text-fg" title="Ver detalle contable (subtotal, patronales, SAC, costo)">
            <ChevronDown className={cn('w-4 h-4 transition-transform', open ? '' : '-rotate-90')} />
          </button>
        </td>
        <td className="px-4 py-3">
          <p className="font-medium text-fg">{n.empleado?.apellido}, {n.empleado?.nombre}</p>
          <p className="text-xs text-fg-soft flex items-center gap-2">
            {n.empleado?.tipo_empleado}
            {n.asistencia_completa && <span className="text-green-700 flex items-center gap-0.5"><BadgeCheck className="w-3 h-3" />presentismo</span>}
            {tieneAdicional && esBlanco && <span className="text-amber-700">+ adicional</span>}
          </p>
        </td>
        <td className="px-4 py-3 text-right">
          <p className="font-mono font-semibold text-green-700">{formatCurrency(n.neto)}</p>
          {hayParciales && !pagada && (
            <div className="mt-1.5 ml-auto w-48 space-y-1">
              <div className="h-3 w-full bg-neutral-300 rounded-full overflow-hidden border border-neutral-400/60">
                <div className="h-full bg-green-600 transition-all" style={{ width: `${pagadoPct}%` }} />
              </div>
              <p className="text-xs text-fg-muted flex justify-between gap-2">
                <span>Pagado <span className="font-mono font-semibold text-green-700">{formatCurrency(pagado)}</span></span>
                <span className="font-semibold">{Math.round(pagadoPct)}%</span>
              </p>
              <p className="text-xs text-fg-muted text-right">
                Falta <span className="font-mono font-semibold text-amber-700">{formatCurrency(saldo)}</span>
              </p>
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          <EstadoBadge estado={n.estado} />
          <p className="text-[10px] text-fg-soft mt-0.5">
            {pagada
              ? (nPagos > 0 ? `${nPagos} pago${nPagos !== 1 ? 's' : ''} registrado${nPagos !== 1 ? 's' : ''}` : 'saldada (sin pago en ledger)')
              : hayParciales ? `${nPagos} pago${nPagos !== 1 ? 's' : ''} · parcial` : 'sin pago registrado'}
          </p>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            {faltaBlanco > 0 && (
              <Button size="sm" variant="secondary" onClick={() => onPagoBlanco(faltaBlanco)} title={`Pagar sólo el recibo oficial (${formatCurrency(faltaBlanco)}). El adicional queda pendiente.`}>
                <DollarSign className="w-3.5 h-3.5" />
                Pagar sueldo en blanco
              </Button>
            )}
            {!pagada && (
              <Button size="sm" variant="success" onClick={onPago} title="Registrar pago (cuenta, instrumento, parcial o total)">
                <DollarSign className="w-3.5 h-3.5" />
                Registrar pago
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onRecibo('COMPLETO')} title={esBlanco ? 'Recibo oficial (PDF)' : 'Detalle de pago (PDF)'}>
              <Receipt className="w-3.5 h-3.5" />
            </Button>
            {esBlanco && tieneAdicional && (
              <Button size="sm" variant="warning" onClick={() => onRecibo('INTERNO_NEGRO')} title="Recibo interno del adicional (PDF)">
                <FileText className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onEdit} title={pagada ? 'Editar (sólo notas — está pagada)' : 'Editar nómina'}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="danger" disabled={isPending} onClick={onDelete} title="Eliminar nómina">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-surface-2/20 border-b border-border/60">
          <td />
          <td colSpan={4} className="px-4 py-2">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <span className="text-fg-soft">Básico: <span className="font-mono text-fg-muted">{formatCurrency(n.sueldo_basico)}</span></span>
              <span className="text-fg-soft">Subtotal: <span className="font-mono text-fg-muted">{formatCurrency(n.subtotal)}</span></span>
              <span className="text-fg-soft">Patronales: <span className="font-mono text-amber-700">{formatCurrency(n.aportes_patronales)}</span></span>
              <span className="text-fg-soft">Provisión SAC: <span className="font-mono text-amber-800">{n.aguinaldo_provisionado > 0 ? formatCurrency(n.aguinaldo_provisionado) : '—'}</span></span>
              <span className="text-fg-soft">Costo empresa: <span className="font-mono text-primary">{formatCurrency(n.costo_empresa)}</span></span>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export function NominaClient({ nominas, empleados, aportes, mes, horasExtrasMes, registrosExtras, cajaAguinaldos, cuentas }: NominaClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [editNomina, setEditNomina] = useState<NominaMensual | null>(null)
  const [recibo, setRecibo] = useState<ReciboData | null>(null)
  const [pagosNomina, setPagosNomina] = useState<typeof nominas[number] | null>(null)
  // Si se abrió con "Pagar sueldo en blanco": el monto con el que arranca el formulario
  const [montoSugerido, setMontoSugerido] = useState<number | null>(null)
  const [imprimirTodos, setImprimirTodos] = useState(false)
  const [cajaOpen, setCajaOpen] = useState(false)
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

  const { sortKey, sortDir, toggleSort, sortRows } = useSort<'empleado' | 'basico' | 'subtotal' | 'patronales' | 'neto' | 'sac' | 'costo' | 'estado'>('empleado', 'asc')
  const nominasOrdenadas = sortRows(nominas, (n, k): string | number => {
    switch (k) {
      case 'empleado': return `${n.empleado?.apellido ?? ''} ${n.empleado?.nombre ?? ''}`.toLowerCase()
      case 'basico': return Number(n.sueldo_basico ?? 0)
      case 'subtotal': return Number(n.subtotal ?? 0)
      case 'patronales': return Number(n.aportes_patronales ?? 0)
      case 'neto': return Number(n.neto ?? 0)
      case 'sac': return Number(n.aguinaldo_provisionado ?? 0)
      case 'costo': return Number(n.costo_empresa ?? 0)
      case 'estado': return (n.estado ?? '').toLowerCase()
      default: return ''
    }
  })
    // Siempre lo que se debe arriba y lo pagado abajo; adentro de cada grupo, el orden elegido
    .sort((a, b) => Number(a.estado === 'PAGADO') - Number(b.estado === 'PAGADO'))

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

  // Renglones de horas extras SEPARADOS por porcentaje (desde los registros vinculados a la nómina).
  // Si no hay registros vinculados (extras cargadas a mano), cae al renglón único con el promedio guardado.
  function lineasHorasExtras(n: typeof nominas[number]): { label: string; monto: number }[] {
    const vh = n.valor_hora
    const regs = registrosExtras.filter((r) => r.incluido_en_nomina_id === n.id)
    if (regs.length > 0) {
      const porPct = new Map<number, number>()
      for (const r of regs) {
        const pct = Number(r.porcentaje)
        porPct.set(pct, (porPct.get(pct) ?? 0) + Number(r.cantidad))
      }
      return Array.from(porPct.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([pct, hs]) => ({
          label: `Horas extras (${hs} hs al ${pct}%)`,
          monto: hs * vh * (1 + pct / 100),
        }))
    }
    if ((n.horas_extras ?? 0) > 0) {
      return [{
        label: `Horas extras (${formatHoras(n.horas_extras)} al ${n.porcentaje_extras ?? 50}%)`,
        monto: n.horas_extras * vh * (1 + (n.porcentaje_extras ?? 50) / 100),
      }]
    }
    return []
  }

  function bonoLinea(n: typeof nominas[number]): { label: string; monto: number }[] {
    if ((n.bono_monto ?? 0) <= 0) return []
    const c = n.bono_concepto ?? 'Bono'
    return [{
      label: `${c[0] + c.slice(1).toLowerCase()}${n.bono_descripcion ? ` — ${n.bono_descripcion}` : ''}`,
      monto: n.bono_monto ?? 0,
    }]
  }

  function construirDescuentos(n: typeof nominas[number]): { label: string; monto: number }[] {
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
    return descuentos
  }

  function generarRecibo(n: typeof nominas[number], modo: 'COMPLETO' | 'INTERNO_NEGRO') {
    const r = armarRecibo(n, modo)
    if (r) setRecibo(r)
  }

  function armarRecibo(n: typeof nominas[number], modo: 'COMPLETO' | 'INTERNO_NEGRO'): ReciboData | null {
    if (!n.empleado) return null
    const esBlanco = n.empleado.tipo_empleado === 'BLANCO'

    // Recibo INTERNO del adicional no registrado (empleado BLANCO): desglosado por concepto.
    if (modo === 'INTERNO_NEGRO' && esBlanco) {
      const emp = n.empleado
      const vh = n.valor_hora
      const acuerdoHoras = (emp.horas_acuerdo_negro ?? 0) * vh
      const plusV = emp.plus_negro_valor ?? 0
      const plus = emp.plus_negro_tipo === 'MONTO'
        ? plusV
        : emp.plus_negro_tipo === 'PORCENTAJE'
          ? (n.monto_recibo_oficial * plusV) / 100
          : 0
      // Ajuste = remanente entre el adicional cargado y (acuerdo + plus). Garantiza que el desglose sume exacto.
      const ajuste = Math.round((n.adicional_no_registrado - acuerdoHoras - plus) * 100) / 100

      const conceptos = [
        { label: `Acuerdo de horas${(emp.horas_acuerdo_negro ?? 0) > 0 ? ` (${emp.horas_acuerdo_negro} hs)` : ''}`, monto: acuerdoHoras },
        { label: 'Plus salarial', monto: plus },
        ...(ajuste > 0 ? [{ label: 'Ajuste', monto: ajuste }] : []),
        ...lineasHorasExtras(n),
        { label: 'Comida', monto: n.comida || 0 },
        ...bonoLinea(n),
      ]

      const descuentos = construirDescuentos(n)
      if (ajuste < 0) descuentos.push({ label: 'Ajuste', monto: -ajuste })

      const totalConceptos = conceptos.reduce((s, c) => s + c.monto, 0)
      const totalDesc = descuentos.reduce((s, d) => s + d.monto, 0)

      return {
        empleado: n.empleado,
        mes: n.mes,
        esRecboNegroDeBlanco: true,
        conceptos,
        descuentos,
        total: totalConceptos - totalDesc,
      }
    }

    const conceptos = [
      {
        label: esBlanco
          ? `Sueldo básico (${n.horas_trabajadas} hs × ${formatCurrency(n.valor_hora)})`
          : 'Sueldo básico',
        monto: n.sueldo_basico,
      },
      ...lineasHorasExtras(n),
      { label: 'Comida', monto: n.comida },
      { label: 'Presentismo', monto: n.presentismo_monto || 0 },
      { label: 'Aguinaldo (caja)', monto: n.aguinaldo_pagado_de_caja || 0 },
      { label: 'Aguinaldo (SAC)', monto: n.aguinaldo_directo || 0 },
      ...bonoLinea(n),
    ]

    const descuentos = construirDescuentos(n)

    return {
      empleado: n.empleado,
      mes: n.mes,
      esRecboNegroDeBlanco: false,
      conceptos,
      descuentos,
      // Total = neto que efectivamente se paga (sin descontar aportes empleado, eso lo maneja el recibo oficial externo)
      total: n.neto,
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">Nómina</h1>
          <p className="text-sm text-fg-muted mt-0.5">{nominas.length} empleados · {formatMonth(mes)}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={searchParams.get('mes') ?? mes}
            onChange={(e) => router.push(`?mes=${e.target.value}`)}
            className="bg-surface-2 border border-border-strong rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
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
          { label: 'Total neto', value: totalNeto, color: 'text-fg' },
          { label: 'Pagado a cuenta', value: totalPagadoParcial, color: 'text-green-700' },
          { label: 'Pendiente real', value: totalPendiente, color: 'text-amber-700' },
          { label: 'Costo empresa', value: totalCosto, color: 'text-primary' },
        ].map((item) => (
          <div key={item.label} className="bg-surface border border-border rounded-xl p-4">
            <p className="text-xs text-fg-muted mb-1">{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{formatCurrency(item.value)}</p>
          </div>
        ))}
      </div>

      {/* Caja Aguinaldos — colapsable (por defecto solo total) */}
      {totalCaja > 0 && (
        <div className="bg-surface border border-amber-500/20 rounded-xl overflow-hidden">
          <div
            onClick={() => setCajaOpen((o) => !o)}
            className="px-4 py-2.5 flex items-center justify-between gap-2 cursor-pointer select-none hover:bg-surface-2/30 transition-colors"
          >
            <h2 className="text-sm font-medium text-fg-muted flex items-center gap-2">
              <ChevronDown className={cn('w-4 h-4 text-fg-soft transition-transform', cajaOpen ? '' : '-rotate-90')} />
              <PiggyBank className="w-4 h-4 text-amber-700" />
              Caja de aguinaldos
            </h2>
            <span className="text-sm font-mono font-bold text-amber-700">{formatCurrency(totalCaja)}</span>
          </div>
          {cajaOpen && (
            <div className="px-4 pb-3 grid grid-cols-2 md:grid-cols-3 gap-2 border-t border-border-strong/40 pt-3">
              {Object.entries(cajaAguinaldos).filter(([, v]) => v > 0).map(([eid, v]) => {
                const emp = empleados.find((e) => e.id === eid)
                if (!emp) return null
                return (
                  <div key={eid} className="bg-surface-2/40 rounded-lg p-2 flex items-center justify-between">
                    <span className="text-xs text-fg-muted">{emp.apellido}, {emp.nombre}</span>
                    <span className="text-xs font-mono text-amber-700 font-semibold">{formatCurrency(v)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">{formatMonth(mes)}</h2>
          {nominas.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setImprimirTodos(true)} title="Imprimir los recibos de todos juntos, varios por hoja">
              <Printer className="w-3.5 h-3.5" />
              Imprimir todos
            </Button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-3 w-8" />
              <SortTh col="empleado" label="Empleado" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <SortTh col="neto" label="Neto" align="right" numeric sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <SortTh col="estado" label="Estado" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <th className="px-4 py-3 text-right text-xs font-medium text-fg-muted uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {nominas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-fg-soft">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No hay nómina para {formatMonth(mes)}
                </td>
              </tr>
            ) : (
              nominasOrdenadas.map((n) => (
                <NominaRow
                  key={n.id}
                  n={n}
                  isPending={isPending}
                  onRecibo={(modo) => generarRecibo(n, modo)}
                  onEdit={() => { setEditNomina(n); setModalOpen(true) }}
                  onPago={() => { setMontoSugerido(null); setPagosNomina(n) }}
                  onPagoBlanco={(monto) => { setMontoSugerido(monto); setPagosNomina(n) }}
                  onDelete={() => { if (confirm('¿Eliminar esta nómina?')) startTransition(() => deleteNomina(n.id)) }}
                />
              ))
            )}
          </tbody>
          {nominas.length > 0 && (
            <tfoot>
              <tr className="border-t border-border-strong bg-surface-2/50">
                <td />
                <td className="px-4 py-3 text-sm font-semibold text-fg-muted">TOTAL · costo empresa {formatCurrency(totalCosto)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-green-700">{formatCurrency(totalNeto)}</td>
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
          registrosExtras={registrosExtras}
          cajaAguinaldos={cajaAguinaldos}
          nomina={editNomina ?? undefined}
          onClose={() => { setModalOpen(false); setEditNomina(null) }}
        />
      </Modal>

      <RegistrarPagoModal
        open={!!pagosNomina}
        onOpenChange={(o) => { if (!o) { setPagosNomina(null); setMontoSugerido(null) } }}
        target={pagosNomina ? {
          tipo_origen: 'NOMINA',
          origen_id: pagosNomina.id,
          monto_total: Number(pagosNomina.neto),
          saldo_pendiente: pagosNomina.saldo_pendiente ?? Number(pagosNomina.neto),
          moneda: 'ARS',
          descripcion: `Sueldo ${pagosNomina.empleado?.apellido ?? ''}, ${pagosNomina.empleado?.nombre ?? ''}`.trim(),
          contexto: pagosNomina.mes,
          monto_sugerido: montoSugerido,
          notas_sugeridas: montoSugerido ? 'Sueldo en blanco (recibo oficial)' : null,
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
          debitado: p.debitado,
          fecha_debito: p.fecha_debito,
        })) as PagoHistorialItem[] | undefined}
      />

      <Modal
        open={liqMasivaOpen}
        onOpenChange={setLiqMasivaOpen}
        title={`Liquidación masiva — ${formatMonth(mes)}`}
        className="max-w-3xl"
      >
        <LiquidacionMasivaModal
          empleados={empleados}
          mes={mes}
          nominasExistentes={nominasExistentes}
          horasExtrasMes={horasExtrasMes}
          onClose={() => setLiqMasivaOpen(false)}
        />
      </Modal>

      <Modal open={imprimirTodos} onOpenChange={setImprimirTodos} title={`Imprimir recibos — ${formatMonth(mes)}`} className="max-w-2xl">
        {imprimirTodos && (
          <ImprimirTodosModal filas={nominasOrdenadas} armar={armarRecibo} onClose={() => setImprimirTodos(false)} />
        )}
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
