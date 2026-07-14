'use client'

import { useState, useTransition } from 'react'
import { liquidacionMasiva } from '@/app/actions/rrhh'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, cn } from '@/lib/utils'
import { Loader2, ListChecks } from 'lucide-react'
import type { EmpleadoBasico } from './nomina-client'

interface Concepto { he: number; pct: number; bono: number; desc: number }
const CONCEPTO_DEFAULT: Concepto = { he: 0, pct: 50, bono: 0, desc: 0 }

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
  const [conceptos, setConceptos] = useState<Record<string, Concepto>>({})
  const [fechaPago, setFechaPago] = useState(() => {
    const [y, m] = mes.split('-').map(Number)
    const fin = new Date(y, m, 0)
    return fin.toISOString().split('T')[0]
  })
  const [isPending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<{ ok: number; errors: string[] } | null>(null)

  const conceptoDe = (id: string): Concepto => conceptos[id] ?? CONCEPTO_DEFAULT
  function setConcepto(id: string, field: keyof Concepto, value: number) {
    setConceptos((prev) => ({ ...prev, [id]: { ...conceptoDe(id), [field]: value } }))
  }

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

  // Neto estimado = básico + comida + horas extras + bono − descuento (= neto real, sin aportes).
  function netoEstimado(e: EmpleadoBasico): number {
    const c = conceptoDe(e.id)
    const heMonto = c.he * (e.valor_hora ?? 0) * (1 + c.pct / 100)
    return (e.sueldo_basico ?? 0) + (e.monto_comidas ?? 0) + heMonto + c.bono - c.desc
  }

  function ejecutar() {
    if (seleccionados.size === 0) { alert('Seleccioná al menos un empleado'); return }
    const payload: Record<string, { horasExtras: number; porcentajeExtras: number; bonoMonto: number; descuentoOtroMonto: number; descuentoOtroConcepto?: string }> = {}
    for (const id of seleccionados) {
      const c = conceptoDe(id)
      payload[id] = {
        horasExtras: c.he || 0,
        porcentajeExtras: c.pct || 50,
        bonoMonto: c.bono || 0,
        descuentoOtroMonto: c.desc || 0,
        descuentoOtroConcepto: c.desc > 0 ? 'OTRO' : undefined,
      }
    }
    startTransition(async () => {
      try {
        const r = await liquidacionMasiva({
          empleadoIds: Array.from(seleccionados),
          mes,
          fechaProgramadaPago: fechaPago,
          conceptos: payload,
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
        <p className="text-fg-muted">Todos los empleados activos ya tienen nómina del mes {mes}.</p>
        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Cerrar</Button></div>
      </div>
    )
  }

  if (resultado) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-green-700 font-semibold">{resultado.ok} nómina(s) generada(s).</p>
        {resultado.errors.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 max-h-40 overflow-y-auto">
            <p className="text-red-700 text-xs font-medium mb-1">{resultado.errors.length} aviso(s):</p>
            <ul className="text-xs text-danger space-y-0.5">
              {resultado.errors.map((e, i) => <li key={i}>· {e}</li>)}
            </ul>
          </div>
        )}
        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Cerrar</Button></div>
      </div>
    )
  }

  const inputCls = 'w-16 px-1.5 py-1 bg-surface-2 border border-border-strong rounded text-fg text-xs font-mono text-right focus:outline-none focus:ring-1 focus:ring-primary'

  return (
    <div className="space-y-4">
      <div className="bg-surface-2/40 border border-border-strong/40 rounded-lg p-3 text-xs text-fg-muted space-y-1">
        <p>Cargá horas extras, bono o descuento por empleado (el resto sale de la ficha). Usa el mismo cálculo que la liquidación individual.</p>
        <p>Los empleados con nómina ya cargada del mes están excluidos.</p>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <Input label="Fecha programada de pago" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} required />
        <button type="button" onClick={toggleAll} className="text-xs text-primary hover:text-orange-600 pb-2">
          {seleccionados.size === disponibles.length ? 'Deseleccionar todos' : 'Seleccionar todos'} ({seleccionados.size}/{disponibles.length})
        </button>
      </div>

      <div className="border border-border-strong rounded-lg max-h-[26rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="border-b border-border-strong">
              <th className="px-2 py-2 w-8" />
              <th className="text-left px-3 py-2 text-[10px] font-medium text-fg-muted uppercase">Empleado</th>
              <th className="text-right px-2 py-2 text-[10px] font-medium text-fg-muted uppercase">HE (hs)</th>
              <th className="text-right px-2 py-2 text-[10px] font-medium text-fg-muted uppercase">HE %</th>
              <th className="text-right px-2 py-2 text-[10px] font-medium text-fg-muted uppercase">Bono $</th>
              <th className="text-right px-2 py-2 text-[10px] font-medium text-fg-muted uppercase">Desc. $</th>
              <th className="text-right px-3 py-2 text-[10px] font-medium text-fg-muted uppercase">Neto est.</th>
            </tr>
          </thead>
          <tbody>
            {disponibles.map((e) => {
              const checked = seleccionados.has(e.id)
              const c = conceptoDe(e.id)
              return (
                <tr key={e.id} className={cn('border-b border-border/60', checked ? 'bg-orange-500/5' : 'opacity-50')}>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={checked} onChange={() => toggle(e.id)}
                      className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2 text-orange-600" />
                  </td>
                  <td className="px-3 py-1.5">
                    <p className="text-sm text-fg truncate">{e.apellido}, {e.nombre}</p>
                    <p className="text-[10px] text-fg-soft">{e.tipo_empleado} · básico {formatCurrency(e.sueldo_basico)}</p>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input type="number" min="0" step="0.5" disabled={!checked} value={c.he || ''} placeholder="0"
                      onChange={(ev) => setConcepto(e.id, 'he', Number(ev.target.value))} className={inputCls} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input type="number" min="0" max="200" step="10" disabled={!checked} value={c.pct}
                      onChange={(ev) => setConcepto(e.id, 'pct', Number(ev.target.value))} className={inputCls} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input type="number" min="0" step="1000" disabled={!checked} value={c.bono || ''} placeholder="0"
                      onChange={(ev) => setConcepto(e.id, 'bono', Number(ev.target.value))} className={inputCls} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input type="number" min="0" step="1000" disabled={!checked} value={c.desc || ''} placeholder="0"
                      onChange={(ev) => setConcepto(e.id, 'desc', Number(ev.target.value))} className={inputCls} />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-green-700 font-medium">
                    {checked ? formatCurrency(netoEstimado(e)) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" variant="success" onClick={ejecutar} disabled={isPending || seleccionados.size === 0}
          title={`Liquidar ${seleccionados.size} nómina(s)`}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
          Liquidar {seleccionados.size} nómina(s)
        </Button>
      </div>
    </div>
  )
}
