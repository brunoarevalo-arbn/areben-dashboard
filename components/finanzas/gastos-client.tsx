'use client'

import { useActionState, useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createGasto, updateGasto, deleteGasto, marcarGastoPagado } from '@/app/actions/finanzas'
import type { Gasto, ProrrateoMarcas, ProrrateoDefault, TipoIVA, ConfiguracionProrrateo } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { EstadoBadge, MarcaBadge, Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, getMonthOptions } from '@/lib/utils'
import {
  Plus, Pencil, Trash2, CheckCircle, Filter, TrendingDown, Loader2,
  Info, Layers, Receipt, Wallet, CreditCard,
} from 'lucide-react'
import { ProrrateoEditor } from './prorrateo-editor'
import { MoneyInput } from '@/components/ui/money-input'
import { cn } from '@/lib/utils'

const CATEGORIAS_COMUNES = [
  'Alquiler', 'Servicios', 'Sueldos', 'Marketing', 'Logística',
  'Impuestos', 'Seguros', 'Mantenimiento', 'Tecnología', 'Otros',
]
const MARCAS = ['BDI', 'ZATTIA', 'STUNNED', 'GENERAL']
const ESTADOS = ['PENDIENTE', 'PAGADO', 'VENCIDO']
const MEDIOS_PAGO = [
  { value: '', label: '— Sin asignar —' },
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
  cuentas: { id: string; nombre: string; banco: string }[]
  tarjetas: { id: string; nombre: string; banco: string }[]
  prorrateosDefault: ProrrateoDefault[]
  tiposIva: TipoIVA[]
  configProrrateo: ConfiguracionProrrateo[]
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
  cuentas: { id: string; nombre: string; banco: string }[]
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
  const [medioPago, setMedioPago] = useState(gasto?.medio_pago ?? '')

  const factorIva = 1 + porcentajeIva / 100
  const montoNetoCalc = ivaIncluido && factorIva > 0 ? monto / factorIva : monto

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

      <div className="bg-[#f5f0e6]/40 border border-[#d6d0c4]/40 rounded-xl p-4 space-y-3">
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
            <label className="block text-xs font-medium text-slate-600">Moneda</label>
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as 'ARS' | 'USD')}
              className="w-full px-3 py-2 bg-slate-700 border border-[#c8c0b0] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600">Tipo IVA</label>
            <select
              value={porcentajeIva}
              onChange={(e) => setPorcentajeIva(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-700 border border-[#c8c0b0] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
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
            className="w-4 h-4 rounded border-[#c8c0b0] bg-slate-700"
          />
          <span className="text-sm text-slate-700">El monto incluye IVA</span>
        </label>

        {ivaIncluido && monto > 0 && (
          <div className="bg-slate-700/40 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
            <span className="text-slate-600">Neto sin IVA ({porcentajeIva}%)</span>
            <span className="font-mono text-green-700 font-semibold">
              {formatCurrency(montoNetoCalc, moneda)}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Select label="Estado" name="estado" defaultValue={gasto?.estado ?? 'PENDIENTE'}
          options={ESTADOS.map((e) => ({ value: e, label: e.charAt(0) + e.slice(1).toLowerCase() }))} />
        <Input label="Fecha de pago" name="fecha_pago" type="date" defaultValue={gasto?.fecha_pago ?? ''} />
      </div>

      {/* Medio de pago */}
      <div className="bg-[#f5f0e6]/40 border border-[#d6d0c4]/40 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Medio de pago"
            name="medio_pago"
            value={medioPago}
            onChange={(e) => setMedioPago(e.target.value)}
            options={MEDIOS_PAGO}
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
              options={[{ value: '', label: '— Sin asignar —' }, ...cuentas.map((c) => ({ value: c.id, label: `${c.banco} · ${c.nombre}` }))]}
            />
          ) : null}
        </div>

        {medioPago === 'TARJETA' && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600 flex items-center gap-1.5">
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
                      : 'bg-slate-700 border-[#c8c0b0] text-slate-600 hover:text-slate-800'
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
                className="w-20 px-2 py-1 bg-slate-700 border border-[#c8c0b0] rounded text-slate-900 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            {cuotasTotal > 1 && monto > 0 && !tieneIntereses && (
              <p className="text-xs text-slate-500">
                {cuotasTotal} cuotas de <span className="font-mono text-amber-700">{formatCurrency(monto / cuotasTotal, moneda)}</span> · pasivos generados al pagar
              </p>
            )}
          </div>
        )}

        {/* Intereses por financiación — solo TARJETA con cuotas > 1 */}
        {medioPago === 'TARJETA' && cuotasTotal > 1 && (
          <div className="bg-[#f5f0e6]/40 border border-[#d6d0c4]/40 rounded-lg p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={tieneIntereses}
                onChange={(e) => setTieneIntereses(e.target.checked)}
                className="w-4 h-4 rounded border-[#c8c0b0] bg-slate-700"
              />
              <span className="text-sm text-slate-700">Tiene intereses por financiación</span>
              <span className="text-xs text-slate-500">(se registra como "Gasto Financiero")</span>
            </label>
            {tieneIntereses && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-600">Tipo de interés</label>
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
                            : 'bg-slate-700 border-[#c8c0b0] text-slate-600 hover:text-slate-800'
                        )}
                      >
                        {t === 'MONTO' ? 'Monto fijo $' : '% sobre precio'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-600">
                    {interesTipo === 'MONTO' ? 'Monto del interés ($)' : 'Porcentaje (%)'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={interesValor || ''}
                      onChange={(e) => setInteresValor(Math.max(0, Number(e.target.value)))}
                      className="w-full px-3 py-2 bg-slate-700 border border-[#c8c0b0] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">
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
                <div className="bg-white/40 rounded-lg px-3 py-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-slate-500">Precio</p>
                    <p className="font-mono text-slate-700">{formatCurrency(monto, moneda)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">+ Intereses</p>
                    <p className="font-mono text-amber-700">+{formatCurrency(interes, moneda)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Cuota mensual</p>
                    <p className="font-mono text-orange-600 font-semibold">{formatCurrency(cuota, moneda)}</p>
                    <p className="text-[10px] text-slate-600">{cuotasTotal} × {formatCurrency(cuota, moneda)}</p>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* Prorrateo */}
      <div className="bg-[#f5f0e6]/60 border border-[#d6d0c4]/60 rounded-xl p-4 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={esCompartido}
            onChange={(e) => setEsCompartido(e.target.checked)}
            className="w-4 h-4 rounded border-[#c8c0b0] bg-slate-700"
          />
          <Layers className="w-4 h-4 text-slate-600" />
          <span className="text-sm font-medium text-slate-700">Gasto compartido (prorratear entre marcas)</span>
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
      <div className="bg-[#f5f0e6]/60 rounded-lg p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-slate-600">Concepto</span><span className="text-slate-900">{gasto.concepto}</span></div>
        <div className="flex justify-between"><span className="text-slate-600">Categoría</span><span>{gasto.categoria}</span></div>
        <div className="flex justify-between">
          <span className="text-slate-600">Monto bruto</span>
          <span className="font-mono">{formatCurrency(gasto.monto)}</span>
        </div>
        {gasto.iva_incluido && (
          <>
            <div className="flex justify-between">
              <span className="text-slate-600">Monto neto (sin IVA {gasto.porcentaje_iva}%)</span>
              <span className="font-mono text-green-700">{formatCurrency(gasto.monto_neto)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">IVA</span>
              <span className="font-mono text-amber-700">{formatCurrency(gasto.monto - gasto.monto_neto)}</span>
            </div>
          </>
        )}
        {gasto.medio_pago && (
          <div className="flex justify-between"><span className="text-slate-600">Medio pago</span><span>{gasto.medio_pago}</span></div>
        )}
      </div>

      {gasto.prorrateo && (
        <div className="bg-[#f5f0e6]/60 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            Prorrateo entre marcas
          </p>
          <div className="space-y-1.5">
            {Object.entries(gasto.prorrateo).map(([marca, pct]) => (
              <div key={marca} className="flex justify-between items-center text-sm">
                <span className="text-slate-700">{marca}</span>
                <span className="font-mono">
                  <span className="text-orange-500">{pct}%</span>
                  <span className="text-slate-600 ml-2">→ {formatCurrency((gasto.monto * Number(pct)) / 100)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {gasto.detalles && Object.keys(gasto.detalles).length > 0 && (
        <div className="bg-[#f5f0e6]/60 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-600 mb-2">Detalles técnicos</p>
          <pre className="text-xs text-slate-700 font-mono whitespace-pre-wrap">{JSON.stringify(gasto.detalles, null, 2)}</pre>
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
  cuentas: { id: string; nombre: string; banco: string }[]
  onClose: () => void
}) {
  const [cuentaId, setCuentaId] = useState(gasto.cuenta_origen_pago_id ?? gasto.cuenta_id ?? '')
  const [fechaPago, setFechaPago] = useState(gasto.fecha_pago ?? new Date().toISOString().split('T')[0])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const esTarjeta = gasto.medio_pago === 'TARJETA'

  function confirmar() {
    setError(null)
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
      <div className="bg-[#f5f0e6]/60 rounded-lg p-3">
        <p className="text-sm text-slate-900 font-medium">{gasto.concepto}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {gasto.categoria} · <span className="font-mono">{formatCurrency(gasto.monto, gasto.moneda)}</span>
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">Fecha de pago</label>
        <input
          type="date"
          value={fechaPago}
          onChange={(e) => setFechaPago(e.target.value)}
          className="w-full px-3 py-2 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
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
          <label className="block text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <Wallet className="w-4 h-4" />
            Cuenta de origen <span className="text-red-700">*</span>
          </label>
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            className="w-full px-3 py-2 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
            required
          >
            <option value="">— Seleccionar cuenta —</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>{c.banco} · {c.nombre}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500">Solo registro — no afecta saldos por ahora</p>
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

export function GastosClient({ gastos, mes, categorias, filtros, cuentas, tarjetas, prorrateosDefault, tiposIva, configProrrateo }: GastosClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [editGasto, setEditGasto] = useState<Gasto | undefined>()
  const [detalleGasto, setDetalleGasto] = useState<Gasto | undefined>()
  const [pagarGasto, setPagarGasto] = useState<Gasto | undefined>()
  const [isPending, startTransition] = useTransition()

  // Totales separados por moneda — sin sumar ni convertir
  const ars = (g: Gasto) => (g.moneda === 'USD' ? 0 : g.monto)
  const usd = (g: Gasto) => (g.moneda === 'USD' ? g.monto : 0)
  const arsNeto = (g: Gasto) => (g.moneda === 'USD' ? 0 : (g.monto_neto || g.monto))
  const usdNeto = (g: Gasto) => (g.moneda === 'USD' ? (g.monto_neto || g.monto) : 0)

  const totalGastosARS = gastos.reduce((s, g) => s + ars(g), 0)
  const totalGastosUSD = gastos.reduce((s, g) => s + usd(g), 0)
  const totalNetoARS = gastos.reduce((s, g) => s + arsNeto(g), 0)
  const totalNetoUSD = gastos.reduce((s, g) => s + usdNeto(g), 0)
  const totalPagadoARS = gastos.filter((g) => g.estado === 'PAGADO').reduce((s, g) => s + ars(g), 0)
  const totalPagadoUSD = gastos.filter((g) => g.estado === 'PAGADO').reduce((s, g) => s + usd(g), 0)
  const totalPendienteARS = gastos.filter((g) => g.estado === 'PENDIENTE').reduce((s, g) => s + ars(g), 0)
  const totalPendienteUSD = gastos.filter((g) => g.estado === 'PENDIENTE').reduce((s, g) => s + usd(g), 0)

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gastos</h1>
          <p className="text-sm text-slate-600 mt-0.5">{gastos.length} registros</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Nuevo gasto
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total bruto', ars: totalGastosARS, usd: totalGastosUSD, color: 'text-slate-900' },
          { label: 'Total neto (sin IVA)', ars: totalNetoARS, usd: totalNetoUSD, color: 'text-green-700' },
          { label: 'Pagado', ars: totalPagadoARS, usd: totalPagadoUSD, color: 'text-orange-500' },
          { label: 'Pendiente', ars: totalPendienteARS, usd: totalPendienteUSD, color: 'text-amber-700' },
        ].map((item) => (
          <div key={item.label} className="bg-white border border-[#e8e4dc] rounded-xl p-4 space-y-1">
            <p className="text-xs text-slate-600">{item.label}</p>
            <p className={`text-lg font-bold ${item.color} font-mono`}>
              {item.ars > 0 ? formatCurrency(item.ars, 'ARS') : <span className="text-slate-600">—</span>}
            </p>
            <p className="text-xs font-mono text-green-700/80">
              {item.usd > 0 ? formatCurrency(item.usd, 'USD') : <span className="text-slate-600">U$S —</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#e8e4dc] rounded-xl">
        <div className="p-4 border-b border-[#e8e4dc] flex flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Filter className="w-3.5 h-3.5" />
            Filtros:
          </div>
          <select
            value={searchParams.get('mes') ?? mes}
            onChange={(e) => setFilter('mes', e.target.value)}
            className="bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            {getMonthOptions().map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={filtros.negocio ?? ''}
            onChange={(e) => setFilter('negocio', e.target.value)}
            className="bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="">Todos los negocios</option>
            {MARCAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={filtros.estado ?? ''}
            onChange={(e) => setFilter('estado', e.target.value)}
            className="bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{e.charAt(0) + e.slice(1).toLowerCase()}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e8e4dc]">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Concepto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Categoría</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Negocio</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Monto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Fecha pago</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {gastos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No hay gastos para este período
                  </td>
                </tr>
              ) : (
                gastos.map((g) => (
                  <tr key={g.id} className="border-b border-[#e8e4dc]/60 hover:bg-[#f5f0e6]/30 transition-colors">
                    <td className="px-4 py-3 text-slate-700 font-mono text-xs whitespace-nowrap">{formatDate(g.fecha)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="text-slate-900 font-medium">{g.concepto}</p>
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
                      {g.notas && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{g.notas}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{g.categoria}</td>
                    <td className="px-4 py-3"><MarcaBadge marca={g.negocio} /></td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-mono font-medium text-slate-900">{formatCurrency(g.monto, g.moneda || 'ARS')}</p>
                      {g.iva_incluido && (
                        <p className="text-xs text-green-700 font-mono">neto: {formatCurrency(g.monto_neto, g.moneda || 'ARS')}</p>
                      )}
                      {g.cuotas_total && g.cuotas_total > 1 && (
                        <p className="text-xs text-amber-700">{g.cuotas_total} cuotas</p>
                      )}
                    </td>
                    <td className="px-4 py-3"><EstadoBadge estado={g.estado} /></td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{g.fecha_pago ? formatDate(g.fecha_pago) : '—'}</td>
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
                        <Button size="sm" variant="ghost" onClick={() => openEdit(g)} title="Editar gasto">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(g.id)} disabled={isPending} title="Eliminar gasto">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
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
