'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { guardarVencimientosMasivo, type VencGrupo, type VencTipo } from '@/app/actions/vencimientos'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { formatCurrency, formatMonth, getMonthOptions } from '@/lib/utils'
import { CalendarClock, Loader2, Users, Receipt, CreditCard, TrendingDown, FileCheck, Save, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const GRUPO_ICON: Record<VencTipo, React.ElementType> = {
  sueldo: Users,
  carga: Users,
  tarjeta: CreditCard,
  impositivo: Receipt,
  prestamo: TrendingDown,
  plan_afip: FileCheck,
}

export function VencimientosClient({ mes, grupos }: { mes: string; grupos: VencGrupo[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [guardado, setGuardado] = useState(false)

  // Estado editable: id → fecha. Arranca con las fechas actuales.
  const fechasIniciales = useMemo(() => {
    const m: Record<string, string> = {}
    for (const g of grupos) for (const r of g.rows) m[r.id] = r.fecha ?? ''
    return m
  }, [grupos])
  const [fechas, setFechas] = useState<Record<string, string>>(fechasIniciales)

  // Índice id → tipo (para saber a qué tabla escribir)
  const tipoPorId = useMemo(() => {
    const m: Record<string, VencTipo> = {}
    for (const g of grupos) for (const r of g.rows) m[r.id] = r.tipo
    return m
  }, [grupos])

  const cambios = useMemo(
    () => Object.keys(fechas).filter((id) => (fechas[id] ?? '') !== (fechasIniciales[id] ?? '')),
    [fechas, fechasIniciales],
  )

  function setMes(nuevo: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', nuevo)
    router.push(`?${params.toString()}`)
  }

  function guardar() {
    if (cambios.length === 0) return
    const payload = cambios.map((id) => ({ tipo: tipoPorId[id], id, fecha: fechas[id] || null }))
    startTransition(async () => {
      await guardarVencimientosMasivo(payload)
      setGuardado(true)
      router.refresh()
      setTimeout(() => setGuardado(false), 2500)
    })
  }

  const totalItems = grupos.reduce((s, g) => s + g.rows.length, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-primary" />
            Vencimientos del mes
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">
            Cargá o ajustá de una las fechas de pago del mes (sueldos, cargas, tarjetas, impositivos, cuotas). Se escriben en cada módulo.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={mes} onChange={(e) => setMes(e.target.value)} options={getMonthOptions()} className="w-44" />
          <Button onClick={guardar} disabled={isPending || cambios.length === 0} title={cambios.length === 0 ? 'No hay cambios' : `Guardar ${cambios.length} cambio(s)`}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : guardado ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {guardado ? 'Guardado' : cambios.length > 0 ? `Guardar (${cambios.length})` : 'Guardar todo'}
          </Button>
        </div>
      </div>

      {totalItems === 0 ? (
        <div className="bg-surface border border-border rounded-xl px-4 py-12 text-center text-fg-soft">
          <CalendarClock className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Sin conceptos con vencimiento en {formatMonth(mes)}.
          <p className="text-xs mt-1">Los sueldos aparecen al liquidar la nómina; las cuotas de tarjeta, al registrarse.</p>
        </div>
      ) : (
        grupos.map((g) => {
          const Icon = GRUPO_ICON[g.key]
          const subtotal = g.rows.reduce((s, r) => s + (r.moneda === 'USD' ? 0 : r.monto), 0)
          return (
            <div key={g.key} className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-fg-muted flex items-center gap-2">
                  <Icon className="w-4 h-4 text-fg-soft" />
                  {g.label}
                  <span className="text-xs text-fg-soft font-normal">({g.rows.length})</span>
                </h2>
                <span className="font-mono text-xs text-fg-muted">{formatCurrency(subtotal)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {g.rows.map((r) => {
                      const cambiado = (fechas[r.id] ?? '') !== (fechasIniciales[r.id] ?? '')
                      return (
                        <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2/30">
                          <td className="px-4 py-2 min-w-[200px]">
                            <p className="text-fg font-medium truncate">{r.concepto}</p>
                            <p className="text-xs text-fg-soft truncate">{r.detalle}</p>
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-fg-muted whitespace-nowrap">{formatCurrency(r.monto, r.moneda as 'ARS' | 'USD')}</td>
                          <td className="px-4 py-2 text-right w-[170px]">
                            <input
                              type="date"
                              value={fechas[r.id] ?? ''}
                              onChange={(e) => setFechas((f) => ({ ...f, [r.id]: e.target.value }))}
                              className={cn(
                                'bg-surface-2 border rounded-lg px-2 py-1 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary',
                                cambiado ? 'border-primary' : 'border-border-strong',
                                !fechas[r.id] && 'text-fg-soft',
                              )}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
