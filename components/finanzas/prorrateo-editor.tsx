'use client'

import { useState } from 'react'
import type { ProrrateoMarcas, ProrrateoDefault } from '@/types/database'
import { cn } from '@/lib/utils'

const MARCAS: (keyof ProrrateoMarcas)[] = ['BDI', 'ZATTIA', 'STUNNED']

const COLORES: Record<string, string> = {
  BDI: 'text-purple-700',
  ZATTIA: 'text-pink-700',
  STUNNED: 'text-amber-700',
  GENERAL: 'text-fg-muted',
}

interface Props {
  value: ProrrateoMarcas
  onChange: (v: ProrrateoMarcas) => void
  defaults?: ProrrateoDefault[]
}

export function ProrrateoEditor({ value, onChange, defaults }: Props) {
  const total = MARCAS.reduce((s, m) => s + (value[m] ?? 0), 0)
  const valido = Math.abs(total - 100) < 0.5

  function setMarca(marca: keyof ProrrateoMarcas, pct: number) {
    onChange({ ...value, [marca]: pct })
  }

  function distribuirEqui() {
    const equi = Math.round((100 / MARCAS.length) * 100) / 100
    const obj = MARCAS.reduce<ProrrateoMarcas>((acc, m, i) => {
      acc[m] = i === MARCAS.length - 1 ? Math.round((100 - equi * (MARCAS.length - 1)) * 100) / 100 : equi
      return acc
    }, {})
    onChange(obj)
  }

  function aplicarDefault(d: ProrrateoDefault) {
    onChange(d.porcentajes)
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {MARCAS.map((m) => (
          <div key={m} className="space-y-1">
            <label className={cn('block text-xs font-medium', COLORES[m])}>{m}</label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={value[m] ?? 0}
                onChange={(e) => setMarca(m, Number(e.target.value))}
                className="w-full px-2 py-1.5 bg-surface-2 border border-[#c8c0b0] rounded text-fg font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary pr-6"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-fg-soft">%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={distribuirEqui}
            className="text-xs px-2 py-1 rounded bg-surface-2 hover:bg-slate-600 text-fg-muted"
          >
            Equitativo
          </button>
          {defaults?.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => aplicarDefault(d)}
              className="text-xs px-2 py-1 rounded bg-surface-2 hover:bg-slate-600 text-fg-muted"
            >
              {d.nombre}
            </button>
          ))}
        </div>
        <span className={cn(
          'text-xs font-mono font-medium',
          valido ? 'text-green-700' : 'text-red-700'
        )}>
          Total: {total.toFixed(2)}% {valido ? '✓' : '⚠ debe sumar 100%'}
        </span>
      </div>
    </div>
  )
}
