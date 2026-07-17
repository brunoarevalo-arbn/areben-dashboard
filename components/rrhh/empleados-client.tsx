'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  createEmpleado, updateEmpleado, toggleEmpleadoActivo,
  createEvento, createAjusteSalarial, deleteEvento,
  createHoraExtra, deleteHoraExtra,
  createAusencia, deleteAusencia,
} from '@/app/actions/rrhh'
import type { Empleado, EventoEmpleado, TipoEvento, HoraExtraRegistro, AusenciaRegistro, TipoAusencia } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Plus, Pencil, UserX, UserCheck, Users, Loader2, Phone, Mail,
  Calendar, AlertTriangle, History, ChevronDown, ChevronUp, Trash2,
  Calculator, TrendingUp, FileText, Clock, UtensilsCrossed, BadgeCheck,
  CalendarX, Search, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const HORAS_OPCIONES = [80, 100, 120, 140, 160, 200]

const TIPO_EVENTO_LABEL: Record<TipoEvento, string> = {
  INCIDENCIA: 'Incidencia',
  AJUSTE_SALARIAL: 'Ajuste salarial',
  LICENCIA: 'Licencia',
  PREMIO: 'Premio',
  AMONESTACION: 'Amonestación',
  OTRO: 'Otro',
}

const TIPO_EVENTO_COLOR: Record<TipoEvento, string> = {
  INCIDENCIA: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  AJUSTE_SALARIAL: 'bg-green-500/15 text-green-700 border-green-500/30',
  LICENCIA: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  PREMIO: 'bg-orange-500/15 text-primary border-orange-500/30',
  AMONESTACION: 'bg-red-500/15 text-red-700 border-red-500/30',
  OTRO: 'bg-slate-500/15 text-fg-muted border-slate-500/30',
}

// ─── EmpleadoForm ─────────────────────────────────────────────────────────────

function EmpleadoForm({ emp, onClose }: { emp?: Empleado; onClose: () => void }) {
  const action = emp ? updateEmpleado.bind(null, emp.id) : createEmpleado
  const [tipo, setTipo] = useState<'BLANCO' | 'NEGRO'>(emp?.tipo_empleado ?? 'BLANCO')
  const [sueldoBasico, setSueldoBasico] = useState(emp?.sueldo_basico ?? 0)
  const [horasMensuales, setHorasMensuales] = useState(emp?.horas_mensuales ?? 160)
  const [correspondeAguinaldo, setCorrespondeAguinaldo] = useState(emp?.corresponde_aguinaldo ?? false)
  const [porcentajeAguinaldo, setPorcentajeAguinaldo] = useState(emp?.porcentaje_aguinaldo ?? 8.33)
  const [montoComidas, setMontoComidas] = useState(emp?.monto_comidas ?? 0)
  const [presentismoPct, setPresentismoPct] = useState(emp?.presentismo_pct ?? 0)
  const [horasAcuerdoNegro, setHorasAcuerdoNegro] = useState(emp?.horas_acuerdo_negro ?? 0)
  const [plusNegroTipo, setPlusNegroTipo] = useState<'NONE' | 'MONTO' | 'PORCENTAJE'>(
    (emp?.plus_negro_tipo as 'MONTO' | 'PORCENTAJE' | null) ?? 'NONE'
  )
  const [plusNegroValor, setPlusNegroValor] = useState(emp?.plus_negro_valor ?? 0)

  const valorHora = horasMensuales > 0 ? Math.round((sueldoBasico / horasMensuales) * 100) / 100 : 0
  const montoAcuerdoNegro = horasAcuerdoNegro * valorHora
  // Para el preview del plus: si es %, base = sueldo_basico (en form todavía no hay recibo oficial — se asume = básico para el cálculo del aguinaldo)
  const montoPlusNegro = plusNegroTipo === 'MONTO' ? plusNegroValor
    : plusNegroTipo === 'PORCENTAJE' ? (sueldoBasico * plusNegroValor / 100)
    : 0

  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('valor_hora', String(valorHora))
      fd.set('horas_mensuales', String(horasMensuales))
      fd.set('corresponde_aguinaldo', correspondeAguinaldo ? 'true' : 'false')
      fd.set('porcentaje_aguinaldo', String(porcentajeAguinaldo))
      fd.set('monto_comidas', String(tipo === 'NEGRO' ? montoComidas : 0))
      fd.set('presentismo_pct', String(tipo === 'NEGRO' ? presentismoPct : 0))
      fd.set('horas_acuerdo_negro', String(horasAcuerdoNegro))
      fd.set('plus_negro_tipo', plusNegroTipo)
      fd.set('plus_negro_valor', String(plusNegroTipo === 'NONE' ? 0 : plusNegroValor))
      const res = await action(prev, fd)
      if (!res) onClose()
      return res
    },
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      {/* Obligatorios */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Input label="Nombre *" name="nombre" defaultValue={emp?.nombre} required />
        <Input label="Apellido *" name="apellido" defaultValue={emp?.apellido} required />
      </div>

      {/* Opcionales */}
      <div className="bg-surface-2/40 border border-border-strong/40 rounded-xl p-4 space-y-3">
        <p className="text-xs text-fg-soft uppercase tracking-wide font-medium">Datos personales (opcionales)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="DNI" name="dni" defaultValue={emp?.dni ?? ''} placeholder="—" />
          <Input label="Fecha de ingreso" name="fecha_ingreso" type="date"
            defaultValue={emp?.fecha_ingreso ?? ''} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Email" name="email" type="email" defaultValue={emp?.email ?? ''} placeholder="—" />
          <Input label="Teléfono" name="telefono" defaultValue={emp?.telefono ?? ''} placeholder="—" />
        </div>
        <Input label="Fecha de nacimiento" name="fecha_nacimiento" type="date" defaultValue={emp?.fecha_nacimiento ?? ''} />
      </div>

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

      {/* Sueldo / horas / valor hora */}
      <div className="bg-surface-2 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-fg-muted">
          <Calculator className="w-4 h-4" />
          <span className="text-sm font-medium">Cálculo salarial</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-fg-muted">Sueldo básico (ARS)</label>
            <input
              type="number"
              step="0.01"
              name="sueldo_basico"
              value={sueldoBasico || ''}
              onChange={(e) => setSueldoBasico(Number(e.target.value))}
              className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-fg-muted">Horas mensuales</label>
            <select
              value={horasMensuales}
              onChange={(e) => setHorasMensuales(Number(e.target.value))}
              className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            >
              {HORAS_OPCIONES.map((h) => (
                <option key={h} value={h}>{h} hs</option>
              ))}
            </select>
          </div>
        </div>
        <div className="bg-surface-2/50 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-fg-muted">
            Valor hora <span className="text-fg-soft">(auto)</span>
          </span>
          <span className="font-mono text-base text-green-700 font-semibold">
            {formatCurrency(valorHora)}
            <span className="text-xs text-fg-soft ml-2">
              {sueldoBasico > 0 ? `${formatCurrency(sueldoBasico)} ÷ ${horasMensuales}` : ''}
            </span>
          </span>
        </div>
      </div>

      {/* Aguinaldo (acuerdo contractual) */}
      <div className="bg-surface-2/60 border border-border-strong/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={correspondeAguinaldo}
              onChange={(e) => setCorrespondeAguinaldo(e.target.checked)}
              className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2 text-orange-600 focus:ring-primary"
            />
            <span className="text-sm font-medium text-fg-muted">Acuerdo de aguinaldo (SAC)</span>
          </label>
          <span className="text-xs text-fg-soft">parte del contrato base</span>
        </div>
        {correspondeAguinaldo && (
          <div className="grid grid-cols-2 gap-3 pl-6">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-fg-muted">Porcentaje mensual (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={porcentajeAguinaldo}
                onChange={(e) => setPorcentajeAguinaldo(Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              <p className="text-xs text-fg-soft">8.33% = 1/12 del básico anual (SAC)</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex flex-col justify-center">
              <span className="text-xs text-fg-muted">Provisión mensual</span>
              <span className="font-mono text-sm text-amber-700 font-semibold">
                {formatCurrency(sueldoBasico * porcentajeAguinaldo / 100)}
              </span>
              <span className="text-[10px] text-fg-soft">→ Caja Aguinaldos</span>
            </div>
          </div>
        )}
      </div>

      {/* Acuerdo en negro (horas fijas mensuales) */}
      <div className="bg-surface-2/60 border border-amber-500/20 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
          <BadgeCheck className="w-4 h-4" />
          Acuerdo fijo en negro <span className="text-xs text-fg-soft font-normal">(horas extras del acuerdo, no son extras reales)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-fg-muted">
              Horas mensuales acordadas
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={horasAcuerdoNegro || ''}
              onChange={(e) => setHorasAcuerdoNegro(Math.max(0, Number(e.target.value)))}
              placeholder="0"
              className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
            <p className="text-[11px] text-fg-soft">Ej: 3 hs/día × 22 días = 66 hs/mes</p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex flex-col justify-center">
            <span className="text-xs text-fg-muted">Monto fijo mensual en negro</span>
            <span className="font-mono text-sm text-amber-700 font-semibold">
              {formatCurrency(montoAcuerdoNegro)}
            </span>
            <span className="text-[10px] text-fg-soft">{horasAcuerdoNegro} hs × {formatCurrency(valorHora)}</span>
          </div>
        </div>
        {horasAcuerdoNegro > 0 && correspondeAguinaldo && (
          <div className="bg-surface-2/40 rounded-lg px-3 py-2 text-xs text-fg-muted">
            Este monto suma a la base del aguinaldo: <span className="font-mono text-amber-800">+{formatCurrency(montoAcuerdoNegro * porcentajeAguinaldo / 100)} mensual</span>
          </div>
        )}
      </div>

      {/* Plus salarial fijo en negro */}
      <div className="bg-surface-2/60 border border-amber-500/20 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
          <TrendingUp className="w-4 h-4" />
          Plus salarial fijo en negro
          <span className="text-xs text-fg-soft font-normal">(monto o % adicional al recibo oficial)</span>
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-fg-muted">Tipo de plus</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { v: 'NONE' as const, label: 'Sin plus' },
              { v: 'MONTO' as const, label: 'Monto fijo $' },
              { v: 'PORCENTAJE' as const, label: '% sobre oficial' },
            ]).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setPlusNegroTipo(v)}
                className={cn(
                  'px-3 py-2 rounded-lg border text-xs font-medium transition-colors',
                  plusNegroTipo === v
                    ? 'bg-amber-600/20 border-amber-500/50 text-amber-800'
                    : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg-muted'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {plusNegroTipo !== 'NONE' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-fg-muted">
                {plusNegroTipo === 'MONTO' ? 'Monto fijo mensual ($)' : 'Porcentaje (%)'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={plusNegroValor || ''}
                  onChange={(e) => setPlusNegroValor(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-soft text-xs">
                  {plusNegroTipo === 'MONTO' ? '$' : '%'}
                </span>
              </div>
              <p className="text-[11px] text-fg-soft">
                {plusNegroTipo === 'MONTO' ? 'Plus fijo en pesos por mes' : 'Se aplica sobre el monto del recibo oficial'}
              </p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex flex-col justify-center">
              <span className="text-xs text-fg-muted">Plus mensual estimado</span>
              <span className="font-mono text-sm text-amber-700 font-semibold">
                {formatCurrency(montoPlusNegro)}
              </span>
              <span className="text-[10px] text-fg-soft">
                {plusNegroTipo === 'PORCENTAJE' ? `${plusNegroValor}% × ${formatCurrency(sueldoBasico)} (estimado)` : 'fijo mensual'}
              </span>
            </div>
          </div>
        )}
        {plusNegroTipo !== 'NONE' && montoPlusNegro > 0 && correspondeAguinaldo && (
          <div className="bg-surface-2/40 rounded-lg px-3 py-2 text-xs text-fg-muted">
            Suma a la base del aguinaldo: <span className="font-mono text-amber-800">+{formatCurrency(montoPlusNegro * porcentajeAguinaldo / 100)} mensual</span>
          </div>
        )}
      </div>

      {/* Comidas + Presentismo (solo NEGRO) */}
      {tipo === 'NEGRO' && (
        <div className="bg-surface-2/60 border border-amber-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
            <BadgeCheck className="w-4 h-4" />
            Acuerdos adicionales (Negro)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-fg-muted flex items-center gap-1">
                <UtensilsCrossed className="w-3 h-3" />
                Monto de comidas (mensual)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={montoComidas || ''}
                onChange={(e) => setMontoComidas(Number(e.target.value))}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-fg-muted">
                Presentismo (% sobre básico)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={presentismoPct || ''}
                  onChange={(e) => setPresentismoPct(Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-3 py-2 pr-7 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-soft text-xs">%</span>
              </div>
              {presentismoPct > 0 && sueldoBasico > 0 && (
                <p className="text-xs text-fg-soft">
                  Si asistencia 100%: <span className="text-amber-700 font-mono">{formatCurrency(sueldoBasico * presentismoPct / 100)}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {tipo === 'BLANCO' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

      {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

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

// ─── EventoForm ───────────────────────────────────────────────────────────────

function EventoForm({ empleado, onClose }: { empleado: Empleado; onClose: () => void }) {
  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('empleado_id', empleado.id)
      const res = await createEvento(prev, fd)
      if (!res) onClose()
      return res
    },
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="bg-surface-2/60 rounded-lg px-4 py-2 text-sm text-fg-muted">
        <span className="text-fg-soft">Empleado:</span> {empleado.apellido}, {empleado.nombre}
      </div>

      <Select
        label="Tipo de evento"
        name="tipo"
        defaultValue="INCIDENCIA"
        options={[
          { value: 'INCIDENCIA', label: 'Incidencia' },
          { value: 'LICENCIA', label: 'Licencia' },
          { value: 'PREMIO', label: 'Premio' },
          { value: 'AMONESTACION', label: 'Amonestación' },
          { value: 'OTRO', label: 'Otro' },
        ]}
        required
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Input label="Fecha" name="fecha" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
        <Input label="Título" name="titulo" placeholder="Resumen breve" required />
      </div>

      <Textarea label="Descripción" name="descripcion" placeholder="Detalles del evento..." rows={4} />

      {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Registrar evento
        </Button>
      </div>
    </form>
  )
}

// ─── AjusteSalarialForm ───────────────────────────────────────────────────────

function AjusteSalarialForm({ empleado, onClose }: { empleado: Empleado; onClose: () => void }) {
  const [sueldoNuevo, setSueldoNuevo] = useState(empleado.sueldo_basico)
  const horasMensuales = empleado.horas_mensuales || 160
  const valorHoraNuevo = sueldoNuevo / horasMensuales
  const incremento = empleado.sueldo_basico > 0
    ? ((sueldoNuevo - empleado.sueldo_basico) / empleado.sueldo_basico) * 100
    : 0

  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('empleado_id', empleado.id)
      fd.set('sueldo_nuevo', String(sueldoNuevo))
      const res = await createAjusteSalarial(prev, fd)
      if (!res) onClose()
      return res
    },
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="bg-surface-2/60 rounded-lg px-4 py-2 text-sm text-fg-muted">
        <span className="text-fg-soft">Empleado:</span> {empleado.apellido}, {empleado.nombre}
      </div>

      <Input label="Fecha de aplicación" name="fecha" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-surface-2 rounded-lg p-3">
          <p className="text-xs text-fg-muted mb-1">Sueldo actual</p>
          <p className="text-base font-mono text-fg-muted">{formatCurrency(empleado.sueldo_basico)}</p>
          <p className="text-xs text-fg-soft mt-1">{formatCurrency(empleado.valor_hora)} / hora</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
          <p className="text-xs text-fg-muted mb-1">Sueldo nuevo</p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={sueldoNuevo || ''}
            onChange={(e) => setSueldoNuevo(Number(e.target.value))}
            className="w-full px-2 py-1 bg-surface-2 border border-border-strong rounded text-green-700 font-mono focus:outline-none focus:ring-1 focus:ring-primary text-base"
            required
          />
          <p className="text-xs text-fg-soft mt-1">{formatCurrency(valorHoraNuevo)} / hora</p>
        </div>
      </div>

      {sueldoNuevo > 0 && empleado.sueldo_basico > 0 && (
        <div className={cn(
          'rounded-lg p-3 flex items-center justify-between text-sm',
          incremento > 0 ? 'bg-green-500/10 text-green-700' : incremento < 0 ? 'bg-red-500/10 text-red-700' : 'bg-surface-2 text-fg-muted'
        )}>
          <span className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" />
            Variación
          </span>
          <span className="font-mono font-medium">
            {incremento >= 0 ? '+' : ''}{incremento.toFixed(2)}%
            <span className="text-xs text-fg-soft ml-2">
              ({formatCurrency(sueldoNuevo - empleado.sueldo_basico)})
            </span>
          </span>
        </div>
      )}

      <Textarea label="Motivo / observaciones" name="descripcion" placeholder="Ej: Aumento de paritarias, ascenso..." rows={3} />

      {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        Este ajuste actualizará el sueldo y valor hora del empleado, y quedará registrado en el historial.
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Aplicar ajuste
        </Button>
      </div>
    </form>
  )
}

// ─── HoraExtraRow ─────────────────────────────────────────────────────────────

function HoraExtraRow({ he, valorHora }: { he: HoraExtraRegistro; valorHora: number }) {
  const [isPending, startTransition] = useTransition()
  const monto = he.cantidad * valorHora * (1 + he.porcentaje / 100)
  return (
    <div className="bg-surface-2/40 rounded-lg px-3 py-1.5 flex items-center justify-between text-xs group">
      <span className="text-fg-muted">{formatDate(he.fecha)}</span>
      <span className="font-mono text-fg-muted">{he.cantidad}h al {he.porcentaje}%</span>
      <span className="font-mono text-amber-700">{formatCurrency(monto)}</span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm('¿Eliminar este registro?')) return
          startTransition(() => deleteHoraExtra(he.id))
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-2 text-fg-soft hover:text-red-700 transition-all"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

// ─── HoraExtraForm ────────────────────────────────────────────────────────────

const PORCENTAJES_HE = [0, 30, 50, 100]

function HoraExtraForm({ empleado, onClose }: { empleado: Empleado; onClose: () => void }) {
  const [porcentaje, setPorcentaje] = useState(50)
  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('empleado_id', empleado.id)
      fd.set('porcentaje', String(porcentaje))
      const r = await createHoraExtra(prev, fd)
      if (!r) onClose()
      return r
    },
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="bg-surface-2/60 rounded-lg px-4 py-2 text-sm text-fg-muted">
        <span className="text-fg-soft">Empleado:</span> {empleado.apellido}, {empleado.nombre}
        <span className="ml-2 text-xs text-fg-soft">Valor hora: {formatCurrency(empleado.valor_hora || (empleado.sueldo_basico / (empleado.horas_mensuales || 160)))}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Input label="Fecha" name="fecha" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
        <Input label="Cantidad de horas" name="cantidad" type="number" step="any" min="0" required placeholder="Ej: 5.17" />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-fg-muted">Porcentaje extra</label>
        <div className="grid grid-cols-4 gap-2">
          {PORCENTAJES_HE.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPorcentaje(p)}
              className={cn(
                'px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                porcentaje === p
                  ? 'bg-orange-500/20 border-orange-500/50 text-orange-600'
                  : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg-muted'
              )}
            >
              {p}%
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-soft">Otro valor:</span>
          <input
            type="number"
            min="0"
            max="200"
            step="1"
            value={porcentaje}
            onChange={(e) => setPorcentaje(Number(e.target.value))}
            className="w-24 px-2 py-1 bg-surface-2 border border-border-strong rounded text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <span className="text-xs text-fg-soft">% (podés escribir cualquiera, ej: 75, 150, 200)</span>
        </div>
      </div>

      <Textarea label="Notas (opcional)" name="notas" placeholder="Detalle del trabajo realizado" rows={2} />

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Registrar
        </Button>
      </div>
    </form>
  )
}

// ─── AusenciaRow ──────────────────────────────────────────────────────────────

const TIPO_AUSENCIA_LABEL: Record<TipoAusencia, string> = {
  FALTA: 'Falta',
  LICENCIA_NO_PAGA: 'Licencia s/goce',
  SIN_AVISO: 'Sin aviso',
  JUSTIFICADA: 'Justificada',
  OTRO: 'Otro',
}

function AusenciaRow({ a }: { a: AusenciaRegistro }) {
  const [isPending, startTransition] = useTransition()
  return (
    <div className="bg-surface-2/40 rounded-lg px-3 py-1.5 flex items-center justify-between text-xs group">
      <span className="text-fg-muted">{formatDate(a.fecha)}</span>
      <span className="font-mono text-fg-muted flex-1 ml-3">
        {a.dias} día{a.dias !== 1 ? 's' : ''} · {TIPO_AUSENCIA_LABEL[a.tipo]}
        {a.notas && <span className="text-fg-soft ml-2">— {a.notas}</span>}
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm('¿Eliminar este registro de ausencia?')) return
          startTransition(async () => {
            try {
              await deleteAusencia(a.id)
            } catch (e) {
              alert((e as Error).message)
            }
          })
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-2 text-fg-soft hover:text-red-700 transition-all"
        title="Eliminar ausencia"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

// ─── AusenciaForm ─────────────────────────────────────────────────────────────

function AusenciaForm({ empleado, onClose }: { empleado: Empleado; onClose: () => void }) {
  const [tipo, setTipo] = useState<TipoAusencia>('FALTA')
  const [dias, setDias] = useState(1)
  const valorHora = empleado.valor_hora || (empleado.sueldo_basico / (empleado.horas_mensuales || 160))
  const descuentoEstimado = dias * 8 * valorHora

  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('empleado_id', empleado.id)
      fd.set('tipo', tipo)
      fd.set('dias', String(dias))
      const r = await createAusencia(prev, fd)
      if (!r) onClose()
      return r
    },
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="bg-surface-2/60 rounded-lg px-4 py-2 text-sm text-fg-muted">
        <span className="text-fg-soft">Empleado:</span> {empleado.apellido}, {empleado.nombre}
        <span className="ml-2 text-xs text-fg-soft">Valor hora: {formatCurrency(valorHora)}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Input label="Fecha" name="fecha" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Cantidad de días</label>
          <input
            type="number"
            step="0.5"
            min="0.5"
            max="31"
            value={dias}
            onChange={(e) => setDias(Math.max(0.5, Number(e.target.value)))}
            className="w-full px-3.5 py-2.5 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            placeholder="Ej: 1 o 0.5 (medio día)"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-fg-muted">Tipo de ausencia</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.keys(TIPO_AUSENCIA_LABEL) as TipoAusencia[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={cn(
                'px-3 py-2 rounded-lg border text-xs font-medium transition-colors',
                tipo === t
                  ? 'bg-red-600/20 border-red-500/50 text-danger'
                  : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg-muted'
              )}
            >
              {TIPO_AUSENCIA_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer">
        <input
          type="checkbox"
          name="justificada"
          className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2"
        />
        Marcar como justificada (solo informativo, no afecta el descuento)
      </label>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-200">
        <strong>Esto es solo registro / historial.</strong> El descuento real se aplica al generar la nómina del mes,
        donde cargás la cantidad de horas faltadas. Equivalente estimado: {dias} día × 8 hs × {formatCurrency(valorHora)} = <span className="font-mono">{formatCurrency(descuentoEstimado)}</span>
      </div>

      <Textarea label="Notas (opcional)" name="notas" placeholder="Motivo, contexto..." rows={2} />

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending} variant="danger">
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Registrar ausencia
        </Button>
      </div>
    </form>
  )
}

// ─── HistorialPanel ───────────────────────────────────────────────────────────

function HistorialPanel({ eventos }: { eventos: EventoEmpleado[] }) {
  const [isPending, startTransition] = useTransition()

  if (eventos.length === 0) {
    return (
      <div className="text-center py-6 text-fg-soft text-xs">
        Sin eventos registrados
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {eventos.map((ev) => (
        <div
          key={ev.id}
          className="bg-surface-2/40 border border-border-strong/40 rounded-lg p-3 group"
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <span className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium',
                TIPO_EVENTO_COLOR[ev.tipo]
              )}>
                {TIPO_EVENTO_LABEL[ev.tipo]}
              </span>
              <span className="text-xs text-fg-soft">{formatDate(ev.fecha)}</span>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (!confirm('¿Eliminar este evento del historial?')) return
                startTransition(() => deleteEvento(ev.id))
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-surface-2 text-fg-soft hover:text-red-700 transition-all"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <p className="text-sm text-fg-muted font-medium">{ev.titulo}</p>
          {ev.descripcion && (
            <p className="text-xs text-fg-muted mt-1 whitespace-pre-line">{ev.descripcion}</p>
          )}
          {ev.tipo === 'AJUSTE_SALARIAL' && ev.sueldo_anterior && ev.sueldo_nuevo && (
            <div className="mt-2 flex items-center gap-2 text-xs font-mono">
              <span className="text-fg-soft">{formatCurrency(ev.sueldo_anterior)}</span>
              <span className="text-fg-muted">→</span>
              <span className="text-green-700">{formatCurrency(ev.sueldo_nuevo)}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── EmpleadoCard ─────────────────────────────────────────────────────────────

function EmpleadoCard({
  emp,
  eventos,
  horasExtras,
  ausencias,
  onEdit,
  onAddEvento,
  onAddAjuste,
  onAddHoraExtra,
  onAddAusencia,
}: {
  emp: Empleado
  eventos: EventoEmpleado[]
  horasExtras: HoraExtraRegistro[]
  ausencias: AusenciaRegistro[]
  onEdit: () => void
  onAddEvento: () => void
  onAddAjuste: () => void
  onAddHoraExtra: () => void
  onAddAusencia: () => void
}) {
  const [historialOpen, setHistorialOpen] = useState(false)
  const [horasOpen, setHorasOpen] = useState(false)
  const [ausenciasOpen, setAusenciasOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const eventosEmp = eventos.filter((e) => e.empleado_id === emp.id)
  const horasEmp = horasExtras.filter((h) => h.empleado_id === emp.id)
  const horasNoIncluidas = horasEmp.filter((h) => !h.incluido_en_nomina_id)
  // Historial de faltas (informativo — el descuento se aplica en la nómina del mes)
  const ausenciasEmp = ausencias.filter((a) => a.empleado_id === emp.id)
  const ausenciasTotalDias = ausenciasEmp.reduce((s, a) => s + Number(a.dias), 0)
  const horasNoIncluidasTotal = horasNoIncluidas.reduce((s, h) => s + h.cantidad, 0)

  return (
    <div className={cn(
      'bg-surface border rounded-xl p-5',
      !emp.activo ? 'border-border opacity-60' : 'border-border'
    )}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-fg">{emp.nombre} {emp.apellido}</p>
          {emp.dni && <p className="text-xs text-fg-soft">DNI {emp.dni}</p>}
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          <Badge variant={emp.tipo_empleado === 'BLANCO' ? 'info' : 'warning'}>
            {emp.tipo_empleado}
          </Badge>
          {emp.corresponde_aguinaldo && <Badge variant="success">SAC</Badge>}
          {!emp.activo && <Badge variant="danger">Inactivo</Badge>}
        </div>
      </div>

      <div className="space-y-1.5 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-fg-muted">Sueldo básico</span>
          <span className="font-mono text-fg">{formatCurrency(emp.sueldo_basico)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-fg-muted">Valor hora ({emp.horas_mensuales}h)</span>
          <span className="font-mono text-fg">{formatCurrency(emp.valor_hora)}</span>
        </div>
        {(emp.horas_acuerdo_negro ?? 0) > 0 && (
          <div className="flex justify-between text-sm bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1">
            <span className="text-amber-700 text-xs flex items-center gap-1">
              <BadgeCheck className="w-3 h-3" />
              Acuerdo negro: {emp.horas_acuerdo_negro} hs/mes
            </span>
            <span className="font-mono text-amber-700 text-xs">+{formatCurrency((emp.horas_acuerdo_negro ?? 0) * emp.valor_hora)}</span>
          </div>
        )}
        {emp.plus_negro_tipo && (emp.plus_negro_valor ?? 0) > 0 && (
          <div className="flex justify-between text-sm bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1">
            <span className="text-amber-700 text-xs flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Plus negro: {emp.plus_negro_tipo === 'PORCENTAJE' ? `${emp.plus_negro_valor}% s/oficial` : 'monto fijo'}
            </span>
            <span className="font-mono text-amber-700 text-xs">
              {emp.plus_negro_tipo === 'MONTO'
                ? `+${formatCurrency(emp.plus_negro_valor ?? 0)}`
                : `≈ +${formatCurrency((emp.sueldo_basico * (emp.plus_negro_valor ?? 0)) / 100)}`}
            </span>
          </div>
        )}
        {emp.tipo_empleado === 'BLANCO' && emp.banco && (
          <div className="flex justify-between text-sm">
            <span className="text-fg-muted">Banco</span>
            <span className="text-fg-muted">{emp.banco}</span>
          </div>
        )}
        {emp.tipo_empleado === 'NEGRO' && (
          <div className="flex justify-between text-sm">
            <span className="text-fg-muted">Pago</span>
            <span className="text-fg-muted">{emp.metodo_pago ?? '—'}</span>
          </div>
        )}
        {emp.fecha_ingreso && (
          <div className="flex justify-between text-sm">
            <span className="text-fg-muted">Ingreso</span>
            <span className="text-fg-muted">{formatDate(emp.fecha_ingreso)}</span>
          </div>
        )}
      </div>

      {(emp.email || emp.telefono) && (
        <div className="flex items-center gap-1.5 mb-3">
          {emp.email && (
            <a href={`mailto:${emp.email}`} className="p-1.5 rounded hover:bg-surface-2 text-fg-soft hover:text-fg-muted transition-colors">
              <Mail className="w-3.5 h-3.5" />
            </a>
          )}
          {emp.telefono && (
            <a href={`tel:${emp.telefono}`} className="p-1.5 rounded hover:bg-surface-2 text-fg-soft hover:text-fg-muted transition-colors">
              <Phone className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-1.5 pt-3 border-t border-border">
        <button
          type="button"
          onClick={onEdit}
          title="Editar datos"
          className="p-2 rounded-lg hover:bg-surface-2 text-fg-muted hover:text-fg transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <Button size="sm" variant="ghost" onClick={onAddHoraExtra} title="Cargar horas extras">
          <Clock className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onAddAusencia} title="Registrar ausencia / falta">
          <CalendarX className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onAddEvento} className="flex-1">
          <Calendar className="w-3.5 h-3.5" />
          Evento
        </Button>
        <Button size="sm" variant="ghost" onClick={onAddAjuste} className="flex-1">
          <TrendingUp className="w-3.5 h-3.5" />
          Ajuste
        </Button>
        <Button
          size="sm"
          variant={emp.activo ? 'danger' : 'success'}
          disabled={isPending}
          title={emp.activo ? 'Dar de baja' : 'Reactivar'}
          onClick={() => {
            const nombre = `${emp.nombre} ${emp.apellido ?? ''}`.trim()
            const msg = emp.activo
              ? `¿Dar de baja a ${nombre}? Deja de aparecer en el listado y en la nómina. Se puede revertir con "Mostrar inactivos".`
              : `¿Reactivar a ${nombre}? Vuelve al listado y a la nómina, y se borra su fecha de egreso.`
            if (!confirm(msg)) return
            startTransition(() => toggleEmpleadoActivo(emp.id, !emp.activo))
          }}
        >
          {emp.activo ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* Horas extras pendientes */}
      {horasNoIncluidas.length > 0 && (
        <button
          type="button"
          onClick={() => setHorasOpen(!horasOpen)}
          className="w-full mt-2 flex items-center justify-between px-3 py-2 rounded-lg bg-orange-500/10 hover:bg-orange-500/15 border border-orange-500/20 text-xs text-orange-600 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            HE pendientes: <span className="font-mono font-semibold">{horasNoIncluidasTotal}h</span>
            <span className="text-fg-soft">({horasNoIncluidas.length} registros)</span>
          </span>
          {horasOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      )}

      {horasOpen && horasNoIncluidas.length > 0 && (
        <div className="mt-2 space-y-1">
          {horasNoIncluidas.map((h) => (
            <HoraExtraRow key={h.id} he={h} valorHora={emp.valor_hora || (emp.sueldo_basico / (emp.horas_mensuales || 160))} />
          ))}
        </div>
      )}

      {/* Historial de faltas (informativo — descuentos se aplican desde nómina) */}
      {ausenciasEmp.length > 0 && (
        <button
          type="button"
          onClick={() => setAusenciasOpen(!ausenciasOpen)}
          className="w-full mt-2 flex items-center justify-between px-3 py-2 rounded-lg bg-surface-2/40 hover:bg-surface-2 border border-border-strong/40 text-xs text-fg-muted transition-colors"
        >
          <span className="flex items-center gap-2">
            <CalendarX className="w-3.5 h-3.5 text-fg-soft" />
            Historial de faltas: <span className="font-mono font-semibold text-fg-muted">{ausenciasTotalDias} día(s)</span>
            <span className="text-[10px] text-fg-muted">({ausenciasEmp.length} registros)</span>
          </span>
          {ausenciasOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      )}

      {ausenciasOpen && ausenciasEmp.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-fg-soft italic px-1 pb-1">
            Solo registro / historial. El descuento se aplica al generar la nómina del mes.
          </p>
          {ausenciasEmp.map((a) => (
            <AusenciaRow key={a.id} a={a} />
          ))}
        </div>
      )}

      {/* Historial */}
      <button
        type="button"
        onClick={() => setHistorialOpen(!historialOpen)}
        className="w-full mt-3 flex items-center justify-between px-3 py-2 rounded-lg bg-surface-2/40 hover:bg-surface-2 text-xs text-fg-muted transition-colors"
      >
        <span className="flex items-center gap-2">
          <History className="w-3.5 h-3.5" />
          Historial {eventosEmp.length > 0 && <span className="text-fg-soft">({eventosEmp.length})</span>}
        </span>
        {historialOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {historialOpen && (
        <div className="mt-2">
          <HistorialPanel eventos={eventosEmp} />
        </div>
      )}
    </div>
  )
}

// ─── EmpleadosClient ──────────────────────────────────────────────────────────

export function EmpleadosClient({
  empleados,
  eventos,
  horasExtras,
  ausencias,
}: {
  empleados: Empleado[]
  eventos: EventoEmpleado[]
  horasExtras: HoraExtraRegistro[]
  ausencias: AusenciaRegistro[]
}) {
  const [editEmp, setEditEmp] = useState<Empleado | undefined>()
  const [eventoEmp, setEventoEmp] = useState<Empleado | undefined>()
  const [ajusteEmp, setAjusteEmp] = useState<Empleado | undefined>()
  const [horaExtraEmp, setHoraExtraEmp] = useState<Empleado | undefined>()
  const [ausenciaEmp, setAusenciaEmp] = useState<Empleado | undefined>()
  const [createOpen, setCreateOpen] = useState(false)
  const [showInactivos, setShowInactivos] = useState(false)
  const [search, setSearch] = useState('')
  const [orden, setOrden] = useState<'alfabetico' | 'sueldo'>('alfabetico')

  const q = search.trim().toLowerCase()
  const filtered = (showInactivos ? empleados : empleados.filter((e) => e.activo))
    .filter((e) => !q || `${e.apellido ?? ''} ${e.nombre ?? ''} ${e.dni ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => orden === 'sueldo'
      ? Number(b.sueldo_basico ?? 0) - Number(a.sueldo_basico ?? 0)
      : `${a.apellido ?? ''} ${a.nombre ?? ''}`.toLowerCase().localeCompare(`${b.apellido ?? ''} ${b.nombre ?? ''}`.toLowerCase()))
  const activos = empleados.filter((e) => e.activo).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">Empleados</h1>
          <p className="text-sm text-fg-muted mt-0.5">{activos} activos · {empleados.length} total</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showInactivos}
              onChange={(e) => setShowInactivos(e.target.checked)}
              className="rounded"
            />
            Mostrar inactivos
          </label>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Nuevo empleado
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-fg-soft absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, apellido o DNI…"
            className="w-full pl-9 pr-9 py-2 bg-surface border border-border-strong rounded-lg text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-fg-soft hover:text-fg hover:bg-surface-2" title="Limpiar">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Select value={orden} onChange={(e) => setOrden(e.target.value as 'alfabetico' | 'sueldo')} className="w-48"
          options={[{ value: 'alfabetico', label: 'Orden: A → Z' }, { value: 'sueldo', label: 'Orden: sueldo ↓' }]} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-3 bg-surface border border-border rounded-xl p-12 text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-fg-muted" />
            <p className="text-fg-soft">No hay empleados cargados</p>
          </div>
        ) : (
          filtered.map((emp) => (
            <EmpleadoCard
              key={emp.id}
              emp={emp}
              eventos={eventos}
              horasExtras={horasExtras}
              ausencias={ausencias}
              onEdit={() => setEditEmp(emp)}
              onAddEvento={() => setEventoEmp(emp)}
              onAddAjuste={() => setAjusteEmp(emp)}
              onAddHoraExtra={() => setHoraExtraEmp(emp)}
              onAddAusencia={() => setAusenciaEmp(emp)}
            />
          ))
        )}
      </div>

      {/* Crear */}
      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nuevo empleado"
        className="max-w-xl"
      >
        <EmpleadoForm onClose={() => setCreateOpen(false)} />
      </Modal>

      {/* Editar */}
      {editEmp && (
        <Modal
          open={!!editEmp}
          onOpenChange={(o) => { if (!o) setEditEmp(undefined) }}
          title={`Editar empleado: ${editEmp.nombre} ${editEmp.apellido}`}
          className="max-w-xl"
        >
          <EmpleadoForm emp={editEmp} onClose={() => setEditEmp(undefined)} />
        </Modal>
      )}

      {/* Evento */}
      {eventoEmp && (
        <Modal
          open={!!eventoEmp}
          onOpenChange={(o) => { if (!o) setEventoEmp(undefined) }}
          title="Agregar evento / incidencia"
          className="max-w-md"
        >
          <EventoForm empleado={eventoEmp} onClose={() => setEventoEmp(undefined)} />
        </Modal>
      )}

      {/* Ajuste salarial */}
      {ajusteEmp && (
        <Modal
          open={!!ajusteEmp}
          onOpenChange={(o) => { if (!o) setAjusteEmp(undefined) }}
          title="Nuevo ajuste salarial"
          className="max-w-md"
        >
          <AjusteSalarialForm empleado={ajusteEmp} onClose={() => setAjusteEmp(undefined)} />
        </Modal>
      )}

      {/* Hora extra */}
      {horaExtraEmp && (
        <Modal
          open={!!horaExtraEmp}
          onOpenChange={(o) => { if (!o) setHoraExtraEmp(undefined) }}
          title="Cargar horas extras"
          className="max-w-md"
        >
          <HoraExtraForm empleado={horaExtraEmp} onClose={() => setHoraExtraEmp(undefined)} />
        </Modal>
      )}

      {/* Ausencia */}
      {ausenciaEmp && (
        <Modal
          open={!!ausenciaEmp}
          onOpenChange={(o) => { if (!o) setAusenciaEmp(undefined) }}
          title="Registrar ausencia / falta"
          className="max-w-md"
        >
          <AusenciaForm empleado={ausenciaEmp} onClose={() => setAusenciaEmp(undefined)} />
        </Modal>
      )}
    </div>
  )
}
