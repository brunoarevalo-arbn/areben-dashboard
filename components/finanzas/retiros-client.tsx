'use client'

import { useActionState, useState, useTransition } from 'react'
import { createRetiro, deleteRetiro } from '@/app/actions/finanzas'
import type { RetiroSocio } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Trash2, CreditCard, Loader2 } from 'lucide-react'

const SOCIOS_PREDEFINIDOS = ['Socio 1', 'Socio 2']

export function RetirosClient({ retiros, socios }: { retiros: RetiroSocio[]; socios: string[] }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const todosLosSocios = [...new Set([...SOCIOS_PREDEFINIDOS, ...socios])]

  const totalesPorSocio = todosLosSocios.reduce<Record<string, { pesos: number; usd: number }>>((acc, s) => {
    const retirosDelSocio = retiros.filter((r) => r.socio === s)
    acc[s] = {
      pesos: retirosDelSocio.reduce((sum, r) => sum + r.monto_pesos, 0),
      usd: retirosDelSocio.reduce((sum, r) => sum + r.monto_usd, 0),
    }
    return acc
  }, {})

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar este retiro?')) return
    startTransition(() => deleteRetiro(id))
  }

  const [error, action, isFormPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const result = await createRetiro(prev, fd)
      if (!result) setModalOpen(false)
      return result
    },
    null
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Retiros de Socios</h1>
          <p className="text-sm text-slate-400 mt-0.5">{retiros.length} registros</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" />
          Registrar retiro
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {todosLosSocios.map((socio) => (
          <div key={socio} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-sm font-medium text-slate-300 mb-3">{socio}</p>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-xs text-slate-400">Total retirado (ARS)</span>
                <span className="text-sm font-mono font-medium text-slate-100">
                  {formatCurrency(totalesPorSocio[socio]?.pesos ?? 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-400">Total retirado (USD)</span>
                <span className="text-sm font-mono font-medium text-slate-100">
                  {formatCurrency(totalesPorSocio[socio]?.usd ?? 0, 'USD')}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Socio</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Fecha</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">ARS</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">USD</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">TC</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {retiros.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No hay retiros registrados
                </td>
              </tr>
            ) : (
              retiros.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-slate-100 font-medium">{r.socio}</td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(r.fecha)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-100">{formatCurrency(r.monto_pesos)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-100">{formatCurrency(r.monto_usd, 'USD')}</td>
                  <td className="px-4 py-3 text-right text-slate-400 text-xs">{r.tipo_cambio.toFixed(0)}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="danger" onClick={() => handleDelete(r.id)} disabled={isPending}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onOpenChange={setModalOpen} title="Registrar retiro">
        <form action={action} className="space-y-4">
          <Input
            label="Socio"
            name="socio"
            list="socios-list"
            placeholder="Nombre del socio"
            required
          />
          <datalist id="socios-list">
            {todosLosSocios.map((s) => <option key={s} value={s} />)}
          </datalist>

          <Input label="Fecha" name="fecha" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />

          <div className="grid grid-cols-2 gap-4">
            <Input label="Monto (ARS)" name="monto_pesos" type="number" step="0.01" defaultValue="0" />
            <Input label="Monto (USD)" name="monto_usd" type="number" step="0.01" defaultValue="0" />
          </div>
          <Input label="Tipo de cambio" name="tipo_cambio" type="number" step="0.01" defaultValue="1" required />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isFormPending}>
              {isFormPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Registrar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
