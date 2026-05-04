'use client'

import { useActionState, useState } from 'react'
import { createInstrumento, updateInstrumento } from '@/app/actions/inversiones'
import type { Instrumento } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Loader2, TrendingUp, Lock, Unlock } from 'lucide-react'
import { formatMoneda } from '@/lib/inversiones-calc'
import { cn } from '@/lib/utils'

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

  const tasaDecimal = tasaPct / 100
  const interesEstimado = capital * tasaDecimal

  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('inversor_id', inversorId)
      fd.set('moneda', moneda)
      fd.set('capital_inicial', String(capital))
      fd.set('tasa_mensual', String(tasaDecimal))
      fd.set('capitalizable', capitalizable ? 'true' : 'false')
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
        <label className="block text-sm font-medium text-slate-300">Moneda</label>
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
                    ? 'bg-green-500/15 border-green-500/40 text-green-400'
                    : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Capital + tasa */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-400">Capital inicial</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={capital || ''}
              onChange={(e) => setCapital(Number(e.target.value))}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-400">Tasa mensual (%)</label>
            <div className="relative">
              <input
                type="number"
                step="0.0001"
                min="0"
                value={tasaPct || ''}
                onChange={(e) => setTasaPct(Number(e.target.value))}
                placeholder="2.5"
                className="w-full px-3 py-2 pr-7 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
            </div>
          </div>
        </div>

        {capital > 0 && tasaPct > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Interés mes completo
            </span>
            <span className="font-mono text-amber-400 font-semibold">
              {formatMoneda(interesEstimado, moneda)} <span className="text-slate-500">/ mes</span>
            </span>
          </div>
        )}
      </div>

      {/* Capitalizable toggle */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-300">Capitalización</span>
          <button
            type="button"
            onClick={() => setCapitalizable(!capitalizable)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
              capitalizable
                ? 'bg-purple-500/15 border-purple-500/40 text-purple-400'
                : 'bg-slate-700 border-slate-600 text-slate-300'
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
            : 'bg-slate-700/40 border border-slate-600/40 text-slate-300'
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Fecha de inicio" name="fecha_inicio" type="date" defaultValue={instrumento?.fecha_inicio ?? ''} required />
        <Input label="Fecha de fin (opcional)" name="fecha_fin" type="date" defaultValue={instrumento?.fecha_fin ?? ''} />
      </div>

      <Textarea label="Notas del acuerdo" name="notas" defaultValue={instrumento?.notas ?? ''} placeholder="Condiciones, particularidades..." rows={3} />

      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

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
