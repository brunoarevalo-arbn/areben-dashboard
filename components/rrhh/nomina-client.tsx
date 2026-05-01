'use client'

import { useActionState, useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createNomina, marcarNominaPagada, deleteNomina } from '@/app/actions/rrhh'
import type { NominaMensual, ConfiguracionAporte } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { EstadoBadge } from '@/components/ui/badge'
import { formatCurrency, getMonthOptions, formatMonth } from '@/lib/utils'
import { Plus, Trash2, CheckCircle, FileText, Loader2, Calculator } from 'lucide-react'

interface EmpleadoBasico {
  id: string
  nombre: string
  apellido: string
  tipo_empleado: string
  sueldo_basico: number
  valor_hora: number
}

function calcular(
  sueldo_basico: number,
  horas: number,
  valor_hora: number,
  horas_extras: number,
  comida: number,
  aguinaldo: number,
  aportes: ConfiguracionAporte[],
  tipoEmpleado: string
) {
  const sueldo_horas = horas * valor_hora
  const extras_monto = horas_extras * valor_hora * 1.5
  const subtotal = sueldo_basico + sueldo_horas + extras_monto + comida + aguinaldo

  let aportes_empleado = 0
  let aportes_patronales = 0

  for (const a of aportes) {
    if (a.aplicable_a !== 'AMBOS' && a.aplicable_a !== tipoEmpleado) continue
    const monto = a.tipo === 'PORCENTAJE' ? (subtotal * a.valor) / 100 : a.valor
    if (a.es_patronal) aportes_patronales += monto
    else aportes_empleado += monto
  }

  const neto = subtotal - aportes_empleado
  const costo_empresa = subtotal + aportes_patronales
  return { subtotal, aportes_empleado, aportes_patronales, neto, costo_empresa }
}

function NominaForm({
  empleados,
  aportes,
  mes,
  nominasExistentes,
  onClose,
}: {
  empleados: EmpleadoBasico[]
  aportes: ConfiguracionAporte[]
  mes: string
  nominasExistentes: string[]
  onClose: () => void
}) {
  const disponibles = empleados.filter((e) => !nominasExistentes.includes(e.id))
  const [empleadoId, setEmpleadoId] = useState(disponibles[0]?.id ?? '')
  const empleado = empleados.find((e) => e.id === empleadoId)

  const [vals, setVals] = useState({
    sueldo_basico: empleado?.sueldo_basico ?? 0,
    horas: 0,
    valor_hora: empleado?.valor_hora ?? 0,
    horas_extras: 0,
    comida: 0,
    aguinaldo: 0,
  })

  useEffect(() => {
    if (empleado) {
      setVals((v) => ({ ...v, sueldo_basico: empleado.sueldo_basico, valor_hora: empleado.valor_hora }))
    }
  }, [empleadoId])

  const calc = calcular(
    vals.sueldo_basico, vals.horas, vals.valor_hora,
    vals.horas_extras, vals.comida, vals.aguinaldo,
    aportes, empleado?.tipo_empleado ?? 'NEGRO'
  )

  const [error, action, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const res = await createNomina(prev, fd)
      if (!res) onClose()
      return res
    },
    null
  )

  if (disponibles.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-400">Todos los empleados ya tienen nómina para este mes.</p>
        <Button className="mt-4" onClick={onClose} variant="secondary">Cerrar</Button>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="mes" value={mes} />

      <Select
        label="Empleado"
        name="empleado_id"
        value={empleadoId}
        onChange={(e) => setEmpleadoId(e.target.value)}
        options={disponibles.map((e) => ({
          value: e.id,
          label: `${e.apellido}, ${e.nombre} (${e.tipo_empleado})`,
        }))}
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Sueldo básico"
          name="sueldo_basico"
          type="number" step="0.01"
          value={vals.sueldo_basico}
          onChange={(e) => setVals((v) => ({ ...v, sueldo_basico: Number(e.target.value) }))}
        />
        <Input
          label="Horas trabajadas"
          name="horas_trabajadas"
          type="number" step="0.5"
          value={vals.horas}
          onChange={(e) => setVals((v) => ({ ...v, horas: Number(e.target.value) }))}
        />
        <Input
          label="Valor hora"
          name="valor_hora"
          type="number" step="0.01"
          value={vals.valor_hora}
          onChange={(e) => setVals((v) => ({ ...v, valor_hora: Number(e.target.value) }))}
        />
        <Input
          label="Horas extras"
          name="horas_extras"
          type="number" step="0.5"
          value={vals.horas_extras}
          onChange={(e) => setVals((v) => ({ ...v, horas_extras: Number(e.target.value) }))}
        />
        <Input
          label="Comida"
          name="comida"
          type="number" step="0.01"
          value={vals.comida}
          onChange={(e) => setVals((v) => ({ ...v, comida: Number(e.target.value) }))}
        />
        <Input
          label="Aguinaldo"
          name="aguinaldo"
          type="number" step="0.01"
          value={vals.aguinaldo}
          onChange={(e) => setVals((v) => ({ ...v, aguinaldo: Number(e.target.value) }))}
        />
      </div>

      <div className="bg-slate-800 rounded-xl p-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-slate-400 mb-3">
          <Calculator className="w-4 h-4" />
          <span className="font-medium text-slate-300">Cálculo automático</span>
        </div>
        {[
          { label: 'Subtotal bruto', value: calc.subtotal },
          { label: 'Aportes empleado', value: -calc.aportes_empleado, color: 'text-red-400' },
          { label: 'Neto a pagar', value: calc.neto, color: 'text-green-400 font-semibold text-base' },
          { label: 'Aportes patronales', value: calc.aportes_patronales, color: 'text-amber-400' },
          { label: 'Costo empresa', value: calc.costo_empresa, color: 'text-indigo-400 font-semibold' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`flex justify-between ${color ?? 'text-slate-300'}`}>
            <span>{label}</span>
            <span className="font-mono">{formatCurrency(value)}</span>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Generar nómina
        </Button>
      </div>
    </form>
  )
}

interface NominaClientProps {
  nominas: (NominaMensual & { empleado: { nombre: string; apellido: string; tipo_empleado: string } | null })[]
  empleados: EmpleadoBasico[]
  aportes: ConfiguracionAporte[]
  mes: string
}

export function NominaClient({ nominas, empleados, aportes, mes }: NominaClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const nominasExistentes = nominas.map((n) => n.empleado_id)
  const totalNeto = nominas.reduce((s, n) => s + n.neto, 0)
  const totalCosto = nominas.reduce((s, n) => s + n.costo_empresa, 0)
  const totalPendiente = nominas.filter((n) => n.estado === 'PENDIENTE').reduce((s, n) => s + n.neto, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Nómina</h1>
          <p className="text-sm text-slate-400 mt-0.5">{nominas.length} empleados</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={searchParams.get('mes') ?? mes}
            onChange={(e) => router.push(`?mes=${e.target.value}`)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {getMonthOptions().map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Nueva nómina
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total neto', value: totalNeto, color: 'text-slate-100' },
          { label: 'Pendiente de pago', value: totalPendiente, color: 'text-amber-400' },
          { label: 'Costo empresa', value: totalCosto, color: 'text-indigo-400' },
        ].map((item) => (
          <div key={item.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{formatCurrency(item.value)}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">{formatMonth(mes)}</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Empleado</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Básico</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Subtotal</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Aportes</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Neto</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Costo emp.</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {nominas.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No hay nómina para {formatMonth(mes)}
                </td>
              </tr>
            ) : (
              nominas.map((n) => (
                <tr key={n.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-100">{n.empleado?.apellido}, {n.empleado?.nombre}</p>
                    <p className="text-xs text-slate-500">{n.empleado?.tipo_empleado}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-300">{formatCurrency(n.sueldo_basico)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-300">{formatCurrency(n.subtotal)}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-400">{formatCurrency(n.aportes_empleado)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-green-400">{formatCurrency(n.neto)}</td>
                  <td className="px-4 py-3 text-right font-mono text-indigo-400">{formatCurrency(n.costo_empresa)}</td>
                  <td className="px-4 py-3"><EstadoBadge estado={n.estado} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {n.estado === 'PENDIENTE' && (
                        <Button size="sm" variant="success" disabled={isPending}
                          onClick={() => startTransition(() => marcarNominaPagada(n.id))}>
                          <CheckCircle className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="danger" disabled={isPending}
                        onClick={() => {
                          if (!confirm('¿Eliminar esta nómina?')) return
                          startTransition(() => deleteNomina(n.id))
                        }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {nominas.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-700 bg-slate-800/50">
                <td className="px-4 py-3 text-sm font-semibold text-slate-300">TOTAL</td>
                <td />
                <td className="px-4 py-3 text-right font-mono font-semibold text-slate-200">{formatCurrency(nominas.reduce((s, n) => s + n.subtotal, 0))}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-red-400">{formatCurrency(nominas.reduce((s, n) => s + n.aportes_empleado, 0))}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-green-400">{formatCurrency(totalNeto)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-indigo-400">{formatCurrency(totalCosto)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Modal open={modalOpen} onOpenChange={setModalOpen} title="Nueva nómina" className="max-w-2xl">
        <NominaForm
          empleados={empleados}
          aportes={aportes}
          mes={mes}
          nominasExistentes={nominasExistentes}
          onClose={() => setModalOpen(false)}
        />
      </Modal>
    </div>
  )
}
