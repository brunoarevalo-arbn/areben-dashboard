'use client'

import { useActionState, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { upsertDatosGN } from '@/app/actions/compras'
import type { DatosVentasGN, Marca } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { MarcaBadge } from '@/components/ui/badge'
import { formatCurrency, formatMonth, getMonthOptions } from '@/lib/utils'
import { Plus, RefreshCw, TrendingUp, Loader2 } from 'lucide-react'

const MARCAS: Marca[] = ['BDI', 'ZATTIA', 'STUNNED']

function VentaForm({ mes, onClose }: { mes: string; onClose: () => void }) {
  const [error, action, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const res = await upsertDatosGN(prev, fd)
      if (!res) onClose()
      return res
    },
    null
  )

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Select
          label="Mes"
          name="mes"
          defaultValue={mes}
          options={getMonthOptions()}
        />
        <Select
          label="Marca"
          name="marca"
          defaultValue="BDI"
          options={MARCAS.map((m) => ({ value: m, label: m }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Input label="Ventas brutas" name="ventas_brutas" type="number" step="0.01" defaultValue="0" />
        <Input label="Devoluciones" name="devoluciones" type="number" step="0.01" defaultValue="0" />
        <Input label="Ventas netas" name="ventas_netas" type="number" step="0.01" defaultValue="0" />
        <Input label="CMV" name="cmv" type="number" step="0.01" defaultValue="0" />
        <Input label="Cantidad vendida" name="cantidad_vendida" type="number" defaultValue="0" />
        <Input label="Comisiones" name="comisiones" type="number" step="0.01" defaultValue="0" />
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Guardar datos
        </Button>
      </div>
    </form>
  )
}

export function VentasClient({ ventas, mes }: { ventas: DatosVentasGN[]; mes: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Panel de Ventas</h1>
          <p className="text-sm text-slate-600 mt-0.5">Datos de Gestión Nube — {formatMonth(mes)}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={searchParams.get('mes') ?? mes}
            onChange={(e) => router.push(`?mes=${e.target.value}`)}
            className="bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            {getMonthOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Cargar ventas
          </Button>
        </div>
      </div>

      <div className="bg-white border border-[#e8e4dc] rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e8e4dc]">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Marca</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Ventas brutas</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Dev.</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Ventas netas</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">CMV</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Margen</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Margen %</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Unidades</th>
            </tr>
          </thead>
          <tbody>
            {MARCAS.map((marca) => {
              const v = ventas.find((x) => x.marca === marca)
              return (
                <tr key={marca} className="border-b border-[#e8e4dc]/60 hover:bg-[#f5f0e6]/30">
                  <td className="px-4 py-3"><MarcaBadge marca={marca} /></td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">{v ? formatCurrency(v.ventas_brutas) : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-700">{v ? formatCurrency(v.devoluciones) : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900">{v ? formatCurrency(v.ventas_netas) : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-700">{v ? formatCurrency(v.cmv) : '—'}</td>
                  <td className={`px-4 py-3 text-right font-mono font-medium ${v ? (v.margen_pesos >= 0 ? 'text-green-700' : 'text-red-700') : 'text-slate-500'}`}>
                    {v ? formatCurrency(v.margen_pesos) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {v ? `${Number(v.margen_porcentaje).toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{v ? v.cantidad_vendida : '—'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#d6d0c4] bg-[#f5f0e6]/50">
              <td className="px-4 py-3 font-semibold text-slate-800">TOTAL</td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">{formatCurrency(ventas.reduce((s, v) => s + v.ventas_brutas, 0))}</td>
              <td className="px-4 py-3 text-right font-mono text-red-700">{formatCurrency(ventas.reduce((s, v) => s + v.devoluciones, 0))}</td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">{formatCurrency(ventas.reduce((s, v) => s + v.ventas_netas, 0))}</td>
              <td className="px-4 py-3 text-right font-mono text-red-700">{formatCurrency(ventas.reduce((s, v) => s + v.cmv, 0))}</td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">{formatCurrency(ventas.reduce((s, v) => s + v.margen_pesos, 0))}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <Modal open={modalOpen} onOpenChange={setModalOpen} title="Cargar datos de ventas" description="Ingresá los datos de Gestión Nube manualmente">
        <VentaForm mes={mes} onClose={() => setModalOpen(false)} />
      </Modal>
    </div>
  )
}
