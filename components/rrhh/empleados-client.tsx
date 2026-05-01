'use client'

import { useActionState, useState, useTransition } from 'react'
import { createEmpleado, updateEmpleado, toggleEmpleadoActivo } from '@/app/actions/rrhh'
import type { Empleado } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Pencil, UserX, UserCheck, Users, Loader2, Phone, Mail } from 'lucide-react'

function EmpleadoForm({ emp, onClose }: { emp?: Empleado; onClose: () => void }) {
  const action = emp ? updateEmpleado.bind(null, emp.id) : createEmpleado
  const [tipo, setTipo] = useState<'BLANCO' | 'NEGRO'>(emp?.tipo_empleado ?? 'BLANCO')

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
      <div className="grid grid-cols-2 gap-4">
        <Input label="Nombre" name="nombre" defaultValue={emp?.nombre} required />
        <Input label="Apellido" name="apellido" defaultValue={emp?.apellido} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="DNI" name="dni" defaultValue={emp?.dni} required />
        <Input label="Fecha de ingreso" name="fecha_ingreso" type="date"
          defaultValue={emp?.fecha_ingreso ?? new Date().toISOString().split('T')[0]} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Email" name="email" type="email" defaultValue={emp?.email ?? ''} />
        <Input label="Teléfono" name="telefono" defaultValue={emp?.telefono ?? ''} />
      </div>
      <Input label="Fecha de nacimiento" name="fecha_nacimiento" type="date" defaultValue={emp?.fecha_nacimiento ?? ''} />

      <Select
        label="Tipo de empleado"
        name="tipo_empleado"
        defaultValue={tipo}
        onChange={(e) => setTipo(e.target.value as 'BLANCO' | 'NEGRO')}
        options={[
          { value: 'BLANCO', label: 'Blanco (en relación de dependencia)' },
          { value: 'NEGRO', label: 'Negro (informal)' },
        ]}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input label="Sueldo básico (ARS)" name="sueldo_basico" type="number" step="0.01"
          defaultValue={emp?.sueldo_basico ?? 0} />
        <Input label="Valor hora (ARS)" name="valor_hora" type="number" step="0.01"
          defaultValue={emp?.valor_hora ?? 0} />
      </div>

      {tipo === 'BLANCO' ? (
        <div className="grid grid-cols-2 gap-4">
          <Input label="CBU" name="cbu" defaultValue={emp?.cbu ?? ''} />
          <Input label="Banco" name="banco" defaultValue={emp?.banco ?? ''} />
        </div>
      ) : (
        <Select
          label="Método de pago"
          name="metodo_pago"
          defaultValue={emp?.metodo_pago ?? 'EFECTIVO'}
          options={[
            { value: 'EFECTIVO', label: 'Efectivo' },
            { value: 'TRANSFERENCIA', label: 'Transferencia' },
          ]}
        />
      )}

      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {emp ? 'Guardar' : 'Crear empleado'}
        </Button>
      </div>
    </form>
  )
}

export function EmpleadosClient({ empleados }: { empleados: Empleado[] }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editEmp, setEditEmp] = useState<Empleado | undefined>()
  const [isPending, startTransition] = useTransition()
  const [showInactivos, setShowInactivos] = useState(false)

  const filtered = showInactivos ? empleados : empleados.filter((e) => e.activo)
  const activos = empleados.filter((e) => e.activo).length

  function openEdit(e: Empleado) {
    setEditEmp(e)
    setModalOpen(true)
  }

  function openCreate() {
    setEditEmp(undefined)
    setModalOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Empleados</h1>
          <p className="text-sm text-slate-400 mt-0.5">{activos} activos · {empleados.length} total</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input type="checkbox" checked={showInactivos} onChange={(e) => setShowInactivos(e.target.checked)}
              className="rounded" />
            Mostrar inactivos
          </label>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Nuevo empleado
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p className="text-slate-500">No hay empleados cargados</p>
          </div>
        ) : (
          filtered.map((emp) => (
            <div key={emp.id} className={`bg-slate-900 border rounded-xl p-5 ${!emp.activo ? 'border-slate-800 opacity-60' : 'border-slate-800'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-slate-100">{emp.nombre} {emp.apellido}</p>
                  <p className="text-xs text-slate-500">DNI {emp.dni}</p>
                </div>
                <div className="flex gap-1">
                  <Badge variant={emp.tipo_empleado === 'BLANCO' ? 'info' : 'warning'}>
                    {emp.tipo_empleado}
                  </Badge>
                  {!emp.activo && <Badge variant="danger">Inactivo</Badge>}
                </div>
              </div>

              <div className="space-y-1.5 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Sueldo básico</span>
                  <span className="font-mono text-slate-100">{formatCurrency(emp.sueldo_basico)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Valor hora</span>
                  <span className="font-mono text-slate-100">{formatCurrency(emp.valor_hora)}</span>
                </div>
                {emp.tipo_empleado === 'BLANCO' && emp.banco && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Banco</span>
                    <span className="text-slate-300">{emp.banco}</span>
                  </div>
                )}
                {emp.tipo_empleado === 'NEGRO' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Pago</span>
                    <span className="text-slate-300">{emp.metodo_pago ?? '—'}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Ingreso</span>
                  <span className="text-slate-300">{formatDate(emp.fecha_ingreso)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 mb-3">
                {emp.email && (
                  <a href={`mailto:${emp.email}`} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
                    <Mail className="w-3.5 h-3.5" />
                  </a>
                )}
                {emp.telefono && (
                  <a href={`tel:${emp.telefono}`} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-800">
                <Button size="sm" variant="ghost" onClick={() => openEdit(emp)} className="flex-1">
                  <Pencil className="w-3.5 h-3.5" />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant={emp.activo ? 'danger' : 'success'}
                  disabled={isPending}
                  onClick={() => startTransition(() => toggleEmpleadoActivo(emp.id, !emp.activo))}
                >
                  {emp.activo ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal open={modalOpen} onOpenChange={setModalOpen} title={editEmp ? 'Editar empleado' : 'Nuevo empleado'} className="max-w-xl">
        <EmpleadoForm emp={editEmp} onClose={() => setModalOpen(false)} />
      </Modal>
    </div>
  )
}
