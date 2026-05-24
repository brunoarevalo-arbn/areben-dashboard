'use client'

import { useState, useTransition } from 'react'
import { updateProrrateoConfig } from '@/app/actions/finanzas'
import type { ConfiguracionProrrateo } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Loader2, Layers, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const COLORES: Record<string, string> = {
  BDI: 'text-purple-400 border-purple-500/30 bg-purple-500/5',
  ZATTIA: 'text-pink-400 border-pink-500/30 bg-pink-500/5',
  STUNNED: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
}

export function ProrrateoSettingsClient({ configs }: { configs: ConfiguracionProrrateo[] }) {
  const [valores, setValores] = useState<Record<string, number>>(
    Object.fromEntries(configs.map((c) => [c.marca, c.porcentaje]))
  )
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const total = Object.values(valores).reduce((s, v) => s + v, 0)
  const valido = Math.abs(total - 100) < 0.5

  function update(marca: string, val: number) {
    setSuccess(false)
    setError(null)
    setValores((v) => ({ ...v, [marca]: val }))
  }

  function distribuirEqui() {
    const marcas = configs.map((c) => c.marca)
    const equi = Math.round((100 / marcas.length) * 100) / 100
    const obj: Record<string, number> = {}
    marcas.forEach((m, i) => {
      obj[m] = i === marcas.length - 1
        ? Math.round((100 - equi * (marcas.length - 1)) * 100) / 100
        : equi
    })
    setValores(obj)
  }

  function guardar() {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      try {
        await updateProrrateoConfig(
          Object.entries(valores).map(([marca, porcentaje]) => ({ marca, porcentaje }))
        )
        setSuccess(true)
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configuración de Prorrateo</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Porcentajes por defecto entre marcas — se precargan al marcar un gasto como "Compartido"
        </p>
      </div>

      <div className="bg-white border border-[#e8e4dc] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-700 text-sm font-medium">
          <Layers className="w-4 h-4" />
          Distribución por marca
        </div>

        <div className="space-y-3">
          {configs.map((c) => (
            <div key={c.id} className={cn(
              'flex items-center justify-between gap-4 px-4 py-3 rounded-lg border',
              COLORES[c.marca] ?? 'text-slate-600 border-[#d6d0c4] bg-[#f5f0e6]/40'
            )}>
              <span className="font-medium text-base">{c.marca}</span>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={valores[c.marca] ?? 0}
                    onChange={(e) => update(c.marca, Number(e.target.value))}
                    className="w-28 px-3 py-1.5 pr-8 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 font-mono text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={cn(
          'flex items-center justify-between px-4 py-2.5 rounded-lg border',
          valido ? 'border-green-500/30 bg-green-500/5 text-green-400' : 'border-red-500/30 bg-red-500/5 text-red-400'
        )}>
          <span className="text-sm font-medium">Total</span>
          <span className="font-mono font-bold text-base">
            {total.toFixed(2)}% {valido ? '✓' : '⚠ debe sumar 100%'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={distribuirEqui}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-700"
            title="Distribuir equitativamente"
          >
            Distribución equitativa
          </button>
          <Button onClick={guardar} disabled={isPending || !valido} title="Guardar configuración">
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </Button>
        </div>

        {success && (
          <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-4 h-4" />
            Configuración actualizada
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>

      <div className="bg-white/40 border border-[#e8e4dc] rounded-xl p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-700 mb-2">¿Cómo funciona?</p>
        <ul className="space-y-1 list-disc list-inside text-slate-500">
          <li>Estos porcentajes se aplican como default cuando marcás un gasto como "Compartido entre marcas".</li>
          <li>Podés sobrescribir el reparto en cada gasto puntual sin perder esta configuración.</li>
          <li>Si una marca cambia su participación, modificás un solo lugar y se aplica a todos los gastos compartidos nuevos.</li>
        </ul>
      </div>
    </div>
  )
}
