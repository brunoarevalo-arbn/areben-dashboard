'use client'

import { useState, useTransition } from 'react'
import { upsertVacaciones } from '@/app/actions/rrhh'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { Plus, Trash2, CalendarDays, Loader2, PlusCircle } from 'lucide-react'

interface Empleado {
  id: string
  nombre: string
  apellido: string
}

interface Periodo {
  fecha_inicio: string
  fecha_fin: string
  dias: number
  notas?: string
}

interface VacacionRecord {
  id: string
  empleado_id: string
  ano: number
  dias_disponibles: number
  dias_tomados: number
  dias_restantes: number
  periodos: Periodo[]
  empleado: { nombre: string; apellido: string } | null
}

function diasEntreFechas(inicio: string, fin: string): number {
  if (!inicio || !fin) return 0
  const d1 = new Date(inicio)
  const d2 = new Date(fin)
  const diff = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return diff > 0 ? diff : 0
}

function VacacionesForm({
  empleados,
  vacacionExistente,
  ano,
  onClose,
}: {
  empleados: Empleado[]
  vacacionExistente?: VacacionRecord
  ano: number
  onClose: () => void
}) {
  const [empleadoId, setEmpleadoId] = useState(vacacionExistente?.empleado_id ?? empleados[0]?.id ?? '')
  const [diasDisponibles, setDiasDisponibles] = useState(vacacionExistente?.dias_disponibles ?? 20)
  const [periodos, setPeriodos] = useState<Periodo[]>(vacacionExistente?.periodos ?? [])
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const diasTomados = periodos.reduce((s, p) => s + p.dias, 0)
  const diasRestantes = diasDisponibles - diasTomados

  function agregarPeriodo() {
    setPeriodos([...periodos, { fecha_inicio: '', fecha_fin: '', dias: 0, notas: '' }])
  }

  function eliminarPeriodo(i: number) {
    setPeriodos(periodos.filter((_, idx) => idx !== i))
  }

  function actualizarPeriodo(i: number, campo: keyof Periodo, valor: string) {
    const nuevos = [...periodos]
    nuevos[i] = { ...nuevos[i], [campo]: valor }
    if (campo === 'fecha_inicio' || campo === 'fecha_fin') {
      nuevos[i].dias = diasEntreFechas(nuevos[i].fecha_inicio, nuevos[i].fecha_fin)
    }
    setPeriodos(nuevos)
  }

  function handleGuardar() {
    if (!empleadoId) return setError('Seleccioná un empleado')
    const periodosValidos = periodos.filter((p) => p.fecha_inicio && p.fecha_fin && p.dias > 0)
    startTransition(async () => {
      try {
        await upsertVacaciones(empleadoId, ano, diasDisponibles, periodosValidos)
        onClose()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Error al guardar')
      }
    })
  }

  return (
    <div className="space-y-5">
      <Select
        label="Empleado"
        value={empleadoId}
        onChange={(e) => setEmpleadoId(e.target.value)}
        options={empleados.map((e) => ({
          value: e.id,
          label: `${e.apellido}, ${e.nombre}`,
        }))}
        disabled={!!vacacionExistente}
      />

      <Input
        label={`Días disponibles en ${ano}`}
        type="number"
        value={diasDisponibles}
        onChange={(e) => setDiasDisponibles(Number(e.target.value))}
        min={0}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">Períodos</p>
        <Button size="sm" variant="ghost" onClick={agregarPeriodo}>
          <PlusCircle className="w-3.5 h-3.5" />
          Agregar período
        </Button>
      </div>

      {periodos.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-3 bg-[#f5f0e6] rounded-lg">
          Sin períodos. Podés guardar solo con los días disponibles o agregar períodos tomados/agendados.
        </p>
      )}

      <div className="space-y-3">
        {periodos.map((p, i) => (
          <div key={i} className="bg-[#f5f0e6] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Período {i + 1}</span>
              <div className="flex items-center gap-2">
                {p.dias > 0 && (
                  <Badge variant="info">{p.dias} {p.dias === 1 ? 'día' : 'días'}</Badge>
                )}
                <Button size="sm" variant="danger" onClick={() => eliminarPeriodo(i)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Desde"
                type="date"
                value={p.fecha_inicio}
                onChange={(e) => actualizarPeriodo(i, 'fecha_inicio', e.target.value)}
              />
              <Input
                label="Hasta"
                type="date"
                value={p.fecha_fin}
                min={p.fecha_inicio}
                onChange={(e) => actualizarPeriodo(i, 'fecha_fin', e.target.value)}
              />
            </div>
            <Input
              label="Notas (opcional)"
              value={p.notas ?? ''}
              onChange={(e) => actualizarPeriodo(i, 'notas', e.target.value)}
              placeholder="Ej: vacaciones de verano, licencia médica..."
            />
          </div>
        ))}
      </div>

      {periodos.length > 0 && (
        <div className="bg-[#f5f0e6] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center text-sm">
          <div>
            <p className="text-slate-600 text-xs mb-1">Disponibles</p>
            <p className="font-bold text-slate-900">{diasDisponibles}d</p>
          </div>
          <div>
            <p className="text-slate-600 text-xs mb-1">Tomados/agendados</p>
            <p className="font-bold text-amber-400">{diasTomados}d</p>
          </div>
          <div>
            <p className="text-slate-600 text-xs mb-1">Restantes</p>
            <p className={`font-bold ${diasRestantes < 0 ? 'text-red-400' : 'text-green-400'}`}>
              {diasRestantes}d
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleGuardar} disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Guardar
        </Button>
      </div>
    </div>
  )
}

export function VacacionesClient({
  empleados,
  vacaciones,
  ano,
}: {
  empleados: Empleado[]
  vacaciones: VacacionRecord[]
  ano: number
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editVac, setEditVac] = useState<VacacionRecord | undefined>()

  const conVacaciones = vacaciones.map((v) => v.empleado_id)
  const sinVacaciones = empleados.filter((e) => !conVacaciones.includes(e.id))

  function openEdit(v: VacacionRecord) {
    setEditVac(v)
    setModalOpen(true)
  }

  function openCreate() {
    setEditVac(undefined)
    setModalOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vacaciones {ano}</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {vacaciones.length} empleados con registro · {sinVacaciones.length} sin registrar
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Registrar vacaciones
        </Button>
      </div>

      {vacaciones.length === 0 ? (
        <div className="bg-white border border-[#e8e4dc] rounded-xl p-12 text-center">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="text-slate-600 font-medium">Sin registros para {ano}</p>
          <p className="text-slate-500 text-sm mt-1">
            Hacé click en "Registrar vacaciones" para agregar días disponibles y períodos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vacaciones.map((v) => (
            <div key={v.id} className="bg-white border border-[#e8e4dc] rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-semibold text-slate-900">
                    {v.empleado?.apellido}, {v.empleado?.nombre}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{ano}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>
                  Editar
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                <div className="bg-[#f5f0e6] rounded-lg p-2.5">
                  <p className="text-xs text-slate-600 mb-1">Disponibles</p>
                  <p className="font-bold text-slate-900">{v.dias_disponibles}d</p>
                </div>
                <div className="bg-[#f5f0e6] rounded-lg p-2.5">
                  <p className="text-xs text-slate-600 mb-1">Tomados</p>
                  <p className="font-bold text-amber-400">{v.dias_tomados}d</p>
                </div>
                <div className="bg-[#f5f0e6] rounded-lg p-2.5">
                  <p className="text-xs text-slate-600 mb-1">Restantes</p>
                  <p className={`font-bold ${v.dias_restantes < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {v.dias_restantes}d
                  </p>
                </div>
              </div>

              {v.periodos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Períodos</p>
                  {v.periodos.map((p, i) => {
                    const esFuturo = new Date(p.fecha_inicio) > new Date()
                    return (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-[#e8e4dc] last:border-0">
                        <div>
                          <p className="text-sm text-slate-800">
                            {formatDate(p.fecha_inicio)} → {formatDate(p.fecha_fin)}
                          </p>
                          {p.notas && <p className="text-xs text-slate-500">{p.notas}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={esFuturo ? 'info' : 'success'}>
                            {esFuturo ? 'Agendado' : 'Tomado'}
                          </Badge>
                          <span className="text-xs text-slate-600">{p.dias}d</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {v.periodos.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-2">Sin períodos registrados</p>
              )}
            </div>
          ))}
        </div>
      )}

      {sinVacaciones.length > 0 && (
        <div className="bg-white border border-[#e8e4dc] rounded-xl p-4">
          <p className="text-sm font-medium text-slate-600 mb-2">Sin registro en {ano}:</p>
          <div className="flex flex-wrap gap-2">
            {sinVacaciones.map((e) => (
              <button
                key={e.id}
                onClick={openCreate}
                className="px-2.5 py-1 bg-[#f5f0e6] hover:bg-[#e8e0d0] rounded-lg text-xs text-slate-600 hover:text-slate-800 transition-colors"
              >
                {e.apellido}, {e.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editVac ? 'Editar vacaciones' : 'Registrar vacaciones'}
        className="max-w-xl"
      >
        <VacacionesForm
          empleados={empleados}
          vacacionExistente={editVac}
          ano={ano}
          onClose={() => setModalOpen(false)}
        />
      </Modal>
    </div>
  )
}
