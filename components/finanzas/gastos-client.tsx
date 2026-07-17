'use client'

import { useActionState, useState, useTransition, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createGasto, updateGasto, deleteGasto, marcarGastoPagado, updateMontoGasto, revertirPagoGasto } from '@/app/actions/finanzas'
import type { Gasto, ProrrateoMarcas, ProrrateoDefault, TipoIVA, ConfiguracionProrrateo } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { EstadoBadge, MarcaBadge, Badge } from '@/components/ui/badge'
import { useSort, SortTh } from '@/components/ui/sortable'
import { formatCurrency, formatDate, getMonthOptions, labelCuenta, ordenarCuentas } from '@/lib/utils'
import { estadoGasto, type EstadoGasto } from '@/lib/gastos-estado'
import {
  Plus, Pencil, Trash2, CheckCircle, Filter, TrendingDown, Loader2,
  Info, Layers, Receipt, Wallet, CreditCard, Save, X, Search, RotateCcw, ChevronDown, ListTree,
} from 'lucide-react'
import { ProrrateoEditor } from './prorrateo-editor'
import { MoneyInput } from '@/components/ui/money-input'
import { cn } from '@/lib/utils'

const CATEGORIAS_COMUNES = [
  'Alquiler', 'Servicios', 'Sueldos', 'Marketing', 'Logística',
  'Impuestos', 'Seguros', 'Mantenimiento', 'Tecnología', 'Inversiones', 'Otros',
]
const MARCAS = ['BDI', 'ZATTIA', 'STUNNED', 'GENERAL']
// Estado GUARDADO en la base (el que se elige a mano en el form del gasto).
const ESTADOS_GUARDADOS = [
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'PAGADO', label: 'Pagado' },
  { value: 'DEVENGADO', label: 'Devengado' },
]
// Estados COMPUTADOS (ver lib/gastos-estado.ts) — para filtrar; no son el estado guardado.
const ESTADOS_FILTRO: { value: EstadoGasto; label: string }[] = [
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'PAGO_PROGRAMADO', label: 'Pago programado' },
  { value: 'CUENTA_CORRIENTE', label: 'Cuenta corriente' },
  { value: 'VENCIDO', label: 'Vencido' },
  { value: 'PAGADO', label: 'Pagado' },
  { value: 'DEVENGADO', label: 'Devengado' },
]
const MEDIOS_PAGO = [
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'TARJETA', label: 'Tarjeta' },
  { value: 'DEBITO_AUTOMATICO', label: 'Débito automático' },
  { value: 'CTA_CORRIENTE', label: 'Cuenta corriente' },
]

interface GastosClientProps {
  gastos: Gasto[]
  mes: string
  categorias: string[]
  filtros: { negocio?: string; estado?: string }
  cuentas: { id: string; nombre: string; banco: string; titular?: { nombre: string } | null }[]
  tarjetas: { id: string; nombre: string; banco: string }[]
  prorrateosDefault: ProrrateoDefault[]
  tiposIva: TipoIVA[]
  configProrrateo: ConfiguracionProrrateo[]
  recurrentes?: { id: string; concepto?: string | null; dia_vencimiento?: number | null; tipo_mes?: string | null }[]
  pagosByGasto?: Record<string, { monto: number; debitado: boolean; fecha_vencimiento: string | null }[]>
  hoy?: string
}

// ─── GastoForm ────────────────────────────────────────────────────────────────

function GastoForm({
  gasto,
  mes,
  categorias,
  cuentas,
  tarjetas,
  prorrateosDefault,
  tiposIva,
  configProrrateo,
  onClose,
}: {
  gasto?: Gasto
  mes: string
  categorias: string[]
  cuentas: { id: string; nombre: string; banco: string; titular?: { nombre: string } | null }[]
  tarjetas: { id: string; nombre: string; banco: string }[]
  prorrateosDefault: ProrrateoDefault[]
  tiposIva: TipoIVA[]
  configProrrateo: ConfiguracionProrrateo[]
  onClose: () => void
}) {
  const action = gasto ? updateGasto.bind(null, gasto.id) : createGasto

  const [ivaIncluido, setIvaIncluido] = useState(gasto?.iva_incluido ?? false)
  const [porcentajeIva, setPorcentajeIva] = useState(gasto?.porcentaje_iva ?? 21)
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>(gasto?.moneda ?? 'ARS')
  const [monto, setMonto] = useState(gasto?.monto ?? 0)
  const [cuotasTotal, setCuotasTotal] = useState(gasto?.cuotas_total ?? 1)
  const [esCompartido, setEsCompartido] = useState(!!gasto?.prorrateo)
  const [tieneIntereses, setTieneIntereses] = useState(!!gasto?.tiene_intereses)
  const [interesTipo, setInteresTipo] = useState<'MONTO' | 'PORCENTAJE'>((gasto?.interes_tipo as 'MONTO' | 'PORCENTAJE') ?? 'PORCENTAJE')
  const [interesValor, setInteresValor] = useState(gasto?.interes_valor ?? 0)

  const defaultFromConfig: ProrrateoMarcas = Object.fromEntries(
    configProrrateo.map((c) => [c.marca, c.porcentaje])
  )

  const [prorrateo, setProrrateo] = useState<ProrrateoMarcas>(
    gasto?.prorrateo
      ?? (Object.keys(defaultFromConfig).length > 0
        ? defaultFromConfig
        : prorrateosDefault.find((p) => p.es_default)?.porcentajes
          ?? { BDI: 33.33, ZATTIA: 33.33, STUNNED: 33.34 })
  )
  const [medioPago, setMedioPago] = useState(gasto?.medio_pago || 'TRANSFERENCIA')
  const [estado, setEstado] = useState<string>(gasto?.estado ?? 'PENDIENTE')

  const factorIva = 1 + porcentajeIva / 100
  const montoNetoCalc = ivaIncluido && factorIva > 0 ? monto / factorIva : monto
  // La fecha de pago es obligatoria salvo cuenta corriente (o TARJETA, que la completa
  // el server automáticamente) MIENTRAS el gasto siga PENDIENTE. Si ya se marca PAGADO,
  // la fecha es obligatoria siempre. Coincide con el superRefine de gastoSchema.
  const fechaPagoExenta =
    (medioPago === 'CTA_CORRIENTE' || medioPago === 'CUENTA_CORRIENTE' || medioPago === 'TARJETA') &&
    estado !== 'PAGADO'

  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('iva_incluido', ivaIncluido ? 'true' : 'false')
      fd.set('porcentaje_iva', String(porcentajeIva))
      fd.set('moneda', moneda)
      fd.set('monto', String(monto))
      fd.set('cuotas_total', String(medioPago === 'TARJETA' ? cuotasTotal : 1))
      // Intereses solo cuando hay tarjeta + cuotas > 1
      const aplicaInteres = medioPago === 'TARJETA' && cuotasTotal > 1 && tieneIntereses
      fd.set('tiene_intereses', aplicaInteres ? 'true' : 'false')
      fd.set('interes_tipo', aplicaInteres ? interesTipo : '')
      fd.set('interes_valor', aplicaInteres ? String(interesValor) : '0')
      if (esCompartido) fd.set('prorrateo', JSON.stringify(prorrateo))
      else fd.delete('prorrateo')
      const r = await action(prev, fd)
      if (!r) onClose()
      return r
    },
    null
  )

  const todasCategorias = [...new Set([...CATEGORIAS_COMUNES, ...categorias])].sort()

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Select label="Categoría" name="categoria" defaultValue={gasto?.categoria ?? ''}
          options={todasCategorias.map((c) => ({ value: c, label: c }))} placeholder="Seleccionar..." required />
        <Select label="Negocio" name="negocio" defaultValue={gasto?.negocio ?? 'GENERAL'}
          options={MARCAS.map((m) => ({ value: m, label: m }))} />
      </div>

      <Input label="Concepto" name="concepto" defaultValue={gasto?.concepto} placeholder="Descripción del gasto" required />

      <div className="bg-surface-2/40 border border-border-strong/40 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="col-span-2">
            <MoneyInput
              label="Monto"
              value={monto}
              onChange={setMonto}
              prefix={moneda === 'USD' ? 'U$S' : '$'}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-fg-muted">Moneda</label>
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as 'ARS' | 'USD')}
              className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-fg-muted">Tipo IVA</label>
            <select
              value={porcentajeIva}
              onChange={(e) => setPorcentajeIva(Number(e.target.value))}
              className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            >
              {tiposIva.map((t) => (
                <option key={t.id} value={t.porcentaje}>{t.nombre}</option>
              ))}
            </select>
          </div>
          <Input
            label="Fecha del gasto"
            name="fecha"
            type="date"
            defaultValue={gasto?.fecha ?? new Date().toISOString().split('T')[0]}
            required
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={ivaIncluido}
            onChange={(e) => setIvaIncluido(e.target.checked)}
            className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2"
          />
          <span className="text-sm text-fg-muted">El monto incluye IVA</span>
        </label>

        {ivaIncluido && monto > 0 && (
          <div className="bg-surface-2/40 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
            <span className="text-fg-muted">Neto sin IVA ({porcentajeIva}%)</span>
            <span className="font-mono text-green-700 font-semibold">
              {formatCurrency(montoNetoCalc, moneda)}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Select label="Estado" name="estado" value={estado} onChange={(e) => setEstado(e.target.value)}
          options={ESTADOS_GUARDADOS} />
        <Input
          label={`Fecha de pago${fechaPagoExenta ? ' (opcional)' : ' *'}`}
          name="fecha_pago"
          type="date"
          defaultValue={gasto?.fecha_pago ?? ''}
          required={!fechaPagoExenta}
        />
      </div>

      {/* Medio de pago */}
      <div className="bg-surface-2/40 border border-border-strong/40 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Medio de pago *"
            name="medio_pago"
            value={medioPago}
            onChange={(e) => setMedioPago(e.target.value)}
            options={MEDIOS_PAGO}
            required
          />
          {medioPago === 'TARJETA' ? (
            <Select
              label="Tarjeta *"
              name="tarjeta_id"
              defaultValue={gasto?.tarjeta_id ?? ''}
              options={[{ value: '', label: '— Seleccionar —' }, ...tarjetas.map((t) => ({ value: t.id, label: `${t.banco} · ${t.nombre}` }))]}
              required
            />
          ) : medioPago && medioPago !== '' ? (
            <Select
              label="Cuenta"
              name="cuenta_id"
              defaultValue={gasto?.cuenta_id ?? ''}
              options={[{ value: '', label: '— Sin asignar —' }, ...ordenarCuentas(cuentas).map((c) => ({ value: c.id, label: labelCuenta(c) }))]}
            />
          ) : null}
        </div>

        {medioPago === 'TARJETA' && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-fg-muted flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              Cantidad de cuotas *
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {[1, 3, 6, 12, 18, 24].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCuotasTotal(n)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg border text-sm font-mono font-medium transition-colors',
                    cuotasTotal === n
                      ? 'bg-orange-500/20 border-orange-500/50 text-orange-600'
                      : 'bg-surface-2 border-[#c8c0b0] text-fg-muted hover:text-fg-muted'
                  )}
                >
                  {n}{n === 1 ? ' (sin cuotas)' : ' cuotas'}
                </button>
              ))}
              <input
                type="number"
                min="1"
                value={cuotasTotal}
                onChange={(e) => setCuotasTotal(Math.max(1, Number(e.target.value)))}
                className="w-20 px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-fg font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {cuotasTotal > 1 && monto > 0 && !tieneIntereses && (
              <p className="text-xs text-fg-soft">
                {cuotasTotal} cuotas de <span className="font-mono text-amber-700">{formatCurrency(monto / cuotasTotal, moneda)}</span> · pasivos generados al pagar
              </p>
            )}
          </div>
        )}

        {/* Intereses por financiación — solo TARJETA con cuotas > 1 */}
        {medioPago === 'TARJETA' && cuotasTotal > 1 && (
          <div className="bg-surface-2/40 border border-border-strong/40 rounded-lg p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={tieneIntereses}
                onChange={(e) => setTieneIntereses(e.target.checked)}
                className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2"
              />
              <span className="text-sm text-fg-muted">Tiene intereses por financiación</span>
              <span className="text-xs text-fg-soft">(se registra como "Gasto Financiero")</span>
            </label>
            {tieneIntereses && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-fg-muted">Tipo de interés</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['MONTO', 'PORCENTAJE'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setInteresTipo(t)}
                        className={cn(
                          'px-3 py-2 rounded-lg border text-xs font-medium transition-colors',
                          interesTipo === t
                            ? 'bg-amber-600/20 border-amber-500/50 text-amber-800'
                            : 'bg-surface-2 border-[#c8c0b0] text-fg-muted hover:text-fg-muted'
                        )}
                      >
                        {t === 'MONTO' ? 'Monto fijo $' : '% sobre precio'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-fg-muted">
                    {interesTipo === 'MONTO' ? 'Monto del interés ($)' : 'Porcentaje (%)'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={interesValor || ''}
                      onChange={(e) => setInteresValor(Math.max(0, Number(e.target.value)))}
                      className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-soft text-xs">
                      {interesTipo === 'MONTO' ? '$' : '%'}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {tieneIntereses && monto > 0 && (() => {
              const interes = interesTipo === 'MONTO' ? interesValor : (monto * interesValor) / 100
              const total = monto + interes
              const cuota = total / cuotasTotal
              return (
                <div className="bg-surface/40 rounded-lg px-3 py-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-fg-soft">Precio</p>
                    <p className="font-mono text-fg-muted">{formatCurrency(monto, moneda)}</p>
                  </div>
                  <div>
                    <p className="text-fg-soft">+ Intereses</p>
                    <p className="font-mono text-amber-700">+{formatCurrency(interes, moneda)}</p>
                  </div>
                  <div>
                    <p className="text-fg-soft">Cuota mensual</p>
                    <p className="font-mono text-orange-600 font-semibold">{formatCurrency(cuota, moneda)}</p>
                    <p className="text-[10px] text-fg-muted">{cuotasTotal} × {formatCurrency(cuota, moneda)}</p>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* Prorrateo */}
      <div className="bg-surface-2/60 border border-border-strong/60 rounded-xl p-4 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={esCompartido}
            onChange={(e) => setEsCompartido(e.target.checked)}
            className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2"
          />
          <Layers className="w-4 h-4 text-fg-muted" />
          <span className="text-sm font-medium text-fg-muted">Gasto compartido (prorratear entre marcas)</span>
        </label>
        {esCompartido && (
          <div className="pl-6">
            <ProrrateoEditor value={prorrateo} onChange={setProrrateo} defaults={prorrateosDefault} />
          </div>
        )}
      </div>

      <Textarea label="Notas (opcional)" name="notas" defaultValue={gasto?.notas ?? ''} placeholder="Información adicional..." />

      {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {gasto ? 'Guardar cambios' : 'Crear gasto'}
        </Button>
      </div>
    </form>
  )
}

// ─── DetalleGastoModal ────────────────────────────────────────────────────────

function DetalleGastoModal({ gasto, onClose }: { gasto: Gasto; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <div className="bg-surface-2/60 rounded-lg p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-fg-muted">Concepto</span><span className="text-fg">{gasto.concepto}</span></div>
        <div className="flex justify-between"><span className="text-fg-muted">Categoría</span><span>{gasto.categoria}</span></div>
        <div className="flex justify-between">
          <span className="text-fg-muted">Monto bruto</span>
          <span className="font-mono">{formatCurrency(gasto.monto)}</span>
        </div>
        {gasto.iva_incluido && (
          <>
            <div className="flex justify-between">
              <span className="text-fg-muted">Monto neto (sin IVA {gasto.porcentaje_iva}%)</span>
              <span className="font-mono text-green-700">{formatCurrency(gasto.monto_neto)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">IVA</span>
              <span className="font-mono text-amber-700">{formatCurrency(gasto.monto - gasto.monto_neto)}</span>
            </div>
          </>
        )}
        {gasto.medio_pago && (
          <div className="flex justify-between"><span className="text-fg-muted">Medio pago</span><span>{gasto.medio_pago}</span></div>
        )}
      </div>

      {gasto.prorrateo && (
        <div className="bg-surface-2/60 rounded-lg p-4">
          <p className="text-xs font-medium text-fg-muted mb-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            Prorrateo entre marcas
          </p>
          <div className="space-y-1.5">
            {Object.entries(gasto.prorrateo).map(([marca, pct]) => (
              <div key={marca} className="flex justify-between items-center text-sm">
                <span className="text-fg-muted">{marca}</span>
                <span className="font-mono">
                  <span className="text-primary">{pct}%</span>
                  <span className="text-fg-muted ml-2">→ {formatCurrency((gasto.monto * Number(pct)) / 100)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {gasto.detalles && Object.keys(gasto.detalles).length > 0 && (
        <div className="bg-surface-2/60 rounded-lg p-4">
          <p className="text-xs font-medium text-fg-muted mb-2">Detalles técnicos</p>
          <pre className="text-xs text-fg-muted font-mono whitespace-pre-wrap">{JSON.stringify(gasto.detalles, null, 2)}</pre>
        </div>
      )}

      {gasto.recurrente_id && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-xs text-blue-300 flex items-center gap-2">
          <Receipt className="w-3.5 h-3.5" />
          Generado a partir de un gasto recurrente
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
      </div>
    </div>
  )
}

// ─── PagarModal ───────────────────────────────────────────────────────────────

function PagarModal({
  gasto,
  cuentas,
  onClose,
}: {
  gasto: Gasto
  cuentas: { id: string; nombre: string; banco: string; titular?: { nombre: string } | null }[]
  onClose: () => void
}) {
  const [cuentaId, setCuentaId] = useState(gasto.cuenta_origen_pago_id ?? gasto.cuenta_id ?? '')
  const [fechaPago, setFechaPago] = useState(gasto.fecha_pago ?? new Date().toISOString().split('T')[0])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const esTarjeta = gasto.medio_pago === 'TARJETA'

  function confirmar() {
    setError(null)
    if (!fechaPago) {
      setError('Ingresá la fecha de pago')
      return
    }
    if (!esTarjeta && !cuentaId) {
      setError('Seleccioná la cuenta de origen del pago')
      return
    }
    startTransition(async () => {
      try {
        await marcarGastoPagado(gasto.id, cuentaId || null, fechaPago)
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-2/60 rounded-lg p-3">
        <p className="text-sm text-fg font-medium">{gasto.concepto}</p>
        <p className="text-xs text-fg-soft mt-0.5">
          {gasto.categoria} · <span className="font-mono">{formatCurrency(gasto.monto, gasto.moneda)}</span>
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-fg-muted">
          Fecha de pago <span className="text-red-700">*</span>
        </label>
        <input
          type="date"
          value={fechaPago}
          onChange={(e) => setFechaPago(e.target.value)}
          required
          className="w-full px-3 py-2 bg-surface-2 border border-border-strong rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
        />
      </div>

      {esTarjeta ? (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
          <CreditCard className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            Pago con tarjeta. Se generarán automáticamente {gasto.cuotas_total ?? 1} cuota(s) en la proyección de pasivos.
            No se requiere cuenta de origen ahora.
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted flex items-center gap-1.5">
            <Wallet className="w-4 h-4" />
            Cuenta de origen <span className="text-red-700">*</span>
          </label>
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-border-strong rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            required
          >
            <option value="">— Seleccionar cuenta —</option>
            {ordenarCuentas(cuentas).map((c) => (
              <option key={c.id} value={c.id}>{labelCuenta(c)}</option>
            ))}
          </select>
          <p className="text-xs text-fg-soft">Solo registro — no afecta saldos por ahora</p>
        </div>
      )}

      {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={confirmar} disabled={isPending} title="Confirmar pago del gasto">
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Marcar pagado
        </Button>
      </div>
    </div>
  )
}

// ─── GastosClient ─────────────────────────────────────────────────────────────

// ─── MontoGastoEditor (edición inline del monto) ──────────────────────────────

function MontoGastoEditor({ gasto, onSaved }: { gasto: Gasto; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState<number>(Number(gasto.monto))
  const [isPending, startTransition] = useTransition()

  // Condiciones para deshabilitar la edición inline (ver server action updateMontoGasto)
  const noEditable =
    gasto.estado === 'PAGADO' ||
    !!gasto.auto_generado ||
    !!gasto.gasto_padre_id ||
    (gasto.cuotas_total ?? 1) > 1

  const tooltipNoEditable = gasto.estado === 'PAGADO'
    ? 'Ya pagado — editá desde el modal si necesitás corregir'
    : (gasto.auto_generado || gasto.gasto_padre_id)
      ? 'Auto-generado — modificá el gasto principal'
      : (gasto.cuotas_total ?? 1) > 1
        ? 'Con cuotas — editá desde el modal para regenerar las cuotas'
        : 'Editar monto'

  if (!editing) {
    return (
      <div className="flex items-center justify-end gap-1.5 group">
        <span className="font-mono font-medium text-fg">{formatCurrency(gasto.monto, gasto.moneda || 'ARS')}</span>
        {!noEditable && (
          <button
            type="button"
            onClick={() => { setVal(Number(gasto.monto)); setEditing(true) }}
            title="Editar monto (Enter para guardar, Esc para cancelar)"
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-2 text-fg-soft hover:text-fg transition-all"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
        {noEditable && (
          <span className="opacity-0 group-hover:opacity-100 text-fg-soft text-[10px] transition-all" title={tooltipNoEditable}>
            🔒
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <input
        type="number"
        step="0.01"
        min="0"
        value={val || ''}
        onChange={(e) => setVal(Number(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click()
          }
          if (e.key === 'Escape') {
            setVal(Number(gasto.monto))
            setEditing(false)
          }
        }}
        autoFocus
        className="w-28 px-2 py-1 bg-surface border border-border-strong rounded text-fg font-mono text-xs text-right focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-primary/25"
      />
      <button
        type="button"
        disabled={isPending || val <= 0}
        onClick={() => {
          startTransition(async () => {
            try {
              await updateMontoGasto(gasto.id, val)
              setEditing(false)
              onSaved()
            } catch (e) {
              alert((e as Error).message)
            }
          })
        }}
        className="p-1 rounded bg-green-600/20 text-green-700 hover:bg-green-600/30 disabled:opacity-50"
        title="Guardar (Enter)"
      >
        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
      </button>
      <button
        type="button"
        onClick={() => { setVal(Number(gasto.monto)); setEditing(false) }}
        className="p-1 rounded bg-surface-2 text-fg-soft hover:bg-[#e3ddd0]"
        title="Cancelar (Esc)"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ─── GastosClient ─────────────────────────────────────────────────────────────

export function GastosClient({ gastos, mes, categorias, filtros, cuentas, tarjetas, prorrateosDefault, tiposIva, configProrrateo, recurrentes, pagosByGasto, hoy }: GastosClientProps) {
  const recurrentesMap = useMemo(() => new Map((recurrentes ?? []).map((r) => [r.id, r])), [recurrentes])
  const hoyStr = hoy ?? new Date().toISOString().slice(0, 10)

  // Estado COMPUTADO por gasto (Vencido, Cuenta corriente, Pago programado, etc.) — ver lib/gastos-estado.ts
  const estadosMap = useMemo(() => {
    const m = new Map<string, { estado: EstadoGasto; parcial: boolean }>()
    for (const g of gastos) {
      const rec = g.recurrente_id ? recurrentesMap.get(g.recurrente_id) : null
      m.set(g.id, estadoGasto(
        { ...g, recurrenteConcepto: rec?.concepto ?? null },
        pagosByGasto?.[g.id] ?? [],
        rec,
        hoyStr,
      ))
    }
    return m
  }, [gastos, recurrentesMap, pagosByGasto, hoyStr])
  const router = useRouter()
  const searchParams = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [editGasto, setEditGasto] = useState<Gasto | undefined>()
  const [detalleGasto, setDetalleGasto] = useState<Gasto | undefined>()
  const [pagarGasto, setPagarGasto] = useState<Gasto | undefined>()
  const [isPending, startTransition] = useTransition()

  // Búsqueda client-side: general + por columna
  const [searchGeneral, setSearchGeneral] = useState('')
  const [filterConcepto, setFilterConcepto] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('')
  const [filterMonto, setFilterMonto] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<'TODOS' | 'RECURRENTES' | 'EXTRAORDINARIOS'>('TODOS')

  const gastosFiltrados = useMemo(() => {
    const qGen = searchGeneral.trim().toLowerCase()
    const qConc = filterConcepto.trim().toLowerCase()
    const qCat = filterCategoria.trim().toLowerCase()
    const qMonto = filterMonto.trim()
    return gastos.filter((g) => {
      if (filtros.estado && estadosMap.get(g.id)?.estado !== filtros.estado) return false
      if (tipoFiltro === 'RECURRENTES' && !g.recurrente_id) return false
      if (tipoFiltro === 'EXTRAORDINARIOS' && g.recurrente_id) return false
      if (qGen) {
        const haystack = [g.concepto, g.categoria, g.notas, String(g.monto), String(g.monto_neto)]
          .filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(qGen)) return false
      }
      if (qConc && !(g.concepto || '').toLowerCase().includes(qConc)) return false
      if (qCat && !(g.categoria || '').toLowerCase().includes(qCat)) return false
      if (qMonto && !String(g.monto).includes(qMonto)) return false
      return true
    })
  }, [gastos, searchGeneral, filterConcepto, filterCategoria, filterMonto, tipoFiltro, filtros.estado, estadosMap])

  const { sortKey, sortDir, toggleSort, sortRows } = useSort<'fecha' | 'concepto' | 'categoria' | 'negocio' | 'monto' | 'estado' | 'fecha_pago'>('fecha', 'desc')
  const gastosOrdenados = useMemo(() => sortRows(gastosFiltrados, (g, k): string | number => {
    switch (k) {
      case 'fecha': return g.fecha ?? g.mes ?? ''
      case 'concepto': return (g.concepto ?? '').toLowerCase()
      case 'categoria': return (g.categoria ?? '').toLowerCase()
      case 'negocio': return (g.negocio ?? '').toLowerCase()
      case 'monto': return Number(g.monto ?? 0)
      case 'estado': return (estadosMap.get(g.id)?.estado ?? g.estado ?? '').toLowerCase()
      case 'fecha_pago': return g.fecha_pago ?? ''
      default: return ''
    }
  }), [gastosFiltrados, sortKey, sortDir]) // eslint-disable-line react-hooks/exhaustive-deps

  const [agruparCategoria, setAgruparCategoria] = useState(false)
  const gruposCategoria = useMemo(() => {
    const m = new Map<string, Gasto[]>()
    for (const g of gastosOrdenados) {
      const k = g.categoria || 'Sin categoría'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(g)
    }
    return Array.from(m.entries())
  }, [gastosOrdenados])

  // Fila de gasto reutilizable (modo plano y modo agrupado).
  const renderGastoRow = (g: Gasto) => (
    <tr key={g.id} className="border-b border-border/60 hover:bg-surface-2/30 transition-colors">
      <td className="px-4 py-3 text-fg-muted font-mono text-xs whitespace-nowrap">{formatDate(g.fecha)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="text-fg font-medium">{g.concepto}</p>
          {g.prorrateo && (
            <Badge variant="info" className="text-[10px]">
              <Layers className="w-2.5 h-2.5 mr-0.5 inline" />
              Compartido
            </Badge>
          )}
          {g.recurrente_id && (
            <Badge variant="purple" className="text-[10px]">Recurrente</Badge>
          )}
        </div>
        {g.notas && <p className="text-xs text-fg-soft mt-0.5 truncate max-w-[200px]">{g.notas}</p>}
      </td>
      <td className="px-4 py-3 text-fg-muted">{g.categoria}</td>
      <td className="px-4 py-3"><MarcaBadge marca={g.negocio} /></td>
      <td className="px-4 py-3 text-right">
        <MontoGastoEditor gasto={g} onSaved={() => router.refresh()} />
        {g.iva_incluido && (
          <p className="text-xs text-green-700 font-mono">neto: {formatCurrency(g.monto_neto, g.moneda || 'ARS')}</p>
        )}
        {g.cuotas_total && g.cuotas_total > 1 && (
          <p className="text-xs text-amber-700">{g.cuotas_total} cuotas</p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <EstadoBadge estado={estadosMap.get(g.id)?.estado ?? g.estado} />
          {estadosMap.get(g.id)?.parcial && (
            <Badge variant="default" className="text-[10px]">Parcial</Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-fg-muted text-xs">{g.fecha_pago ? formatDate(g.fecha_pago) : '—'}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setDetalleGasto(g)} title="Ver detalles">
            <Info className="w-3.5 h-3.5" />
          </Button>
          {g.estado !== 'PAGADO' && (
            <Button size="sm" variant="success" onClick={() => setPagarGasto(g)} title="Registrar pago (con cuenta de origen)">
              <CheckCircle className="w-3.5 h-3.5" />
            </Button>
          )}
          {g.estado === 'PAGADO' && !g.auto_generado && !g.gasto_padre_id && (
            <Button size="sm" variant="warning" onClick={() => handleRevertirPago(g)} disabled={isPending}
              title="Revertir pago: vuelve el gasto a PENDIENTE y borra el pago asociado">
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => openEdit(g)} title="Editar gasto">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="danger" onClick={() => handleDelete(g.id)} disabled={isPending} title="Eliminar gasto">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  )

  // Totales separados por moneda — sin sumar ni convertir
  // Se calculan sobre los gastos filtrados para que los KPIs reflejen lo que ves
  const ars = (g: Gasto) => (g.moneda === 'USD' ? 0 : g.monto)
  const usd = (g: Gasto) => (g.moneda === 'USD' ? g.monto : 0)
  const arsNeto = (g: Gasto) => (g.moneda === 'USD' ? 0 : (g.monto_neto || g.monto))
  const usdNeto = (g: Gasto) => (g.moneda === 'USD' ? (g.monto_neto || g.monto) : 0)

  const totalGastosARS = gastosFiltrados.reduce((s, g) => s + ars(g), 0)
  const totalGastosUSD = gastosFiltrados.reduce((s, g) => s + usd(g), 0)
  const totalNetoARS = gastosFiltrados.reduce((s, g) => s + arsNeto(g), 0)
  const totalNetoUSD = gastosFiltrados.reduce((s, g) => s + usdNeto(g), 0)
  const totalPagadoNetoARS = gastosFiltrados.filter((g) => g.estado === 'PAGADO').reduce((s, g) => s + arsNeto(g), 0)
  const totalPagadoNetoUSD = gastosFiltrados.filter((g) => g.estado === 'PAGADO').reduce((s, g) => s + usdNeto(g), 0)
  const totalPendienteNetoARS = gastosFiltrados.filter((g) => g.estado === 'PENDIENTE').reduce((s, g) => s + arsNeto(g), 0)
  const totalPendienteNetoUSD = gastosFiltrados.filter((g) => g.estado === 'PENDIENTE').reduce((s, g) => s + usdNeto(g), 0)

  const hayBusquedaActiva = !!(searchGeneral || filterConcepto || filterCategoria || filterMonto)
  function limpiarBusquedas() {
    setSearchGeneral(''); setFilterConcepto(''); setFilterCategoria(''); setFilterMonto('')
  }

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`?${params.toString()}`)
  }

  function openCreate() { setEditGasto(undefined); setModalOpen(true) }
  function openEdit(g: Gasto) { setEditGasto(g); setModalOpen(true) }

  // Quick action: ?nuevo=1 abre el modal automáticamente al entrar
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') {
      openCreate()
      const params = new URLSearchParams(searchParams.toString())
      params.delete('nuevo')
      router.replace(`?${params.toString()}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar este gasto?')) return
    startTransition(() => deleteGasto(id))
  }

  function handleRevertirPago(g: Gasto) {
    if (!confirm(
      `¿Revertir el pago de "${g.concepto}"?\n\n` +
      `El gasto vuelve a PENDIENTE y se borra el pago asociado del ledger. ` +
      `Si era un pago real (debitado de caja), también se va — vas a tener que cargarlo de nuevo cuando corresponda.`
    )) return
    startTransition(async () => {
      try {
        await revertirPagoGasto(g.id)
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">Gastos</h1>
          <p className="text-sm text-fg-muted mt-0.5">{gastos.length} registros</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Nuevo gasto
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total (sin IVA)', ars: totalNetoARS, usd: totalNetoUSD, color: 'text-green-700' },
          { label: 'Pagado (sin IVA)', ars: totalPagadoNetoARS, usd: totalPagadoNetoUSD, color: 'text-primary' },
          { label: 'Pendiente (sin IVA)', ars: totalPendienteNetoARS, usd: totalPendienteNetoUSD, color: 'text-amber-700' },
          { label: 'Total bruto (c/ IVA)', ars: totalGastosARS, usd: totalGastosUSD, color: 'text-fg-muted' },
        ].map((item) => (
          <div key={item.label} className="bg-surface border border-border rounded-xl p-4 space-y-1">
            <p className="text-xs text-fg-muted">{item.label}</p>
            <p className={`text-lg font-bold ${item.color} font-mono`}>
              {item.ars > 0 ? formatCurrency(item.ars, 'ARS') : <span className="text-fg-muted">—</span>}
            </p>
            <p className="text-xs font-mono text-green-700/80">
              {item.usd > 0 ? formatCurrency(item.usd, 'USD') : <span className="text-fg-muted">U$S —</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-xl">
        {/* Buscador general */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-soft pointer-events-none" />
            <input
              type="text"
              value={searchGeneral}
              onChange={(e) => setSearchGeneral(e.target.value)}
              placeholder="Buscar en concepto, categoría, notas o monto..."
              className="w-full pl-10 pr-9 py-2 bg-surface-2 border border-border-strong rounded-lg text-sm text-fg placeholder-fg-soft focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            {searchGeneral && (
              <button
                type="button"
                onClick={() => setSearchGeneral('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-surface text-fg-soft hover:text-fg"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtro Recurrentes / Extraordinarios */}
          <div className="flex gap-1">
            {([
              { v: 'TODOS' as const, label: 'Todos' },
              { v: 'RECURRENTES' as const, label: 'Recurrentes' },
              { v: 'EXTRAORDINARIOS' as const, label: 'Extraordinarios' },
            ]).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setTipoFiltro(v)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  tipoFiltro === v
                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-600'
                    : 'bg-surface-2 border-border text-fg-muted hover:text-fg'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Filtros existentes (server-side via URL) + indicador de filtros activos */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-fg-muted">
              <Filter className="w-3.5 h-3.5" />
              Filtros:
            </div>
            <select
              value={searchParams.get('mes') ?? mes}
              onChange={(e) => setFilter('mes', e.target.value)}
              className="bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {getMonthOptions().map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={filtros.negocio ?? ''}
              onChange={(e) => setFilter('negocio', e.target.value)}
              className="bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Todos los negocios</option>
              {MARCAS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              value={filtros.estado ?? ''}
              onChange={(e) => setFilter('estado', e.target.value)}
              className="bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Todos los estados</option>
              {ESTADOS_FILTRO.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
            {hayBusquedaActiva && (
              <button
                type="button"
                onClick={limpiarBusquedas}
                className="ml-auto text-xs text-primary hover:underline"
              >
                Limpiar búsquedas
              </button>
            )}
          </div>

          {/* Conteo de resultados + toggle de agrupación */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {hayBusquedaActiva ? (
              <p className="text-xs text-fg-muted">
                Mostrando <span className="font-semibold text-fg">{gastosFiltrados.length}</span> de {gastos.length} registros
              </p>
            ) : <span />}
            <button
              type="button"
              onClick={() => setAgruparCategoria((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                agruparCategoria ? 'bg-orange-500/15 border-orange-500/40 text-orange-600' : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg',
              )}
              title="Agrupar los gastos por categoría en secciones colapsables"
            >
              <ListTree className="w-3.5 h-3.5" />
              {agruparCategoria ? 'Agrupado por categoría' : 'Agrupar por categoría'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <SortTh col="fecha" label="Fecha" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="pt-3 pb-2 tracking-wider" />
                <SortTh col="concepto" label="Concepto" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="pt-3 pb-2 tracking-wider" />
                <SortTh col="categoria" label="Categoría" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="pt-3 pb-2 tracking-wider" />
                <SortTh col="negocio" label="Negocio" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="pt-3 pb-2 tracking-wider" />
                <SortTh col="monto" label="Monto" align="right" numeric sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="pt-3 pb-2 tracking-wider" />
                <SortTh col="estado" label="Estado" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="pt-3 pb-2 tracking-wider" />
                <SortTh col="fecha_pago" label="Fecha pago" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="pt-3 pb-2 tracking-wider" />
                <th className="px-4 pt-3 pb-2" />
              </tr>
              {/* Fila de filtros por columna */}
              <tr className="border-b border-border bg-surface-2/30">
                <th className="px-4 pb-2"></th>
                <th className="px-4 pb-2">
                  <input
                    type="text"
                    value={filterConcepto}
                    onChange={(e) => setFilterConcepto(e.target.value)}
                    placeholder="Filtrar concepto..."
                    className="w-full px-2 py-1 bg-surface border border-border-strong rounded text-xs font-normal normal-case tracking-normal text-fg placeholder-fg-soft focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </th>
                <th className="px-4 pb-2">
                  <input
                    type="text"
                    value={filterCategoria}
                    onChange={(e) => setFilterCategoria(e.target.value)}
                    placeholder="Filtrar categoría..."
                    className="w-full px-2 py-1 bg-surface border border-border-strong rounded text-xs font-normal normal-case tracking-normal text-fg placeholder-fg-soft focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </th>
                <th className="px-4 pb-2"></th>
                <th className="px-4 pb-2 text-right">
                  <input
                    type="text"
                    value={filterMonto}
                    onChange={(e) => setFilterMonto(e.target.value)}
                    placeholder="Ej: 1440"
                    className="w-full px-2 py-1 bg-surface border border-border-strong rounded text-xs font-normal normal-case tracking-normal text-fg placeholder-fg-soft font-mono text-right focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </th>
                <th className="px-4 pb-2"></th>
                <th className="px-4 pb-2"></th>
                <th className="px-4 pb-2"></th>
              </tr>
            </thead>
            {gastosOrdenados.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-fg-soft">
                    <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    {hayBusquedaActiva
                      ? 'No se encontraron gastos con esos filtros'
                      : 'No hay gastos para este período'}
                  </td>
                </tr>
              </tbody>
            ) : agruparCategoria ? (
              gruposCategoria.map(([cat, gs]) => (
                <GrupoCategoriaGastos key={cat} categoria={cat} gastos={gs} renderRow={renderGastoRow} />
              ))
            ) : (
              <tbody>
                {gastosOrdenados.map((g) => renderGastoRow(g))}
              </tbody>
            )}
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onOpenChange={setModalOpen} title={editGasto ? 'Editar gasto' : 'Nuevo gasto'} className="max-w-xl">
        <GastoForm
          gasto={editGasto}
          mes={mes}
          categorias={categorias}
          cuentas={cuentas}
          tarjetas={tarjetas}
          prorrateosDefault={prorrateosDefault}
          tiposIva={tiposIva}
          configProrrateo={configProrrateo}
          onClose={() => setModalOpen(false)}
        />
      </Modal>

      {detalleGasto && (
        <Modal open={!!detalleGasto} onOpenChange={(o) => { if (!o) setDetalleGasto(undefined) }} title="Detalle del gasto" className="max-w-md">
          <DetalleGastoModal gasto={detalleGasto} onClose={() => setDetalleGasto(undefined)} />
        </Modal>
      )}

      {pagarGasto && (
        <Modal open={!!pagarGasto} onOpenChange={(o) => { if (!o) setPagarGasto(undefined) }} title="Registrar pago" className="max-w-md">
          <PagarModal gasto={pagarGasto} cuentas={cuentas} onClose={() => setPagarGasto(undefined)} />
        </Modal>
      )}
    </div>
  )
}

// Grupo de gastos por categoría, colapsable (cada uno es un <tbody> con header + filas).
function GrupoCategoriaGastos({ categoria, gastos, renderRow }: {
  categoria: string
  gastos: Gasto[]
  renderRow: (g: Gasto) => React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  const ars = gastos.reduce((s, g) => s + (g.moneda === 'USD' ? 0 : Number(g.monto ?? 0)), 0)
  const usd = gastos.reduce((s, g) => s + (g.moneda === 'USD' ? Number(g.monto ?? 0) : 0), 0)
  return (
    <tbody>
      <tr className="border-b border-border bg-surface-2/40 cursor-pointer select-none hover:bg-surface-2/60" onClick={() => setOpen((o) => !o)}>
        <td colSpan={8} className="px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
              <ChevronDown className={cn('w-4 h-4 text-fg-soft transition-transform', open ? '' : '-rotate-90')} />
              {categoria}
              <Badge variant="default">{gastos.length}</Badge>
            </span>
            <span className="font-mono text-xs text-fg-muted">
              {ars > 0 && formatCurrency(ars)}
              {usd > 0 && `${ars > 0 ? ' · ' : ''}${formatCurrency(usd, 'USD')}`}
            </span>
          </div>
        </td>
      </tr>
      {open && gastos.map(renderRow)}
    </tbody>
  )
}
