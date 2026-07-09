'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { upsertDatosGN } from '@/app/actions/compras'
import { setComisionOverride } from '@/app/actions/comisiones'
import type { DatosVentasGN, Marca } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { MarcaBadge } from '@/components/ui/badge'
import { formatCurrency, formatMonth, getMonthOptions, cn } from '@/lib/utils'
import { Plus, Loader2 } from 'lucide-react'

const MARCAS: Marca[] = ['BDI', 'ZATTIA', 'STUNNED']

function VentaForm({ mes, onClose }: { mes: string; onClose: () => void }) {
  const [error, action, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const res = await upsertDatosGN(prev, fd)
      if (!res) onClose()
      return res
    },
    null
  )

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Select
          label="Mes"
          name="mes"
          defaultValue={mes}
          options={getMonthOptions()}
        />
        <Select
          label="Marca"
          name="marca"
          defaultValue="BDI"
          options={MARCAS.map((m) => ({ value: m, label: m }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Input label="Ventas brutas" name="ventas_brutas" type="number" step="0.01" defaultValue="0" />
        <Input label="Devoluciones" name="devoluciones" type="number" step="0.01" defaultValue="0" />
        <Input label="Ventas netas" name="ventas_netas" type="number" step="0.01" defaultValue="0" />
        <Input label="CMV" name="cmv" type="number" step="0.01" defaultValue="0" />
        <Input label="Cantidad vendida" name="cantidad_vendida" type="number" defaultValue="0" />
        <Input label="Comisiones" name="comisiones" type="number" step="0.01" defaultValue="0" />
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Guardar datos
        </Button>
      </div>
    </form>
  )
}

// Una columna del cuadro (una marca o el total), con la cascada estilo P&L de GN.
interface Col {
  marca: string
  brutas: number
  iva: number
  netoIva: number
  envios: number
  descuentos: number
  netas: number
  blanco: number
  negro: number
  cmv: number
  comEst: number        // comisión estimada (por % de medio de pago)
  comEf: number         // comisión efectiva = override ?? estimada
  esOverride: boolean
  margen: number        // = netas − cmv − comEf
  margenPct: number
  cantidad: number
  vacia: boolean
}

function colDesde(marca: string, v: DatosVentasGN | undefined): Col {
  const brutas = v?.ventas_brutas ?? 0
  const iva = v?.iva_debito ?? 0
  const envios = v?.envios ?? 0
  const descuentos = v?.descuentos ?? 0
  const netas = v?.ventas_netas ?? 0
  const cmv = v?.cmv ?? 0
  const comEst = v?.comisiones ?? 0
  const comEf = v?.comisiones_override ?? comEst
  const margen = netas - cmv - comEf
  return {
    marca,
    brutas, iva, netoIva: brutas - iva, envios, descuentos, netas,
    blanco: v?.ventas_netas_blanco ?? 0,
    negro: v?.ventas_netas_negro ?? 0,
    cmv, comEst, comEf, esOverride: v?.comisiones_override != null,
    margen, margenPct: netas > 0 ? (margen / netas) * 100 : 0,
    cantidad: v?.cantidad_vendida ?? 0,
    vacia: !v,
  }
}

export function VentasClient({ ventas, mes }: { ventas: DatosVentasGN[]; mes: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)

  const cols = MARCAS.map((m) => colDesde(m, ventas.find((x) => x.marca === m)))
  const sum = (f: (c: Col) => number) => cols.reduce((s, c) => s + f(c), 0)
  const total: Col = {
    marca: 'TOTAL',
    brutas: sum((c) => c.brutas), iva: sum((c) => c.iva), netoIva: sum((c) => c.netoIva),
    envios: sum((c) => c.envios), descuentos: sum((c) => c.descuentos), netas: sum((c) => c.netas),
    blanco: sum((c) => c.blanco), negro: sum((c) => c.negro), cmv: sum((c) => c.cmv),
    comEst: sum((c) => c.comEst), comEf: sum((c) => c.comEf), esOverride: cols.some((c) => c.esOverride),
    margen: sum((c) => c.margen), margenPct: sum((c) => c.netas) > 0 ? (sum((c) => c.margen) / sum((c) => c.netas)) * 100 : 0,
    cantidad: sum((c) => c.cantidad), vacia: ventas.length === 0,
  }
  const allCols = [...cols, total]

  // Override manual de comisiones por marca (pisa el estimado). Vacío = usar estimado.
  const [savingCom, startCom] = useTransition()
  const commitComision = (c: Col, raw: string) => {
    const inicial = c.esOverride ? String(c.comEf) : ''
    if (raw.trim() === inicial.trim()) return
    const val = raw.trim() === '' ? null : Number(raw)
    if (val !== null && !Number.isFinite(val)) return
    startCom(async () => {
      const err = await setComisionOverride(mes, c.marca as Marca, val)
      if (err) alert(err)
      else router.refresh()
    })
  }

  // Una fila de la cascada: etiqueta + valor por columna, con estilos.
  // Función plana (no componente) para evitar react-hooks/static-components.
  type RowCfg = {
    label: string
    get: (c: Col) => number
    tone?: 'muted' | 'fg' | 'red' | 'green' | 'amber'
    bold?: boolean
    indent?: boolean
    sub?: boolean   // fila subtotal (línea arriba)
    pct?: boolean
    int?: boolean
    signo?: '+' | '−'
  }
  const row = ({ label, get, tone = 'muted', bold, indent, sub, pct, int, signo }: RowCfg) => {
    const toneCls = { muted: 'text-fg-muted', fg: 'text-fg', red: 'text-red-700', green: 'text-green-700', amber: 'text-amber-700' }[tone]
    return (
      <tr key={label} className={cn('border-b border-border/50', sub && 'border-t border-border-strong/60 bg-surface-2/30', bold && 'bg-surface-2/40')}>
        <td className={cn('px-4 py-2 text-sm', indent ? 'pl-8 text-fg-soft' : 'text-fg-muted', bold && 'font-semibold text-fg')}>
          {signo && <span className="text-fg-soft mr-1">{signo}</span>}{label}
        </td>
        {allCols.map((c) => (
          <td key={c.marca} className={cn('px-4 py-2 text-right font-mono', bold ? 'font-semibold' : '', pct ? 'text-fg-muted' : toneCls, c.vacia && 'text-fg-soft')}>
            {c.vacia ? '—' : pct ? `${get(c).toFixed(1)}%` : int ? get(c).toLocaleString('es-AR') : (signo === '−' ? '-' : '') + formatCurrency(get(c)).replace('-', '')}
          </td>
        ))}
      </tr>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">Panel de Ventas</h1>
          <p className="text-sm text-fg-muted mt-0.5">Datos de Gestión Nube — {formatMonth(mes)}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={searchParams.get('mes') ?? mes}
            onChange={(e) => router.push(`?mes=${e.target.value}`)}
            className="bg-surface-2 border border-border-strong rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {getMonthOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Cargar ventas
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-strong">
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Concepto</th>
              {cols.map((c) => (
                <th key={c.marca} className="px-4 py-3"><div className="flex justify-end"><MarcaBadge marca={c.marca as Marca} /></div></th>
              ))}
              <th className="text-right px-4 py-3 text-xs font-semibold text-fg-muted uppercase">Total</th>
            </tr>
          </thead>
          <tbody>
            {row({ label: 'Ventas (con IVA)', get: (c) => c.brutas, tone: 'fg' })}
            {row({ label: 'IVA débito fiscal (blanco)', get: (c) => c.iva, tone: 'red', signo: '−' })}
            {row({ label: 'Ventas (neto de IVA)', get: (c) => c.netoIva, sub: true })}
            {row({ label: 'Envíos', get: (c) => c.envios, tone: 'green', signo: '+' })}
            {row({ label: 'Descuentos', get: (c) => c.descuentos, tone: 'red', signo: '−' })}
            {row({ label: 'Ingresos variables (ventas netas)', get: (c) => c.netas, bold: true, sub: true })}
            {row({ label: 'En blanco (facturado)', get: (c) => c.blanco, indent: true, tone: 'green' })}
            {row({ label: 'En negro (efectivo/propias)', get: (c) => c.negro, indent: true, tone: 'amber' })}
            {row({ label: 'CMV (costo del producto)', get: (c) => c.cmv, tone: 'red', signo: '−' })}
            {/* Comisiones — editable por marca (override manual sobre el estimado) */}
            <tr className="border-b border-border/50">
              <td className="px-4 py-2 text-sm text-fg-muted">
                <span className="text-fg-soft mr-1">−</span>Comisiones (costos comerciales)
              </td>
              {cols.map((c) => (
                <td key={c.marca} className="px-3 py-1.5 text-right">
                  {c.vacia ? (
                    <span className="font-mono text-fg-soft">—</span>
                  ) : (
                    <input
                      key={`${mes}-${c.marca}`}
                      type="number"
                      step="1"
                      inputMode="decimal"
                      defaultValue={c.esOverride ? String(Math.round(c.comEf)) : ''}
                      placeholder={Math.round(c.comEst).toLocaleString('es-AR')}
                      disabled={savingCom}
                      onBlur={(e) => commitComision(c, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      title={c.esOverride ? 'Override manual — vaciar para volver al estimado' : `Estimado ${formatCurrency(c.comEst)} — escribí el real para pisarlo`}
                      className={cn(
                        'w-28 text-right px-2 py-1 rounded border font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60',
                        c.esOverride ? 'border-amber-500/50 bg-amber-500/5 text-amber-700' : 'border-border-strong bg-surface-2 text-red-700',
                      )}
                    />
                  )}
                </td>
              ))}
              <td className="px-4 py-2 text-right font-mono text-red-700">
                {total.vacia ? '—' : '-' + formatCurrency(total.comEf).replace('-', '')}
              </td>
            </tr>
            {row({ label: 'Margen de contribución', get: (c) => c.margen, bold: true, sub: true, tone: 'green' })}
            {row({ label: 'Margen %', get: (c) => c.margenPct, pct: true })}
            {row({ label: 'Unidades', get: (c) => c.cantidad, int: true })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-fg-soft">
        <b>Blanco</b> = ventas cobradas en cuentas de Areben (se facturan, pagan IVA); <b>negro</b> = efectivo/cuentas propias (sin IVA).
        El IVA se descuenta solo del blanco. <b>Comisiones</b>: se estiman con el % por medio de pago (Configuración → Comisiones);
        podés pisar el número real por marca escribiéndolo en la fila (queda en ámbar). El <b>margen de contribución</b> ya resta
        CMV y comisiones; los gastos operativos se restan después, en el resultado del mes.
      </p>

      <Modal open={modalOpen} onOpenChange={setModalOpen} title="Cargar datos de ventas" description="Ingresá los datos de Gestión Nube manualmente">
        <VentaForm mes={mes} onClose={() => setModalOpen(false)} />
      </Modal>
    </div>
  )
}
