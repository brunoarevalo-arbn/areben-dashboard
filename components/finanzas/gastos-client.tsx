'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createGasto, updateGasto, deleteGasto, marcarGastoPagado } from '@/app/actions/finanzas'
import type { Gasto } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { EstadoBadge, MarcaBadge } from '@/components/ui/badge'
import { formatCurrency, formatDate, getMonthOptions } from '@/lib/utils'
import { Plus, Pencil, Trash2, CheckCircle, Filter, TrendingDown, Loader2 } from 'lucide-react'

const CATEGORIAS_COMUNES = [
  'Alquiler', 'Servicios', 'Sueldos', 'Marketing', 'Logística',
  'Impuestos', 'Seguros', 'Mantenimiento', 'Tecnología', 'Otros',
]

const MARCAS = ['BDI', 'ZATTIA', 'STUNNED', 'GENERAL']
const ESTADOS = ['PENDIENTE', 'PAGADO', 'VENCIDO']

interface GastosClientProps {
  gastos: Gasto[]
  mes: string
  categorias: string[]
  filtros: { negocio?: string; estado?: string }
}

function GastoForm({
  gasto,
  mes,
  categorias,
  onClose,
}: {
  gasto?: Gasto
  mes: string
  categorias: string[]
  onClose: () => void
}) {
  const action = gasto
    ? updateGasto.bind(null, gasto.id)
    : createGasto

  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const result = await action(prev, fd)
      if (!result) onClose()
      return result
    },
    null
  )

  const todasCategorias = [...new Set([...CATEGORIAS_COMUNES, ...categorias])].sort()

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Categoría"
          name="categoria"
          defaultValue={gasto?.categoria ?? ''}
          options={todasCategorias.map((c) => ({ value: c, label: c }))}
          placeholder="Seleccionar..."
          required
        />
        <Select
          label="Negocio"
          name="negocio"
          defaultValue={gasto?.negocio ?? 'GENERAL'}
          options={MARCAS.map((m) => ({ value: m, label: m }))}
        />
      </div>

      <Input
        label="Concepto"
        name="concepto"
        defaultValue={gasto?.concepto}
        placeholder="Descripción del gasto"
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Monto (ARS)"
          name="monto"
          type="number"
          step="0.01"
          min="0"
          defaultValue={gasto?.monto}
          placeholder="0.00"
          required
        />
        <Select
          label="Mes"
          name="mes"
          defaultValue={gasto?.mes ?? mes}
          options={getMonthOptions()}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Estado"
          name="estado"
          defaultValue={gasto?.estado ?? 'PENDIENTE'}
          options={ESTADOS.map((e) => ({ value: e, label: e.charAt(0) + e.slice(1).toLowerCase() }))}
        />
        <Input
          label="Fecha de pago"
          name="fecha_pago"
          type="date"
          defaultValue={gasto?.fecha_pago ?? ''}
        />
      </div>

      <Textarea
        label="Notas (opcional)"
        name="notas"
        defaultValue={gasto?.notas ?? ''}
        placeholder="Información adicional..."
      />

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {gasto ? 'Guardar cambios' : 'Crear gasto'}
        </Button>
      </div>
    </form>
  )
}

export function GastosClient({ gastos, mes, categorias, filtros }: GastosClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [editGasto, setEditGasto] = useState<Gasto | undefined>()
  const [isPending, startTransition] = useTransition()

  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0)
  const totalPagado = gastos.filter((g) => g.estado === 'PAGADO').reduce((s, g) => s + g.monto, 0)
  const totalPendiente = gastos.filter((g) => g.estado === 'PENDIENTE').reduce((s, g) => s + g.monto, 0)

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`?${params.toString()}`)
  }

  function openCreate() {
    setEditGasto(undefined)
    setModalOpen(true)
  }

  function openEdit(g: Gasto) {
    setEditGasto(g)
    setModalOpen(true)
  }

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar este gasto?')) return
    startTransition(() => deleteGasto(id))
  }

  function handlePagar(id: string) {
    startTransition(() => marcarGastoPagado(id))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Gastos</h1>
          <p className="text-sm text-slate-400 mt-0.5">{gastos.length} registros</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Nuevo gasto
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total mes', value: totalGastos, color: 'text-slate-100' },
          { label: 'Pagado', value: totalPagado, color: 'text-green-400' },
          { label: 'Pendiente', value: totalPendiente, color: 'text-amber-400' },
        ].map((item) => (
          <div key={item.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{formatCurrency(item.value)}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl">
        <div className="p-4 border-b border-slate-800 flex flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            Filtros:
          </div>
          <select
            value={searchParams.get('mes') ?? mes}
            onChange={(e) => setFilter('mes', e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {getMonthOptions().map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={filtros.negocio ?? ''}
            onChange={(e) => setFilter('negocio', e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Todos los negocios</option>
            {MARCAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={filtros.estado ?? ''}
            onChange={(e) => setFilter('estado', e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{e.charAt(0) + e.slice(1).toLowerCase()}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Concepto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Categoría</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Negocio</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Monto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Fecha pago</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {gastos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No hay gastos para este período
                  </td>
                </tr>
              ) : (
                gastos.map((g) => (
                  <tr key={g.id} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-slate-100 font-medium">{g.concepto}</p>
                      {g.notas && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{g.notas}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{g.categoria}</td>
                    <td className="px-4 py-3"><MarcaBadge marca={g.negocio} /></td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-100">{formatCurrency(g.monto)}</td>
                    <td className="px-4 py-3"><EstadoBadge estado={g.estado} /></td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{g.fecha_pago ? formatDate(g.fecha_pago) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {g.estado !== 'PAGADO' && (
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => handlePagar(g.id)}
                            disabled={isPending}
                            title="Marcar como pagado"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openEdit(g)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(g.id)} disabled={isPending}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editGasto ? 'Editar gasto' : 'Nuevo gasto'}
      >
        <GastoForm
          gasto={editGasto}
          mes={mes}
          categorias={categorias}
          onClose={() => setModalOpen(false)}
        />
      </Modal>
    </div>
  )
}
