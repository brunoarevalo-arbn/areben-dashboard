'use client'

import { useActionState, useState, useTransition, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  createRecurrente, updateRecurrente, deleteRecurrente, confirmarRecurrente,
  confirmarRecurrentesMasivo, importRecurrentesExcel,
  bulkUpdateRecurrentes, bulkToggleRecurrentesActivo, bulkAjustarMontosRecurrentes,
  type BulkRecurrentePatch,
} from '@/app/actions/finanzas'
import type { GastoRecurrente, ProrrateoDefault, ProrrateoMarcas, TipoIVA, ConfiguracionProrrateo } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ExcelImport } from '@/components/ui/excel-import'
import { formatCurrency, formatMonth, getMonthOptions } from '@/lib/utils'
import {
  Plus, Pencil, Trash2, Repeat, Loader2, CheckCircle2, Info,
  Receipt, CreditCard, Upload, ListChecks, Power, PowerOff, Percent, Edit3,
} from 'lucide-react'
import { ProrrateoEditor } from './prorrateo-editor'
import { cn } from '@/lib/utils'

interface Props {
  mes: string
  recurrentes: GastoRecurrente[]
  cuentas: { id: string; nombre: string; banco: string }[]
  tarjetas: { id: string; nombre: string; banco: string }[]
  prorrateosDefault: ProrrateoDefault[]
  gastosMes: { id: string; recurrente_id: string | null; mes: string; monto: number; estado: string }[]
  tiposIva: TipoIVA[]
  configProrrateo: ConfiguracionProrrateo[]
}

const CATEGORIAS = ['Alquiler', 'Servicios', 'Sueldos', 'Marketing', 'Logística', 'Impuestos', 'Seguros', 'Mantenimiento', 'Tecnología', 'Otros']
const MEDIOS_PAGO = [
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'TARJETA', label: 'Tarjeta' },
  { value: 'DEBITO_AUTOMATICO', label: 'Débito automático' },
  { value: 'CTA_CORRIENTE', label: 'Cuenta corriente' },
]

// ─── RecurrenteForm ───────────────────────────────────────────────────────────

function RecurrenteForm({
  recurrente,
  cuentas,
  tarjetas,
  prorrateosDefault,
  tiposIva,
  configProrrateo,
  onClose,
}: {
  recurrente?: GastoRecurrente
  cuentas: { id: string; nombre: string; banco: string }[]
  tarjetas: { id: string; nombre: string; banco: string }[]
  prorrateosDefault: ProrrateoDefault[]
  tiposIva: TipoIVA[]
  configProrrateo: ConfiguracionProrrateo[]
  onClose: () => void
}) {
  const action = recurrente ? updateRecurrente.bind(null, recurrente.id) : createRecurrente
  const [ivaIncluido, setIvaIncluido] = useState(recurrente?.iva_incluido ?? true)
  const [porcentajeIva, setPorcentajeIva] = useState(recurrente?.porcentaje_iva ?? 21)
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>(recurrente?.moneda ?? 'ARS')
  const [montoEstimado, setMontoEstimado] = useState(recurrente?.monto_estimado ?? 0)
  const [tieneSecundario, setTieneSecundario] = useState(!!recurrente?.monto_secundario)
  const [montoSecundario, setMontoSecundario] = useState(recurrente?.monto_secundario ?? 0)
  const [monedaSecundaria, setMonedaSecundaria] = useState<'ARS' | 'USD'>(recurrente?.moneda_secundaria ?? 'USD')
  const [medioPago, setMedioPago] = useState(recurrente?.medio_pago ?? 'TRANSFERENCIA')
  const [esCompartido, setEsCompartido] = useState(!!recurrente?.prorrateo)

  // Prorrateo default desde configuracion_prorrateo (usuario lo configura en /settings/prorrateo)
  const defaultFromConfig: ProrrateoMarcas = Object.fromEntries(
    configProrrateo.map((c) => [c.marca, c.porcentaje])
  )

  const [prorrateo, setProrrateo] = useState<ProrrateoMarcas>(
    recurrente?.prorrateo
      ?? (Object.keys(defaultFromConfig).length > 0
        ? defaultFromConfig
        : prorrateosDefault.find((p) => p.es_default)?.porcentajes
          ?? { BDI: 33.33, ZATTIA: 33.33, STUNNED: 33.34 })
  )

  // Neto calculado si IVA está incluido
  const factorIva = 1 + porcentajeIva / 100
  const montoNeto = ivaIncluido && factorIva > 0 ? Math.round((montoEstimado / factorIva) * 100) / 100 : montoEstimado

  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('iva_incluido', ivaIncluido ? 'true' : 'false')
      fd.set('porcentaje_iva', String(porcentajeIva))
      fd.set('moneda', moneda)
      fd.set('monto_estimado', String(montoEstimado))
      if (tieneSecundario && montoSecundario > 0) {
        fd.set('monto_secundario', String(montoSecundario))
        fd.set('moneda_secundaria', monedaSecundaria)
      } else {
        fd.delete('monto_secundario')
        fd.delete('moneda_secundaria')
      }
      if (esCompartido) fd.set('prorrateo', JSON.stringify(prorrateo))
      else fd.delete('prorrateo')
      const r = await action(prev, fd)
      if (!r) onClose()
      return r
    },
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Concepto" name="concepto" placeholder="Ej: Alquiler local" defaultValue={recurrente?.concepto} required />
        <Select label="Categoría" name="categoria" defaultValue={recurrente?.categoria ?? 'Servicios'}
          options={CATEGORIAS.map((c) => ({ value: c, label: c }))} required />
      </div>

      {/* Monto principal con moneda */}
      <div className="bg-surface-2/40 border border-border-strong/40 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="block text-xs font-medium text-fg-muted">Monto principal</label>
            <input
              type="number"
              step="0.01"
              value={montoEstimado || ''}
              onChange={(e) => setMontoEstimado(Number(e.target.value))}
              className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              placeholder="0.00"
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

        <label className="flex items-center gap-2 cursor-pointer text-xs">
          <input
            type="checkbox"
            checked={tieneSecundario}
            onChange={(e) => setTieneSecundario(e.target.checked)}
            className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2"
          />
          <span className="text-fg-muted">Componente en otra moneda (ej: alquiler con parte fija USD + ajuste ARS)</span>
        </label>

        {tieneSecundario && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-6 pt-1">
            <div className="col-span-2 space-y-1.5">
              <label className="block text-xs font-medium text-fg-muted">Monto secundario</label>
              <input
                type="number"
                step="0.01"
                value={montoSecundario || ''}
                onChange={(e) => setMontoSecundario(Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-fg-muted">Moneda</label>
              <select
                value={monedaSecundaria}
                onChange={(e) => setMonedaSecundaria(e.target.value as 'ARS' | 'USD')}
                className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              >
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* IVA */}
      <div className="bg-surface-2/40 border border-border-strong/40 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-fg-muted">Tipo de IVA</label>
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
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-fg-muted">Día de vencimiento</label>
            <input
              type="number"
              min="1" max="31"
              defaultValue={recurrente?.dia_vencimiento ?? ''}
              name="dia_vencimiento"
              className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              placeholder="ej: 10"
            />
          </div>
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
        {ivaIncluido && montoEstimado > 0 && (
          <div className="bg-surface-2/40 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
            <span className="text-fg-muted">Neto sin IVA ({porcentajeIva}%)</span>
            <span className="font-mono text-green-700 font-semibold">
              {formatCurrency(montoNeto, moneda)}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Medio de pago"
          name="medio_pago"
          value={medioPago}
          onChange={(e) => setMedioPago(e.target.value)}
          options={MEDIOS_PAGO}
        />
        <Select
          label="Tipo de mes"
          name="tipo_mes"
          defaultValue={recurrente?.tipo_mes ?? 'CORRIENTE'}
          options={[
            { value: 'CORRIENTE', label: 'Mes corriente' },
            { value: 'VENCIDO', label: 'Mes vencido' },
          ]}
        />
      </div>

      {medioPago === 'TARJETA' && tarjetas.length > 0 && (
        <Select
          label="Tarjeta"
          name="tarjeta_id"
          defaultValue={recurrente?.tarjeta_id ?? ''}
          options={[{ value: '', label: '— Sin asignar —' }, ...tarjetas.map((t) => ({ value: t.id, label: `${t.banco} · ${t.nombre}` }))]}
        />
      )}

      {medioPago !== 'TARJETA' && cuentas.length > 0 && (
        <Select
          label="Cuenta"
          name="cuenta_id"
          defaultValue={recurrente?.cuenta_id ?? ''}
          options={[{ value: '', label: '— Sin asignar —' }, ...cuentas.map((c) => ({ value: c.id, label: `${c.banco} · ${c.nombre}` }))]}
        />
      )}

      {/* Prorrateo */}
      <div className="bg-surface-2/60 border border-border-strong/60 rounded-xl p-4 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={esCompartido}
            onChange={(e) => setEsCompartido(e.target.checked)}
            className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2"
          />
          <span className="text-sm font-medium text-fg-muted">Gasto compartido (prorratear entre marcas)</span>
        </label>
        {esCompartido && (
          <div className="pl-6 space-y-2">
            <ProrrateoEditor value={prorrateo} onChange={setProrrateo} defaults={prorrateosDefault} />
          </div>
        )}
      </div>

      <Textarea label="Detalles técnicos (JSON opcional)" name="detalles"
        placeholder='{"poliza": "12345", "cobertura": "Total"}'
        defaultValue={recurrente?.detalles ? JSON.stringify(recurrente.detalles) : ''} rows={2} />

      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {recurrente ? 'Guardar' : 'Crear recurrente'}
        </Button>
      </div>
    </form>
  )
}

// ─── ConfirmacionModal ────────────────────────────────────────────────────────

type ModoConfirm = 'PRINCIPAL_SOLO' | 'DUAL' | 'CONVERTIR'

function ConfirmacionModal({
  recurrente,
  mes,
  onClose,
}: {
  recurrente: GastoRecurrente
  mes: string
  onClose: () => void
}) {
  const tieneSecundario = !!recurrente.monto_secundario && !!recurrente.moneda_secundaria && recurrente.monto_secundario > 0
  const monedaPrincipal = (recurrente.moneda || 'ARS') as 'ARS' | 'USD'
  const monedaSecundaria = (recurrente.moneda_secundaria as 'ARS' | 'USD' | undefined) ?? null

  const [montoP, setMontoP] = useState(recurrente.monto_estimado)
  const [montoS, setMontoS] = useState(recurrente.monto_secundario ?? 0)
  const [modo, setModo] = useState<ModoConfirm>(tieneSecundario ? 'DUAL' : 'PRINCIPAL_SOLO')
  const [tc, setTc] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Vista previa de la conversión
  const totalConvertido = useMemo(() => {
    if (modo !== 'CONVERTIR' || !tc || !monedaSecundaria) return montoP
    let secConv = montoS
    if (monedaSecundaria === 'USD' && monedaPrincipal === 'ARS') secConv = montoS * tc
    else if (monedaSecundaria === 'ARS' && monedaPrincipal === 'USD') secConv = montoS / tc
    return Math.round((montoP + secConv) * 100) / 100
  }, [modo, tc, montoP, montoS, monedaSecundaria, monedaPrincipal])

  function confirmar() {
    setError(null)
    if (modo === 'CONVERTIR' && (!tc || tc <= 0)) {
      setError('Ingresá un tipo de cambio válido')
      return
    }
    startTransition(async () => {
      try {
        await confirmarRecurrente({
          recurrenteId: recurrente.id,
          mes,
          montoPrincipal: montoP,
          monedaPrincipal,
          montoSecundario: tieneSecundario ? montoS : undefined,
          monedaSecundaria: tieneSecundario ? monedaSecundaria : undefined,
          modo,
          tipoCambio: modo === 'CONVERTIR' ? tc : undefined,
        })
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-2/60 rounded-lg px-4 py-3">
        <p className="text-sm text-fg-muted font-medium">{recurrente.concepto}</p>
        <p className="text-xs text-fg-soft">
          {recurrente.categoria} · estimado: {formatCurrency(recurrente.monto_estimado, monedaPrincipal)}
          {tieneSecundario && monedaSecundaria && ` + ${formatCurrency(recurrente.monto_secundario!, monedaSecundaria)}`}
        </p>
      </div>

      {/* Selector de modo (sólo si hay secundario) */}
      {tieneSecundario && monedaSecundaria && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-fg-muted">¿Cómo registrar este mes?</label>
          <div className="grid grid-cols-1 gap-2">
            {([
              { v: 'DUAL' as const, label: '2 gastos separados', desc: `Crea uno en ${monedaPrincipal} y otro en ${monedaSecundaria}, cada uno con su propia moneda` },
              { v: 'CONVERTIR' as const, label: `Convertir todo a ${monedaPrincipal}`, desc: `Suma ambos componentes usando un TC y crea 1 gasto en ${monedaPrincipal}` },
              { v: 'PRINCIPAL_SOLO' as const, label: `Solo el componente ${monedaPrincipal}`, desc: 'Ignora la parte secundaria este mes' },
            ]).map(({ v, label, desc }) => (
              <button
                key={v}
                type="button"
                onClick={() => setModo(v)}
                className={cn(
                  'text-left px-3 py-2 rounded-lg border transition-colors',
                  modo === v
                    ? 'bg-orange-500/20 border-orange-500/50'
                    : 'bg-surface-2 border-border-strong hover:border-[#c8c0b0]'
                )}
              >
                <p className={cn('text-sm font-medium', modo === v ? 'text-orange-600' : 'text-fg-muted')}>{label}</p>
                <p className="text-xs text-fg-soft mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Monto principal — siempre editable */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-fg-muted flex items-center justify-between">
          <span>Monto componente {monedaPrincipal}</span>
          <span className="text-xs text-fg-soft font-normal">moneda principal</span>
        </label>
        <input
          type="number"
          step="0.01"
          value={montoP}
          onChange={(e) => setMontoP(Number(e.target.value))}
          className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {recurrente.iva_incluido && (
          <p className="text-xs text-fg-soft">
            Neto sin IVA: <span className="font-mono text-green-700">{formatCurrency(montoP / (1 + recurrente.porcentaje_iva / 100), monedaPrincipal)}</span>
          </p>
        )}
      </div>

      {/* Monto secundario — sólo si hay y modo no es PRINCIPAL_SOLO */}
      {tieneSecundario && monedaSecundaria && modo !== 'PRINCIPAL_SOLO' && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-fg-muted flex items-center justify-between">
            <span>Monto componente {monedaSecundaria}</span>
            <span className="text-xs text-fg-soft font-normal">moneda secundaria</span>
          </label>
          <input
            type="number"
            step="0.01"
            value={montoS}
            onChange={(e) => setMontoS(Number(e.target.value))}
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}

      {/* TC para conversión */}
      {modo === 'CONVERTIR' && monedaSecundaria && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3 space-y-2">
          <label className="text-sm font-medium text-fg-muted">
            Tipo de cambio ({monedaSecundaria === 'USD' ? '1 USD = ? ARS' : '1 ARS = ? USD'})
          </label>
          <input
            type="number"
            step="0.01"
            value={tc || ''}
            onChange={(e) => setTc(Number(e.target.value))}
            placeholder="Ej: 1080"
            className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {tc > 0 && (
            <div className="bg-surface/40 rounded-lg px-3 py-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-fg-muted">{formatCurrency(montoP, monedaPrincipal)}</span>
                <span className="text-fg-muted font-mono">+ {formatCurrency(montoS, monedaSecundaria)}</span>
              </div>
              <div className="flex justify-between border-t border-border-strong pt-1">
                <span className="text-fg-muted font-medium">Total en {monedaPrincipal}:</span>
                <span className="font-mono text-green-700 font-semibold">{formatCurrency(totalConvertido, monedaPrincipal)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resumen */}
      <div className="bg-surface-2/40 border border-border-strong/40 rounded-lg px-3 py-2 text-xs text-fg-muted">
        <span className="text-fg-muted font-medium">Se va a crear: </span>
        {modo === 'PRINCIPAL_SOLO' || !tieneSecundario
          ? `1 gasto pendiente de ${formatCurrency(montoP, monedaPrincipal)}`
          : modo === 'DUAL'
            ? `2 gastos pendientes (${formatCurrency(montoP, monedaPrincipal)} + ${formatCurrency(montoS, monedaSecundaria!)})`
            : `1 gasto pendiente de ${formatCurrency(totalConvertido, monedaPrincipal)} (suma convertida con TC)`}
      </div>

      {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={confirmar} disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Confirmar mes
        </Button>
      </div>
    </div>
  )
}

// ─── DetalleModal ─────────────────────────────────────────────────────────────

function DetalleModal({ recurrente, onClose }: { recurrente: GastoRecurrente; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <div className="bg-surface-2/60 rounded-lg p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-fg-muted">Concepto</span><span className="text-fg">{recurrente.concepto}</span></div>
        <div className="flex justify-between"><span className="text-fg-muted">Categoría</span><span>{recurrente.categoria}</span></div>
        <div className="flex justify-between"><span className="text-fg-muted">Monto estimado</span><span className="font-mono">{formatCurrency(recurrente.monto_estimado)}</span></div>
        <div className="flex justify-between"><span className="text-fg-muted">IVA</span><span>{recurrente.iva_incluido ? `Incluido (${recurrente.porcentaje_iva}%)` : 'No incluido'}</span></div>
        <div className="flex justify-between"><span className="text-fg-muted">Medio pago</span><span>{recurrente.medio_pago}</span></div>
        <div className="flex justify-between"><span className="text-fg-muted">Tipo mes</span><span>{recurrente.tipo_mes}</span></div>
        {recurrente.dia_vencimiento && <div className="flex justify-between"><span className="text-fg-muted">Día venc.</span><span>{recurrente.dia_vencimiento}</span></div>}
      </div>

      {recurrente.prorrateo && (
        <div className="bg-surface-2/60 rounded-lg p-4">
          <p className="text-xs font-medium text-fg-muted mb-2">Prorrateo</p>
          <div className="space-y-1">
            {Object.entries(recurrente.prorrateo).map(([marca, pct]) => (
              <div key={marca} className="flex justify-between text-sm">
                <span className="text-fg-muted">{marca}</span>
                <span className="font-mono text-primary">{pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recurrente.detalles && (
        <div className="bg-surface-2/60 rounded-lg p-4">
          <p className="text-xs font-medium text-fg-muted mb-2">Detalles técnicos</p>
          <pre className="text-xs text-fg-muted font-mono whitespace-pre-wrap">{JSON.stringify(recurrente.detalles, null, 2)}</pre>
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
      </div>
    </div>
  )
}

// ─── BulkEditModal ────────────────────────────────────────────────────────────

function BulkEditModal({
  ids,
  tiposIva,
  onClose,
}: {
  ids: string[]
  tiposIva: TipoIVA[]
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Para cada campo: un toggle "aplicar" + el valor a aplicar
  const [applyCategoria, setApplyCategoria] = useState(false)
  const [categoria, setCategoria] = useState<string>(CATEGORIAS[0])
  const [applyMonto, setApplyMonto] = useState(false)
  const [monto, setMonto] = useState<number>(0)
  const [applyIvaIncluido, setApplyIvaIncluido] = useState(false)
  const [ivaIncluido, setIvaIncluido] = useState(true)
  const [applyPorcentajeIva, setApplyPorcentajeIva] = useState(false)
  const [porcentajeIva, setPorcentajeIva] = useState<number>(21)
  const [applyMedioPago, setApplyMedioPago] = useState(false)
  const [medioPago, setMedioPago] = useState<string>('TRANSFERENCIA')
  const [applyDiaVenc, setApplyDiaVenc] = useState(false)
  const [diaVenc, setDiaVenc] = useState<number>(1)
  const [applyTipoMes, setApplyTipoMes] = useState(false)
  const [tipoMes, setTipoMes] = useState<'CORRIENTE' | 'VENCIDO'>('CORRIENTE')

  // Cuántos cambios se aplicarán
  const cambios: string[] = []
  if (applyCategoria) cambios.push(`Categoría: ${categoria}`)
  if (applyMonto) cambios.push(`Monto: ${formatCurrency(monto)}`)
  if (applyIvaIncluido) cambios.push(`IVA incluido: ${ivaIncluido ? 'sí' : 'no'}`)
  if (applyPorcentajeIva) cambios.push(`% IVA: ${porcentajeIva}%`)
  if (applyMedioPago) cambios.push(`Medio pago: ${medioPago}`)
  if (applyDiaVenc) cambios.push(`Día venc.: ${diaVenc}`)
  if (applyTipoMes) cambios.push(`Tipo mes: ${tipoMes}`)

  function submit() {
    setError(null)
    if (cambios.length === 0) {
      setError('Marcá al menos un campo para aplicar.')
      return
    }
    const patch: BulkRecurrentePatch = {}
    if (applyCategoria) patch.categoria = categoria
    if (applyMonto) patch.monto_estimado = monto
    if (applyIvaIncluido) patch.iva_incluido = ivaIncluido
    if (applyPorcentajeIva) patch.porcentaje_iva = porcentajeIva
    if (applyMedioPago) patch.medio_pago = medioPago
    if (applyDiaVenc) patch.dia_vencimiento = diaVenc
    if (applyTipoMes) patch.tipo_mes = tipoMes

    startTransition(async () => {
      const r = await bulkUpdateRecurrentes(ids, patch)
      if (r.error) setError(r.error)
      else onClose()
    })
  }

  // Helper para renderizar fila "checkbox + label + control"
  function FieldRow({
    apply, setApply, label, children,
  }: {
    apply: boolean; setApply: (v: boolean) => void; label: string; children: React.ReactNode
  }) {
    return (
      <div className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-colors',
        apply ? 'bg-orange-500/5 border-orange-500/30' : 'bg-surface-2/40 border-border-strong/40'
      )}>
        <input
          type="checkbox"
          checked={apply}
          onChange={(e) => setApply(e.target.checked)}
          className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2 text-orange-600 focus:ring-primary shrink-0"
        />
        <label className="text-sm font-medium text-fg-muted w-32 shrink-0">{label}</label>
        <div className={cn('flex-1', !apply && 'opacity-50 pointer-events-none')}>
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        Editando <span className="font-semibold text-fg">{ids.length} recurrente(s)</span>.
        Marcá los campos que querés modificar — el resto queda intacto en cada uno.
      </p>

      <FieldRow apply={applyCategoria} setApply={setApplyCategoria} label="Categoría">
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FieldRow>

      <FieldRow apply={applyMonto} setApply={setApplyMonto} label="Monto estimado">
        <input
          type="number"
          step="0.01"
          min="0"
          value={monto || ''}
          onChange={(e) => setMonto(Number(e.target.value))}
          placeholder="0.00"
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-fg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </FieldRow>

      <FieldRow apply={applyIvaIncluido} setApply={setApplyIvaIncluido} label="IVA incluido">
        <select
          value={ivaIncluido ? 'true' : 'false'}
          onChange={(e) => setIvaIncluido(e.target.value === 'true')}
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="true">Sí (IVA dentro del monto)</option>
          <option value="false">No (IVA aparte)</option>
        </select>
      </FieldRow>

      <FieldRow apply={applyPorcentajeIva} setApply={setApplyPorcentajeIva} label="% IVA">
        <select
          value={String(porcentajeIva)}
          onChange={(e) => setPorcentajeIva(Number(e.target.value))}
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {tiposIva.map((t) => <option key={t.id} value={t.porcentaje}>{t.nombre} ({t.porcentaje}%)</option>)}
        </select>
      </FieldRow>

      <FieldRow apply={applyMedioPago} setApply={setApplyMedioPago} label="Medio de pago">
        <select
          value={medioPago}
          onChange={(e) => setMedioPago(e.target.value)}
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {MEDIOS_PAGO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </FieldRow>

      <FieldRow apply={applyDiaVenc} setApply={setApplyDiaVenc} label="Día vencimiento">
        <input
          type="number"
          min="1"
          max="31"
          value={diaVenc}
          onChange={(e) => setDiaVenc(Number(e.target.value))}
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-fg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </FieldRow>

      <FieldRow apply={applyTipoMes} setApply={setApplyTipoMes} label="Tipo de mes">
        <select
          value={tipoMes}
          onChange={(e) => setTipoMes(e.target.value as 'CORRIENTE' | 'VENCIDO')}
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="CORRIENTE">Corriente</option>
          <option value="VENCIDO">Vencido</option>
        </select>
      </FieldRow>

      {cambios.length > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-sm">
          <p className="text-orange-700 font-medium mb-1">Vas a aplicar a {ids.length} recurrente(s):</p>
          <ul className="text-fg-muted text-xs space-y-0.5">
            {cambios.map((c) => <li key={c}>· {c}</li>)}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-danger bg-danger-bg border border-danger-bd rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={submit} disabled={isPending || cambios.length === 0}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Aplicar a {ids.length}
        </Button>
      </div>
    </div>
  )
}

// ─── BulkAjustarModal ─────────────────────────────────────────────────────────

function BulkAjustarModal({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [pct, setPct] = useState<number>(10)
  const [error, setError] = useState<string | null>(null)
  const factor = 1 + pct / 100

  function submit() {
    setError(null)
    if (pct === 0) {
      setError('El porcentaje debe ser distinto de 0.')
      return
    }
    startTransition(async () => {
      const r = await bulkAjustarMontosRecurrentes(ids, pct)
      if (r.errors.length > 0) setError(r.errors.join('\n'))
      else onClose()
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Multiplica el monto estimado de <span className="font-semibold text-fg">{ids.length} recurrente(s)</span> por el factor que indiques.
        Usá un valor negativo para descontar (ej. -5 = baja del 5%).
      </p>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-fg-muted">Porcentaje de ajuste (%)</label>
        <div className="relative">
          <input
            type="number"
            step="0.01"
            value={pct || ''}
            onChange={(e) => setPct(Number(e.target.value))}
            placeholder="Ej: 10 = +10%, -5 = -5%"
            className="w-full px-3 py-2 pr-8 bg-surface-2 border border-border-strong rounded-lg text-fg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-soft text-sm">%</span>
        </div>
      </div>

      <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-sm">
        <p className="text-orange-700 font-medium">
          Cada monto se va a multiplicar por <span className="font-mono">{factor.toFixed(4)}</span>
        </p>
        <p className="text-fg-muted text-xs mt-1">
          Ejemplo: $100.000 → ${(100000 * factor).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </p>
      </div>

      {error && <p className="text-sm text-danger bg-danger-bg border border-danger-bd rounded-lg px-3 py-2 whitespace-pre-wrap">{error}</p>}

      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={submit} disabled={isPending || pct === 0}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Aplicar a {ids.length}
        </Button>
      </div>
    </div>
  )
}

// ─── RecurrentesClient ────────────────────────────────────────────────────────

export function RecurrentesClient({ mes, recurrentes, cuentas, tarjetas, prorrateosDefault, gastosMes, tiposIva, configProrrateo }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [modal, setModal] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editRec, setEditRec] = useState<GastoRecurrente | undefined>()
  const [confirmarRec, setConfirmarRec] = useState<GastoRecurrente | undefined>()
  const [detalleRec, setDetalleRec] = useState<GastoRecurrente | undefined>()
  const [isPending, startTransition] = useTransition()
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkAjustarOpen, setBulkAjustarOpen] = useState(false)

  const confirmadosIds = new Set(gastosMes.filter((g) => g.recurrente_id).map((g) => g.recurrente_id!))
  const recurrentesPendientes = recurrentes.filter((r) => !confirmadosIds.has(r.id))
  // Los ids seleccionados que aún no fueron confirmados en este mes — sirve para "Pasar a gastos del mes"
  const idsSelNoConfirmados = Array.from(seleccionados).filter((id) => !confirmadosIds.has(id))

  function toggleSel(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (seleccionados.size === recurrentes.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(recurrentes.map((r) => r.id)))
    }
  }

  function confirmarMasivo() {
    // Solo aplica a los no confirmados de la selección
    if (idsSelNoConfirmados.length === 0) {
      alert('Los recurrentes seleccionados ya están confirmados este mes.')
      return
    }
    if (!confirm(`¿Pasar ${idsSelNoConfirmados.length} recurrente(s) a gastos del mes ${mes}?\nUsará el monto estimado de cada uno.`)) return
    startTransition(async () => {
      try {
        const r = await confirmarRecurrentesMasivo(idsSelNoConfirmados, mes)
        if (r.errors.length) {
          alert(`Confirmados: ${r.ok}\nErrores:\n${r.errors.join('\n')}`)
        }
        setSeleccionados(new Set())
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  function bulkToggleActivo(activo: boolean) {
    if (seleccionados.size === 0) return
    const accion = activo ? 'activar' : 'desactivar'
    if (!confirm(`¿${accion[0].toUpperCase() + accion.slice(1)} ${seleccionados.size} recurrente(s)?`)) return
    startTransition(async () => {
      const r = await bulkToggleRecurrentesActivo(Array.from(seleccionados), activo)
      if (r.error) alert(r.error)
      else setSeleccionados(new Set())
    })
  }

  // Totales separados por moneda — incluye componente principal y secundario
  const totalARS = recurrentes.reduce((s, r) => {
    const principal = r.moneda === 'USD' ? 0 : Number(r.monto_estimado)
    const secundario = r.moneda_secundaria === 'ARS' ? Number(r.monto_secundario ?? 0) : 0
    return s + principal + secundario
  }, 0)
  const totalUSD = recurrentes.reduce((s, r) => {
    const principal = r.moneda === 'USD' ? Number(r.monto_estimado) : 0
    const secundario = r.moneda_secundaria === 'USD' ? Number(r.monto_secundario ?? 0) : 0
    return s + principal + secundario
  }, 0)
  const confirmadosCount = recurrentes.filter((r) => confirmadosIds.has(r.id)).length

  function setMes(nuevo: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', nuevo)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg">Gastos recurrentes</h1>
          <p className="text-sm text-fg-muted mt-0.5">Plantillas de gastos mensuales — confirmar para {formatMonth(mes)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select options={getMonthOptions()} value={mes} onChange={(e) => setMes(e.target.value)} className="w-44" />
          <Button variant="secondary" onClick={() => setImportOpen(true)} title="Importar desde Excel">
            <Upload className="w-4 h-4" />
            Importar
          </Button>
          <Button onClick={() => { setEditRec(undefined); setModal(true) }} title="Crear nuevo gasto recurrente">
            <Plus className="w-4 h-4" />
            Nuevo recurrente
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-surface border border-border rounded-xl p-4 space-y-1">
          <p className="text-xs text-fg-muted">Total estimado mes</p>
          <p className="text-lg font-bold text-fg font-mono">
            {totalARS > 0 ? formatCurrency(totalARS, 'ARS') : <span className="text-fg-muted">—</span>}
          </p>
          <p className="text-xs font-mono text-green-700/80">
            {totalUSD > 0 ? formatCurrency(totalUSD, 'USD') : <span className="text-fg-muted">U$S —</span>}
          </p>
        </div>
        <div className="bg-surface border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Confirmados</p>
          <p className="text-xl font-bold text-green-700">{confirmadosCount} / {recurrentes.length}</p>
        </div>
        <div className="bg-surface border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Pendientes de confirmar</p>
          <p className="text-xl font-bold text-amber-700">{recurrentes.length - confirmadosCount}</p>
        </div>
      </div>

      {/* Barra de acciones masivas */}
      {seleccionados.size > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/40 rounded-xl px-4 py-3 flex items-center justify-between sticky top-0 z-10 backdrop-blur flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm">
            <ListChecks className="w-4 h-4 text-primary" />
            <span className="text-orange-600 font-medium">
              {seleccionados.size} seleccionado(s)
              {idsSelNoConfirmados.length !== seleccionados.size && (
                <span className="text-fg-soft ml-1">({idsSelNoConfirmados.length} sin confirmar este mes)</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="secondary" onClick={() => setSeleccionados(new Set())}>
              Limpiar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setBulkEditOpen(true)}
              disabled={isPending}
              title="Editar campos en lote (categoría, monto, IVA, etc)"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Editar ({seleccionados.size})
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setBulkAjustarOpen(true)}
              disabled={isPending}
              title="Subir o bajar todos los montos un %"
            >
              <Percent className="w-3.5 h-3.5" />
              Ajustar montos
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => bulkToggleActivo(true)}
              disabled={isPending}
              title="Activar los seleccionados"
            >
              <Power className="w-3.5 h-3.5" />
              Activar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => bulkToggleActivo(false)}
              disabled={isPending}
              title="Desactivar los seleccionados (no van a aparecer al confirmar el mes)"
            >
              <PowerOff className="w-3.5 h-3.5" />
              Desactivar
            </Button>
            {idsSelNoConfirmados.length > 0 && (
              <Button
                size="sm"
                variant="success"
                onClick={confirmarMasivo}
                disabled={isPending}
                title={`Pasar ${idsSelNoConfirmados.length} recurrente(s) a gastos del mes con su monto estimado`}
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Pasar a gastos ({idsSelNoConfirmados.length})
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={recurrentes.length > 0 && seleccionados.size === recurrentes.length}
                  onChange={toggleAll}
                  disabled={recurrentes.length === 0}
                  title="Seleccionar todos"
                  className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2 text-orange-600 focus:ring-primary"
                />
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Concepto</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Categoría</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Estimado</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Medio</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Compartido</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Estado mes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {recurrentes.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-fg-soft">
                  <Repeat className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Sin gastos recurrentes configurados
                </td>
              </tr>
            ) : (
              recurrentes.map((r) => {
                const confirmado = confirmadosIds.has(r.id)
                const checked = seleccionados.has(r.id)
                return (
                  <tr key={r.id} className={cn(
                    'border-b border-border/60 hover:bg-surface-2/30',
                    checked && 'bg-orange-500/5',
                  )}>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSel(r.id)}
                        title={confirmado
                          ? 'Ya confirmado este mes (podés editarlo igual, no se va a confirmar de nuevo)'
                          : 'Seleccionar'}
                        className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2 text-orange-600 focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-fg">{r.concepto}</p>
                      <p className="text-xs text-fg-soft">
                        {r.iva_incluido && <span>IVA {r.porcentaje_iva}% incluido · </span>}
                        {r.tipo_mes === 'VENCIDO' ? 'mes vencido' : 'mes corriente'}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted">{r.categoria}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-fg">
                      {formatCurrency(r.monto_estimado, r.moneda)}
                      {r.monto_secundario && r.monto_secundario > 0 && r.moneda_secundaria && (
                        <p className="text-xs text-blue-700 font-mono">
                          + {formatCurrency(r.monto_secundario, r.moneda_secundaria)}
                        </p>
                      )}
                      {r.iva_incluido && (
                        <p className="text-xs text-green-700 font-mono">
                          neto: {formatCurrency(r.monto_estimado / (1 + r.porcentaje_iva / 100), r.moneda)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                        {r.medio_pago === 'TARJETA' ? <CreditCard className="w-3 h-3" /> : <Receipt className="w-3 h-3" />}
                        {r.medio_pago}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.prorrateo ? (
                        <Badge variant="info">Sí</Badge>
                      ) : (
                        <span className="text-xs text-fg-soft">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {confirmado ? (
                        <Badge variant="success">Confirmado</Badge>
                      ) : (
                        <Badge variant="warning">Pendiente</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {!confirmado && (
                          <Button size="sm" variant="success" onClick={() => setConfirmarRec(r)} title="Confirmar mes">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDetalleRec(r)} title="Detalles">
                          <Info className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditRec(r); setModal(true) }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={isPending}
                          onClick={() => {
                            if (!confirm('¿Eliminar este recurrente?')) return
                            startTransition(() => deleteRecurrente(r.id))
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onOpenChange={setModal} title={editRec ? 'Editar recurrente' : 'Nuevo recurrente'} className="max-w-xl">
        <RecurrenteForm
          recurrente={editRec}
          cuentas={cuentas}
          tarjetas={tarjetas}
          prorrateosDefault={prorrateosDefault}
          tiposIva={tiposIva}
          configProrrateo={configProrrateo}
          onClose={() => setModal(false)}
        />
      </Modal>

      <ExcelImport
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar gastos recurrentes"
        description="Subí un Excel con los gastos recurrentes a configurar"
        templateName="recurrentes"
        templateColumns={[
          { key: 'concepto', label: 'concepto', required: true, example: 'Alquiler local' },
          { key: 'categoria', label: 'categoria', example: 'Alquiler' },
          { key: 'monto_estimado', label: 'monto_estimado', required: true, example: 350000 },
          { key: 'moneda', label: 'moneda', example: 'ARS' },
          { key: 'iva_incluido', label: 'iva_incluido', example: 'true' },
          { key: 'porcentaje_iva', label: 'porcentaje_iva', example: 21 },
          { key: 'medio_pago', label: 'medio_pago', example: 'TRANSFERENCIA' },
          { key: 'dia_vencimiento', label: 'dia_vencimiento', example: 10 },
          { key: 'tipo_mes', label: 'tipo_mes', example: 'CORRIENTE' },
        ]}
        onImport={async (rows) => {
          const r = await importRecurrentesExcel(rows as unknown as Parameters<typeof importRecurrentesExcel>[0])
          return r
        }}
      />

      {confirmarRec && (
        <Modal open={!!confirmarRec} onOpenChange={(o) => { if (!o) setConfirmarRec(undefined) }} title={`Confirmar ${formatMonth(mes)}`} className="max-w-md">
          <ConfirmacionModal recurrente={confirmarRec} mes={mes} onClose={() => setConfirmarRec(undefined)} />
        </Modal>
      )}

      {detalleRec && (
        <Modal open={!!detalleRec} onOpenChange={(o) => { if (!o) setDetalleRec(undefined) }} title="Detalles del recurrente" className="max-w-md">
          <DetalleModal recurrente={detalleRec} onClose={() => setDetalleRec(undefined)} />
        </Modal>
      )}

      <Modal
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        title="Edición masiva de recurrentes"
        description="Aplicar los mismos cambios a varios recurrentes a la vez"
        className="max-w-2xl"
      >
        <BulkEditModal
          ids={Array.from(seleccionados)}
          tiposIva={tiposIva}
          onClose={() => { setBulkEditOpen(false); setSeleccionados(new Set()) }}
        />
      </Modal>

      <Modal
        open={bulkAjustarOpen}
        onOpenChange={setBulkAjustarOpen}
        title="Ajustar montos por porcentaje"
        description="Aumentar o disminuir todos los montos seleccionados un %"
        className="max-w-md"
      >
        <BulkAjustarModal
          ids={Array.from(seleccionados)}
          onClose={() => { setBulkAjustarOpen(false); setSeleccionados(new Set()) }}
        />
      </Modal>
    </div>
  )
}
