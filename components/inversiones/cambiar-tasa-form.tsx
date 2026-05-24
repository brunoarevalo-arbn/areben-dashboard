'use client'

import { useActionState, useState } from 'react'
import { agregarTramoTasa } from '@/app/actions/inversiones'
import type { Instrumento } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { formatMoneda } from '@/lib/inversiones-calc'
import { Loader2, TrendingUp, AlertCircle } from 'lucide-react'

function primerDiaMesSiguiente(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().split('T')[0]
}

export function CambiarTasaForm({
  instrumento,
  tasaActual,
  onClose,
}: {
  instrumento: Instrumento
  tasaActual: number
  onClose: () => void
}) {
  const [tasaPct, setTasaPct] = useState(tasaActual * 100)
  const [fechaDesde, setFechaDesde] = useState(primerDiaMesSiguiente())

  const tasaDecimal = tasaPct / 100
  const interesEstimado = Number(instrumento.capital_inicial) * tasaDecimal
  const variacion = tasaActual > 0 ? ((tasaDecimal - tasaActual) / tasaActual) * 100 : 0

  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('instrumento_id', instrumento.id)
      fd.set('tasa_mensual', String(tasaDecimal))
      fd.set('fecha_desde', fechaDesde)
      const r = await agregarTramoTasa(prev, fd)
      if (!r) onClose()
      return r
    },
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="bg-[#f5f0e6]/60 rounded-lg px-4 py-3 text-sm">
        <p className="text-slate-700 font-medium mb-1">Cambio de tasa</p>
        <p className="text-xs text-slate-500">
          Instrumento: {instrumento.codigo ?? instrumento.id.substring(0, 8)} ·
          Tasa vigente: <span className="font-mono text-slate-700">{(tasaActual * 100).toFixed(4)}%</span>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-600">Nueva tasa mensual</label>
          <div className="relative">
            <input
              type="number"
              step="0.0001"
              min="0"
              value={tasaPct || ''}
              onChange={(e) => setTasaPct(Number(e.target.value))}
              required
              className="w-full px-3 py-2 pr-7 bg-slate-700 border border-[#c8c0b0] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-600">Fecha desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            required
            min={instrumento.fecha_inicio}
            className="w-full px-3 py-2 bg-slate-700 border border-[#c8c0b0] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
          />
          <p className="text-[10px] text-slate-500">Aplica desde esta fecha en adelante</p>
        </div>
      </div>

      {tasaPct > 0 && Number(instrumento.capital_inicial) > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-center justify-between">
          <span className="text-xs text-slate-600 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Sobre capital actual ({formatMoneda(Number(instrumento.capital_inicial), instrumento.moneda)})
          </span>
          <div className="text-right">
            <p className="font-mono text-sm text-amber-400 font-semibold">
              {formatMoneda(interesEstimado, instrumento.moneda)} <span className="text-xs text-slate-500">/ mes</span>
            </p>
            {variacion !== 0 && (
              <p className={`text-[10px] font-mono ${variacion > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {variacion > 0 ? '+' : ''}{variacion.toFixed(2)}% vs. tasa actual
              </p>
            )}
          </div>
        </div>
      )}

      <Textarea
        label="Notas (opcional)"
        name="notas"
        placeholder="Ej: Renegociación trimestral, cambio acordado por inflación, etc."
        rows={2}
      />

      <div className="bg-[#f5f0e6]/40 border border-[#d6d0c4]/40 rounded-lg p-3 text-xs text-slate-600 flex items-start gap-2">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
        <div>
          Al guardar, se recalcularán los <strong className="text-slate-800">períodos abiertos</strong> aplicando esta tasa desde la fecha indicada.
          Los períodos ya cerrados <strong className="text-slate-800">no se modifican</strong>.
        </div>
      </div>

      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Aplicar cambio de tasa
        </Button>
      </div>
    </form>
  )
}
