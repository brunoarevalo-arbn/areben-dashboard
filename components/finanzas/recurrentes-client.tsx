'use client'

import { useActionState, useState, useTransition, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  createRecurrente, updateRecurrente, deleteRecurrente, confirmarRecurrente,
  confirmarRecurrentesMasivo, importRecurrentesExcel,
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
  Receipt, CreditCard, Upload, ListChecks,
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
      <div className="bg-[#f5f0e6]/40 border border-[#d6d0c4]/40 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="block text-xs font-medium text-slate-600">Monto principal</label>
            <input
              type="number"
              step="0.01"
              value={montoEstimado || ''}
              onChange={(e) => setMontoEstimado(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-700 border border-[#c8c0b0] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
              placeholder="0.00"
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

        <label className="flex items-center gap-2 cursor-pointer text-xs">
          <input
            type="checkbox"
            checked={tieneSecundario}
            onChange={(e) => setTieneSecundario(e.target.checked)}
            className="w-4 h-4 rounded border-[#c8c0b0] bg-slate-700"
          />
          <span className="text-slate-700">Componente en otra moneda (ej: alquiler con parte fija USD + ajuste ARS)</span>
        </label>

        {tieneSecundario && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-6 pt-1">
            <div className="col-span-2 space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">Monto secundario</label>
              <input
                type="number"
                step="0.01"
                value={montoSecundario || ''}
                onChange={(e) => setMontoSecundario(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-700 border border-[#c8c0b0] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">Moneda</label>
              <select
                value={monedaSecundaria}
                onChange={(e) => setMonedaSecundaria(e.target.value as 'ARS' | 'USD')}
                className="w-full px-3 py-2 bg-slate-700 border border-[#c8c0b0] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
              >
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* IVA */}
      <div className="bg-[#f5f0e6]/40 border border-[#d6d0c4]/40 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600">Tipo de IVA</label>
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
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600">Día de vencimiento</label>
            <input
              type="number"
              min="1" max="31"
              defaultValue={recurrente?.dia_vencimiento ?? ''}
              name="dia_vencimiento"
              className="w-full px-3 py-2 bg-slate-700 border border-[#c8c0b0] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
              placeholder="ej: 10"
            />
          </div>
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
        {ivaIncluido && montoEstimado > 0 && (
          <div className="bg-slate-700/40 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
            <span className="text-slate-600">Neto sin IVA ({porcentajeIva}%)</span>
            <span className="font-mono text-green-400 font-semibold">
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
      <div className="bg-[#f5f0e6]/60 border border-[#d6d0c4]/60 rounded-xl p-4 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={esCompartido}
            onChange={(e) => setEsCompartido(e.target.checked)}
            className="w-4 h-4 rounded border-[#c8c0b0] bg-slate-700"
          />
          <span className="text-sm font-medium text-slate-700">Gasto compartido (prorratear entre marcas)</span>
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

      {error && <p className="text-sm text-red-400">{error}</p>}
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
      <div className="bg-[#f5f0e6]/60 rounded-lg px-4 py-3">
        <p className="text-sm text-slate-700 font-medium">{recurrente.concepto}</p>
        <p className="text-xs text-slate-500">
          {recurrente.categoria} · estimado: {formatCurrency(recurrente.monto_estimado, monedaPrincipal)}
          {tieneSecundario && monedaSecundaria && ` + ${formatCurrency(recurrente.monto_secundario!, monedaSecundaria)}`}
        </p>
      </div>

      {/* Selector de modo (sólo si hay secundario) */}
      {tieneSecundario && monedaSecundaria && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">¿Cómo registrar este mes?</label>
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
                    : 'bg-[#f5f0e6] border-[#d6d0c4] hover:border-[#c8c0b0]'
                )}
              >
                <p className={cn('text-sm font-medium', modo === v ? 'text-orange-600' : 'text-slate-800')}>{label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Monto principal — siempre editable */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700 flex items-center justify-between">
          <span>Monto componente {monedaPrincipal}</span>
          <span className="text-xs text-slate-500 font-normal">moneda principal</span>
        </label>
        <input
          type="number"
          step="0.01"
          value={montoP}
          onChange={(e) => setMontoP(Number(e.target.value))}
          className="w-full px-3 py-2 bg-slate-700 border border-[#c8c0b0] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        {recurrente.iva_incluido && (
          <p className="text-xs text-slate-500">
            Neto sin IVA: <span className="font-mono text-green-400">{formatCurrency(montoP / (1 + recurrente.porcentaje_iva / 100), monedaPrincipal)}</span>
          </p>
        )}
      </div>

      {/* Monto secundario — sólo si hay y modo no es PRINCIPAL_SOLO */}
      {tieneSecundario && monedaSecundaria && modo !== 'PRINCIPAL_SOLO' && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 flex items-center justify-between">
            <span>Monto componente {monedaSecundaria}</span>
            <span className="text-xs text-slate-500 font-normal">moneda secundaria</span>
          </label>
          <input
            type="number"
            step="0.01"
            value={montoS}
            onChange={(e) => setMontoS(Number(e.target.value))}
            className="w-full px-3 py-2 bg-slate-700 border border-[#c8c0b0] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      )}

      {/* TC para conversión */}
      {modo === 'CONVERTIR' && monedaSecundaria && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3 space-y-2">
          <label className="text-sm font-medium text-slate-700">
            Tipo de cambio ({monedaSecundaria === 'USD' ? '1 USD = ? ARS' : '1 ARS = ? USD'})
          </label>
          <input
            type="number"
            step="0.01"
            value={tc || ''}
            onChange={(e) => setTc(Number(e.target.value))}
            placeholder="Ej: 1080"
            className="w-full px-3 py-2 bg-slate-700 border border-[#c8c0b0] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {tc > 0 && (
            <div className="bg-white/40 rounded-lg px-3 py-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">{formatCurrency(montoP, monedaPrincipal)}</span>
                <span className="text-slate-700 font-mono">+ {formatCurrency(montoS, monedaSecundaria)}</span>
              </div>
              <div className="flex justify-between border-t border-[#d6d0c4] pt-1">
                <span className="text-slate-700 font-medium">Total en {monedaPrincipal}:</span>
                <span className="font-mono text-green-400 font-semibold">{formatCurrency(totalConvertido, monedaPrincipal)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resumen */}
      <div className="bg-[#f5f0e6]/40 border border-[#d6d0c4]/40 rounded-lg px-3 py-2 text-xs text-slate-600">
        <span className="text-slate-700 font-medium">Se va a crear: </span>
        {modo === 'PRINCIPAL_SOLO' || !tieneSecundario
          ? `1 gasto pendiente de ${formatCurrency(montoP, monedaPrincipal)}`
          : modo === 'DUAL'
            ? `2 gastos pendientes (${formatCurrency(montoP, monedaPrincipal)} + ${formatCurrency(montoS, monedaSecundaria!)})`
            : `1 gasto pendiente de ${formatCurrency(totalConvertido, monedaPrincipal)} (suma convertida con TC)`}
      </div>

      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

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
      <div className="bg-[#f5f0e6]/60 rounded-lg p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-slate-600">Concepto</span><span className="text-slate-900">{recurrente.concepto}</span></div>
        <div className="flex justify-between"><span className="text-slate-600">Categoría</span><span>{recurrente.categoria}</span></div>
        <div className="flex justify-between"><span className="text-slate-600">Monto estimado</span><span className="font-mono">{formatCurrency(recurrente.monto_estimado)}</span></div>
        <div className="flex justify-between"><span className="text-slate-600">IVA</span><span>{recurrente.iva_incluido ? `Incluido (${recurrente.porcentaje_iva}%)` : 'No incluido'}</span></div>
        <div className="flex justify-between"><span className="text-slate-600">Medio pago</span><span>{recurrente.medio_pago}</span></div>
        <div className="flex justify-between"><span className="text-slate-600">Tipo mes</span><span>{recurrente.tipo_mes}</span></div>
        {recurrente.dia_vencimiento && <div className="flex justify-between"><span className="text-slate-600">Día venc.</span><span>{recurrente.dia_vencimiento}</span></div>}
      </div>

      {recurrente.prorrateo && (
        <div className="bg-[#f5f0e6]/60 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-600 mb-2">Prorrateo</p>
          <div className="space-y-1">
            {Object.entries(recurrente.prorrateo).map(([marca, pct]) => (
              <div key={marca} className="flex justify-between text-sm">
                <span className="text-slate-700">{marca}</span>
                <span className="font-mono text-orange-500">{pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recurrente.detalles && (
        <div className="bg-[#f5f0e6]/60 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-600 mb-2">Detalles técnicos</p>
          <pre className="text-xs text-slate-700 font-mono whitespace-pre-wrap">{JSON.stringify(recurrente.detalles, null, 2)}</pre>
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
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

  const confirmadosIds = new Set(gastosMes.filter((g) => g.recurrente_id).map((g) => g.recurrente_id!))
  const recurrentesPendientes = recurrentes.filter((r) => !confirmadosIds.has(r.id))

  function toggleSel(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (seleccionados.size === recurrentesPendientes.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(recurrentesPendientes.map((r) => r.id)))
    }
  }

  function confirmarMasivo() {
    if (seleccionados.size === 0) return
    if (!confirm(`¿Pasar ${seleccionados.size} recurrente(s) a gastos del mes ${mes}?\nUsará el monto estimado de cada uno.`)) return
    startTransition(async () => {
      try {
        const r = await confirmarRecurrentesMasivo(Array.from(seleccionados), mes)
        if (r.errors.length) {
          alert(`Confirmados: ${r.ok}\nErrores:\n${r.errors.join('\n')}`)
        }
        setSeleccionados(new Set())
      } catch (e) {
        alert((e as Error).message)
      }
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
          <h1 className="text-2xl font-bold text-slate-900">Gastos recurrentes</h1>
          <p className="text-sm text-slate-600 mt-0.5">Plantillas de gastos mensuales — confirmar para {formatMonth(mes)}</p>
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
        <div className="bg-white border border-[#e8e4dc] rounded-xl p-4 space-y-1">
          <p className="text-xs text-slate-600">Total estimado mes</p>
          <p className="text-lg font-bold text-slate-900 font-mono">
            {totalARS > 0 ? formatCurrency(totalARS, 'ARS') : <span className="text-slate-600">—</span>}
          </p>
          <p className="text-xs font-mono text-green-400/80">
            {totalUSD > 0 ? formatCurrency(totalUSD, 'USD') : <span className="text-slate-600">U$S —</span>}
          </p>
        </div>
        <div className="bg-white border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-600 mb-1">Confirmados</p>
          <p className="text-xl font-bold text-green-400">{confirmadosCount} / {recurrentes.length}</p>
        </div>
        <div className="bg-white border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-600 mb-1">Pendientes de confirmar</p>
          <p className="text-xl font-bold text-amber-400">{recurrentes.length - confirmadosCount}</p>
        </div>
      </div>

      {/* Barra de acciones masivas */}
      {seleccionados.size > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/40 rounded-xl px-4 py-3 flex items-center justify-between sticky top-0 z-10 backdrop-blur">
          <div className="flex items-center gap-2 text-sm">
            <ListChecks className="w-4 h-4 text-orange-500" />
            <span className="text-orange-600 font-medium">{seleccionados.size} recurrente(s) seleccionado(s)</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSeleccionados(new Set())}>
              Limpiar
            </Button>
            <Button
              size="sm"
              variant="success"
              onClick={confirmarMasivo}
              disabled={isPending}
              title={`Pasar ${seleccionados.size} recurrente(s) a gastos del mes con su monto estimado`}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Pasar a gastos del mes
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white border border-[#e8e4dc] rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e8e4dc]">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={recurrentesPendientes.length > 0 && seleccionados.size === recurrentesPendientes.length}
                  onChange={toggleAll}
                  disabled={recurrentesPendientes.length === 0}
                  title="Seleccionar todos los pendientes del mes"
                  className="w-4 h-4 rounded border-[#c8c0b0] bg-slate-700 text-orange-600 focus:ring-orange-500"
                />
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Concepto</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Categoría</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Estimado</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Medio</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Compartido</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Estado mes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {recurrentes.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
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
                    'border-b border-[#e8e4dc]/60 hover:bg-[#f5f0e6]/30',
                    checked && 'bg-orange-500/5',
                  )}>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSel(r.id)}
                        disabled={confirmado}
                        title={confirmado ? 'Ya confirmado este mes' : 'Seleccionar para confirmación masiva'}
                        className="w-4 h-4 rounded border-[#c8c0b0] bg-slate-700 text-orange-600 focus:ring-orange-500 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-900">{r.concepto}</p>
                      <p className="text-xs text-slate-500">
                        {r.iva_incluido && <span>IVA {r.porcentaje_iva}% incluido · </span>}
                        {r.tipo_mes === 'VENCIDO' ? 'mes vencido' : 'mes corriente'}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{r.categoria}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-900">
                      {formatCurrency(r.monto_estimado, r.moneda)}
                      {r.monto_secundario && r.monto_secundario > 0 && r.moneda_secundaria && (
                        <p className="text-xs text-blue-400 font-mono">
                          + {formatCurrency(r.monto_secundario, r.moneda_secundaria)}
                        </p>
                      )}
                      {r.iva_incluido && (
                        <p className="text-xs text-green-400 font-mono">
                          neto: {formatCurrency(r.monto_estimado / (1 + r.porcentaje_iva / 100), r.moneda)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-700">
                        {r.medio_pago === 'TARJETA' ? <CreditCard className="w-3 h-3" /> : <Receipt className="w-3 h-3" />}
                        {r.medio_pago}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.prorrateo ? (
                        <Badge variant="info">Sí</Badge>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
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
    </div>
  )
}
