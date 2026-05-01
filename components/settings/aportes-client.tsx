'use client'

import { useActionState, useState, useTransition } from 'react'
import { createAporte, updateAporte, deleteAporte } from '@/app/actions/rrhh'
import type { ConfiguracionAporte } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Sliders, Loader2, Info } from 'lucide-react'

function AporteForm({ aporte, onClose }: { aporte?: ConfiguracionAporte; onClose: () => void }) {
  const action = aporte ? updateAporte.bind(null, aporte.id) : createAporte
  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const res = await action(prev, fd)
      if (!res) onClose()
      return res
    },
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <Input label="Nombre" name="nombre" defaultValue={aporte?.nombre} placeholder="Ej: ADESUR, Obra Social" required />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Tipo"
          name="tipo"
          defaultValue={aporte?.tipo ?? 'PORCENTAJE'}
          options={[
            { value: 'PORCENTAJE', label: 'Porcentaje (%)' },
            { value: 'MONTO_FIJO', label: 'Monto fijo (ARS)' },
          ]}
        />
        <Input
          label="Valor"
          name="valor"
          type="number"
          step="0.0001"
          defaultValue={aporte?.valor}
          placeholder="Ej: 3 (= 3%)"
          required
        />
      </div>

      <Select
        label="Aplicable a"
        name="aplicable_a"
        defaultValue={aporte?.aplicable_a ?? 'AMBOS'}
        options={[
          { value: 'AMBOS', label: 'Todos los empleados' },
          { value: 'BLANCO', label: 'Solo empleados en blanco' },
          { value: 'NEGRO', label: 'Solo empleados en negro' },
        ]}
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-300">Patronal</label>
          <select
            name="es_patronal"
            defaultValue={aporte?.es_patronal ? 'true' : 'false'}
            className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="false">No (empleado)</option>
            <option value="true">Sí (empresa)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-300">Estado</label>
          <select
            name="activo"
            defaultValue={aporte?.activo !== false ? 'true' : 'false'}
            className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </div>
        <Input label="Orden" name="orden" type="number" defaultValue={aporte?.orden ?? 0} />
      </div>

      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {aporte ? 'Guardar' : 'Crear aporte'}
        </Button>
      </div>
    </form>
  )
}

export function AportesClient({ aportes }: { aportes: ConfiguracionAporte[] }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editAporte, setEditAporte] = useState<ConfiguracionAporte | undefined>()
  const [isPending, startTransition] = useTransition()

  function openEdit(a: ConfiguracionAporte) { setEditAporte(a); setModalOpen(true) }
  function openCreate() { setEditAporte(undefined); setModalOpen(true) }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Configuración de Aportes</h1>
          <p className="text-sm text-slate-400 mt-0.5">Se aplican automáticamente al calcular la nómina</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Nuevo aporte
        </Button>
      </div>

      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 flex gap-3">
        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <p className="text-sm text-indigo-300">
          Los aportes se calculan sobre el <strong>subtotal bruto</strong> (básico + horas + extras + comida + aguinaldo).
          Los cambios aplican a nóminas futuras, no a las ya generadas.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Nombre</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Tipo</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Valor</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Aplica a</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Paga</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {aportes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  <Sliders className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No hay aportes configurados
                </td>
              </tr>
            ) : (
              aportes.map((a) => (
                <tr key={a.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-medium text-slate-100">{a.nombre}</td>
                  <td className="px-4 py-3 text-slate-400">{a.tipo === 'PORCENTAJE' ? '%' : 'Fijo'}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-100">
                    {a.tipo === 'PORCENTAJE' ? `${a.valor}%` : `$${a.valor.toLocaleString('es-AR')}`}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={a.aplicable_a === 'AMBOS' ? 'default' : a.aplicable_a === 'BLANCO' ? 'info' : 'warning'}>
                      {a.aplicable_a}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{a.es_patronal ? 'Empresa' : 'Empleado'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={a.activo ? 'success' : 'danger'}>{a.activo ? 'Activo' : 'Inactivo'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="danger" disabled={isPending}
                        onClick={() => { if (!confirm('¿Eliminar este aporte?')) return; startTransition(() => deleteAporte(a.id)) }}>
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

      <Modal open={modalOpen} onOpenChange={setModalOpen} title={editAporte ? 'Editar aporte' : 'Nuevo aporte'}>
        <AporteForm aporte={editAporte} onClose={() => setModalOpen(false)} />
      </Modal>
    </div>
  )
}
