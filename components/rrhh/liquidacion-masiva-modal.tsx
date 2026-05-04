'use client'

import { useState, useTransition } from 'react'
import { liquidacionMasiva } from '@/app/actions/rrhh'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, cn } from '@/lib/utils'
import { Loader2, ListChecks } from 'lucide-react'
import type { EmpleadoBasico } from './nomina-client'

export function LiquidacionMasivaModal({
  empleados,
  mes,
  nominasExistentes,
  onClose,
}: {
  empleados: EmpleadoBasico[]
  mes: string
  nominasExistentes: string[]
  onClose: () => void
}) {
  const disponibles = empleados.filter((e) => !nominasExistentes.includes(e.id))
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set(disponibles.map((e) => e.id)))
  const [fechaPago, setFechaPago] = useState(() => {
    const [y, m] = mes.split('-').map(Number)
    const fin = new Date(y, m, 0)
    return fin.toISOString().split('T')[0]
  })
  const [isPending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<{ ok: number; errors: string[] } | null>(null)

  function toggle(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (seleccionados.size === disponibles.length) setSeleccionados(new Set())
    else setSeleccionados(new Set(disponibles.map((e) => e.id)))
  }

  function ejecutar() {
    if (seleccionados.size === 0) {
      alert('Seleccioná al menos un empleado')
      return
    }
    startTransition(async () => {
      try {
        const r = await liquidacionMasiva({
          empleadoIds: Array.from(seleccionados),
          mes,
          fechaProgramadaPago: fechaPago,
        })
        setResultado(r)
        if (r.errors.length === 0) onClose()
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  if (disponibles.length === 0) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-slate-300">Todos los empleados activos ya tienen nómina del mes {mes}.</p>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    )
  }

  if (resultado) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-green-400 font-semibold">{resultado.ok} nómina(s) generada(s).</p>
        {resultado.errors.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 max-h-40 overflow-y-auto">
            <p className="text-red-400 text-xs font-medium mb-1">{resultado.errors.length} aviso(s):</p>
            <ul className="text-xs text-red-300 space-y-0.5">
              {resultado.errors.map((e, i) => <li key={i}>· {e}</li>)}
            </ul>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-3 text-xs text-slate-300 space-y-1">
        <p>
          Se generarán nóminas usando los <strong>valores por defecto de cada empleado</strong>:
          básico, valor hora, comida y aportes. Sin extras ni adicionales.
        </p>
        <p className="text-slate-400">Los empleados con nómina ya cargada del mes están excluidos.</p>
      </div>

      <Input
        label="Fecha programada de pago"
        type="date"
        value={fechaPago}
        onChange={(e) => setFechaPago(e.target.value)}
        required
      />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Seleccionar empleados ({seleccionados.size}/{disponibles.length})
          </p>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            {seleccionados.size === disponibles.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
          </button>
        </div>

        <div className="border border-slate-700 rounded-lg max-h-72 overflow-y-auto divide-y divide-slate-800">
          {disponibles.map((e) => {
            const checked = seleccionados.has(e.id)
            const netoEstimado = (e.sueldo_basico ?? 0) + (e.monto_comidas ?? 0)
            return (
              <label
                key={e.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-800/50',
                  checked && 'bg-indigo-500/10',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(e.id)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-indigo-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-100 truncate">{e.apellido}, {e.nombre}</p>
                  <p className="text-xs text-slate-500">{e.tipo_empleado} · básico {formatCurrency(e.sueldo_basico)}</p>
                </div>
                <span className="text-xs font-mono text-slate-400">≈ {formatCurrency(netoEstimado)}</span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button
          type="button"
          variant="success"
          onClick={ejecutar}
          disabled={isPending || seleccionados.size === 0}
          title={`Generar ${seleccionados.size} nómina(s) con valores por defecto`}
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
          Generar {seleccionados.size} nómina(s)
        </Button>
      </div>
    </div>
  )
}
