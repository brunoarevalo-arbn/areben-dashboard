'use client'

import { useMesActivo } from './mes-activo-provider'
import { formatMonth, getMonthOptions } from '@/lib/utils'
import { Calendar } from 'lucide-react'

export function MesActivoSelector() {
  const { mes, setMes, ready } = useMesActivo()
  const options = getMonthOptions(24)

  return (
    <label
      className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary cursor-pointer hover:bg-primary/15 transition-colors"
      title="Mes en el que estás trabajando — se guarda y se mantiene entre pantallas"
    >
      <Calendar className="w-4 h-4 shrink-0" />
      <span className="text-xs font-semibold uppercase tracking-wide hidden md:inline">Trabajando:</span>
      <select
        value={mes}
        onChange={(e) => setMes(e.target.value)}
        disabled={!ready}
        className="bg-transparent text-sm font-semibold focus:outline-none cursor-pointer pr-1"
      >
        {/* Si el mes activo no está en las opciones (ej. más de 24 meses atrás), lo agregamos manualmente */}
        {!options.find((o) => o.value === mes) && (
          <option value={mes}>{formatMonth(mes)}</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}
