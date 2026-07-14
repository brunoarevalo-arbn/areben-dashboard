'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SortDir = 'asc' | 'desc'

// Hook de orden reutilizable para tablas. Uso:
//   const { sortKey, sortDir, toggleSort, sortRows } = useSort<'fecha'|'monto'>('fecha', 'desc')
//   const rows = sortRows(filtradas, (r, k) => k === 'monto' ? Number(r.monto) : r.fecha)
export function useSort<K extends string>(defaultKey: K, defaultDir: SortDir = 'asc') {
  const [sortKey, setSortKey] = useState<K>(defaultKey)
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir)

  function toggleSort(k: K, numeric = false) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(numeric ? 'desc' : 'asc') }
  }

  function sortRows<T>(rows: T[], getVal: (row: T, key: K) => string | number): T[] {
    return [...rows].sort((a, b) => {
      const av = getVal(a, sortKey)
      const bv = getVal(b, sortKey)
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }

  return { sortKey, sortDir, toggleSort, sortRows }
}

// Header ordenable con afordancia: flecha sólida en la columna activa, ⇅ tenue en las demás
// (así se entiende que TODAS son clickeables).
export function SortTh<K extends string>({
  col, label, align = 'left', numeric, sortKey, sortDir, onToggle, className,
}: {
  col: K
  label: React.ReactNode
  align?: 'left' | 'right'
  numeric?: boolean
  sortKey: K
  sortDir: SortDir
  onToggle: (k: K, numeric?: boolean) => void
  className?: string
}) {
  const active = sortKey === col
  return (
    <th
      onClick={() => onToggle(col, numeric)}
      className={cn(
        'px-4 py-3 text-xs font-medium uppercase cursor-pointer select-none hover:text-fg transition-colors',
        active ? 'text-fg' : 'text-fg-muted',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        {label}
        {active
          ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-30" />}
      </span>
    </th>
  )
}
