'use client'

import { useActionState, useState } from 'react'
import { createInstrumento, updateInstrumento } from '@/app/actions/inversiones'
import type { Instrumento } from '@/types/database'
import { Button } from '@/components/ui/button'
import { NumberInput } from '@/components/ui/number-input'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Loader2, TrendingUp, Lock, Unlock, CalendarCheck } from 'lucide-react'
import { formatMoneda, sumarMeses, diasEntre, mesesEntre } from '@/lib/inversiones-calc'
import { formatDate, cn } from '@/lib/utils'

const PLAZOS = [1, 2, 3, 6, 9, 12]

interface Props {
  instrumento?: Instrumento
  inversorId: string
  onClose: () => void
}

export function InstrumentoForm({ instrumento, inversorId, onClose }: Props) {
  const action = instrumento ? updateInstrumento.bind(null, instrumento.id) : createInstrumento

  const [moneda, setMoneda] = useState<'USD' | 'ARS'>(instrumento?.moneda ?? 'USD')
  const [capital, setCapital] = useState(instrumento?.capital_inicial ?? 0)
  const [tasaPct, setTasaPct] = useState(instrumento ? instrumento.tasa_mensual * 100 : 2.5)
  const [capitalizable, setCapitalizable] = useState(instrumento?.capitalizable ?? true)

  // El plazo se pacta en MESES y el vencimiento sale solo (14-ago a 3 meses vence el
  // 14-nov, no a los 90 días contados). Queda el modo "fecha exacta" para los pocos
  // casos en que se pacta un día puntual de entrada.
  const mesesGuardados = instrumento?.fecha_inicio && instrumento?.fecha_fin
    ? mesesEntre(instrumento.fecha_inicio, instrumento.fecha_fin)
    : null
  const [fechaInicio, setFechaInicio] = useState(instrumento?.fecha_inicio ?? '')
  const [modoPlazo, setModoPlazo] = useState<'meses' | 'fecha' | 'sin'>(
    !instrumento?.fecha_fin ? (instrumento ? 'sin' : 'meses') : mesesGuardados ? 'meses' : 'fecha'
  )
  const [meses, setMeses] = useState(mesesGuardados ?? 3)
  const [fechaFinCustom, setFechaFinCustom] = useState(instrumento?.fecha_fin ?? '')

  const fechaFin = modoPlazo === 'sin'
    ? ''
    : modoPlazo === 'fecha'
      ? fechaFinCustom
      : fechaInicio ? sumarMeses(fechaInicio, meses) : ''
  const plazoDias = fechaInicio && fechaFin ? diasEntre(fechaInicio, fechaFin) : null

  const tasaDecimal = tasaPct / 100
  const interesEstimado = capital * tasaDecimal

  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('inversor_id', inversorId)
      fd.set('moneda', moneda)
      fd.set('capital_inicial', String(capital))
      fd.set('tasa_mensual', String(tasaDecimal))
      fd.set('capitalizable', capitalizable ? 'true' : 'false')
      fd.set('fecha_inicio', fechaInicio)
      fd.set('fecha_fin', fechaFin)
      fd.set('plazo_dias', plazoDias && plazoDias > 0 ? String(plazoDias) : '')
      if (modoPlazo !== 'sin' && !fechaFin) return 'Falta el vencimiento: elegí la fecha de inicio y el plazo.'
      const r = await action(prev, fd)
      if (!r) onClose()
      return r
    },
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Código (opcional)" name="codigo" defaultValue={instrumento?.codigo ?? ''} placeholder="Ej: INV-001" />
        <Select label="Estado" name="estado" defaultValue={instrumento?.estado ?? 'activo'} options={[
          { value: 'activo', label: 'Activo' },
          { value: 'cerrado', label: 'Cerrado' },
          { value: 'renovado', label: 'Renovado' },
        ]} />
      </div>

      {/* Moneda toggle */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-fg-muted">Moneda</label>
        <div className="grid grid-cols-2 gap-2">
          {(['USD', 'ARS'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMoneda(m)}
              className={cn(
                'px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                moneda === m
                  ? m === 'USD'
                    ? 'bg-green-500/15 border-green-500/40 text-green-700'
                    : 'bg-orange-500/15 border-orange-500/40 text-primary'
                  : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg-muted'
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Capital + tasa */}
      <div className="bg-surface-2/40 border border-border-strong/40 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-fg-muted">Capital inicial</label>
            <NumberInput
              step="0.01"
              min="0"
              value={capital}
              onChange={setCapital}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-fg-muted">Tasa mensual (%)</label>
            <div className="relative">
              <NumberInput
                step="0.0001"
                min="0"
                value={tasaPct}
                onChange={setTasaPct}
                placeholder="2.5"
                className="w-full px-3 py-2 pr-7 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-soft text-xs">%</span>
            </div>
          </div>
        </div>

        {capital > 0 && tasaPct > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
            <span className="text-fg-muted flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Interés mes completo
            </span>
            <span className="font-mono text-amber-700 font-semibold">
              {formatMoneda(interesEstimado, moneda)} <span className="text-fg-soft">/ mes</span>
            </span>
          </div>
        )}
      </div>

      {/* Capitalizable toggle */}
      <div className="bg-surface-2/40 border border-border-strong/40 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-fg-muted">Capitalización</span>
          <button
            type="button"
            onClick={() => setCapitalizable(!capitalizable)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
              capitalizable
                ? 'bg-purple-500/15 border-purple-500/40 text-purple-700'
                : 'bg-surface-2 border-[#c8c0b0] text-fg-muted'
            )}
          >
            {capitalizable ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            {capitalizable ? 'Capitalizable ON' : 'Capitalizable OFF'}
          </button>
        </div>
        <div className={cn(
          'rounded-lg p-3 text-xs',
          capitalizable
            ? 'bg-purple-500/5 border border-purple-500/20 text-purple-300'
            : 'bg-surface-2/40 border border-[#c8c0b0]/40 text-fg-muted'
        )}>
          {capitalizable ? (
            <p>
              <strong className="block mb-1">Los intereses se suman al capital cada mes.</strong>
              El saldo crece exponencialmente. Próximo mes calcula sobre el saldo nuevo.
            </p>
          ) : (
            <p>
              <strong className="block mb-1">Los intereses se pagan/acumulan pero el capital no cambia.</strong>
              Cada mes calcula sobre el capital inicial fijo (interés simple).
            </p>
          )}
        </div>
      </div>

      {/* Plazo y vencimiento */}
      <div className="bg-surface-2/40 border border-border-strong/40 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Fecha de inicio"
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-fg-muted">Plazo</label>
            <div className="flex flex-wrap gap-1.5">
              {PLAZOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setModoPlazo('meses'); setMeses(m) }}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                    modoPlazo === 'meses' && meses === m
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg'
                  )}
                >
                  {m === 12 ? '1 año' : `${m} ${m === 1 ? 'mes' : 'meses'}`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setModoPlazo('fecha'); if (!fechaFinCustom && fechaInicio) setFechaFinCustom(sumarMeses(fechaInicio, meses)) }}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                  modoPlazo === 'fecha'
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg'
                )}
              >
                Fecha exacta
              </button>
              <button
                type="button"
                onClick={() => setModoPlazo('sin')}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                  modoPlazo === 'sin'
                    ? 'bg-surface-2 border-border-strong text-fg'
                    : 'bg-surface-2 border-border-strong text-fg-soft hover:text-fg-muted'
                )}
              >
                Sin vencimiento
              </button>
            </div>
          </div>
        </div>

        {modoPlazo === 'fecha' && (
          <Input
            label="Vencimiento pactado"
            type="date"
            value={fechaFinCustom}
            onChange={(e) => setFechaFinCustom(e.target.value)}
          />
        )}

        {modoPlazo !== 'sin' && fechaFin && plazoDias != null && plazoDias > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
            <span className="text-fg-muted flex items-center gap-1.5">
              <CalendarCheck className="w-3.5 h-3.5" />
              Vence el <strong className="text-fg">{formatDate(fechaFin)}</strong>
            </span>
            <span className="text-fg-soft">
              {plazoDias} días · devenga hasta el día anterior
            </span>
          </div>
        )}

        {modoPlazo === 'sin' && (
          <p className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            Sin vencimiento no se puede renovar ni calcular el plazo: los intereses se van
            devengando mes a mes sin fecha de corte.
          </p>
        )}
      </div>

      <Textarea label="Notas del acuerdo" name="notas" defaultValue={instrumento?.notas ?? ''} placeholder="Condiciones, particularidades..." rows={3} />

      {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {instrumento ? 'Guardar' : 'Crear instrumento'}
        </Button>
      </div>
    </form>
  )
}
