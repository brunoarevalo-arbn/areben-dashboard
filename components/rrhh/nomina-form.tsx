'use client'

import { useActionState, useState, useEffect, useMemo, useRef, type FormEvent } from 'react'
import { createNomina, updateNomina } from '@/app/actions/rrhh'
import type { ConfiguracionAporte, HoraExtraRegistro, NominaMensual } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Loader2, Calculator, Receipt, Clock, PiggyBank, BadgeCheck, CalendarX, Trash2, Plus,
} from 'lucide-react'
import type { EmpleadoBasico } from './nomina-client'

const PORCENTAJES_EXTRAS = [0, 30, 50, 100]

function calcular(args: {
  esBlanco: boolean
  sueldo_basico: number
  monto_recibo_oficial: number
  horas: number
  valor_hora: number
  horas_extras: number
  porcentaje_extras: number
  comida: number
  presentismo: number
  aguinaldo_pagado_de_caja: number
  aguinaldo_directo: number
  adicional_no_registrado: number
  ausencias_descuento: number
  bono_monto: number
  descuento_otro_monto: number
  aportes: ConfiguracionAporte[]
  tipoEmpleado: string
  aguinaldoProvisionado: number
}) {
  const {
    esBlanco, sueldo_basico, monto_recibo_oficial, horas, valor_hora,
    horas_extras, porcentaje_extras, comida, presentismo, aguinaldo_pagado_de_caja,
    aguinaldo_directo, adicional_no_registrado, ausencias_descuento, bono_monto, descuento_otro_monto,
    aportes, tipoEmpleado, aguinaldoProvisionado,
  } = args

  const basicoEfectivo = esBlanco && monto_recibo_oficial > 0 ? monto_recibo_oficial : sueldo_basico
  const extras_monto = horas_extras * valor_hora * (1 + porcentaje_extras / 100)

  // Subtotal: lo que efectivamente se paga al empleado este mes.
  const subtotal = basicoEfectivo + extras_monto + comida
    + presentismo + aguinaldo_pagado_de_caja + aguinaldo_directo + adicional_no_registrado - ausencias_descuento
    + bono_monto - descuento_otro_monto

  // Aportes patronales (cargas sociales que paga la empresa) sobre el bruto
  const baseAportesPatronales = esBlanco && monto_recibo_oficial > 0
    ? monto_recibo_oficial
    : basicoEfectivo

  let aportes_patronales = 0
  for (const a of aportes) {
    if (!a.es_patronal) continue
    if (a.aplicable_a !== 'AMBOS' && a.aplicable_a !== tipoEmpleado) continue
    const monto = a.tipo === 'PORCENTAJE' ? (baseAportesPatronales * a.valor) / 100 : a.valor
    aportes_patronales += monto
  }

  // Neto = subtotal (sin descontar aportes empleado). El recibo oficial ya viene con neto.
  const neto = subtotal
  const costo_empresa = neto + aportes_patronales + aguinaldoProvisionado

  const valor_hora_real = horas > 0 && monto_recibo_oficial > 0
    ? monto_recibo_oficial / horas
    : valor_hora

  return {
    basicoEfectivo, subtotal, aportes_patronales, neto, costo_empresa,
    extras_monto, valor_hora_real, baseAportesPatronales,
  }
}

export function NominaForm({
  empleados,
  aportes,
  mes,
  nominasExistentes,
  horasExtrasMes,
  registrosExtras,
  nomina,
  onClose,
}: {
  empleados: EmpleadoBasico[]
  aportes: ConfiguracionAporte[]
  mes: string
  nominasExistentes: string[]
  horasExtrasMes: HoraExtraRegistro[]
  registrosExtras: HoraExtraRegistro[]
  cajaAguinaldos: Record<string, number>
  /** Si se pasa, el form opera en modo EDICIÓN sobre esta nómina */
  nomina?: NominaMensual
  onClose: () => void
}) {
  const editing = !!nomina
  const disponibles = editing
    ? empleados.filter((e) => e.id === nomina!.empleado_id)
    : empleados.filter((e) => !nominasExistentes.includes(e.id))
  const [empleadoId, setEmpleadoId] = useState(nomina?.empleado_id ?? disponibles[0]?.id ?? '')
  const empleado = empleados.find((e) => e.id === empleadoId)
  const esBlanco = empleado?.tipo_empleado === 'BLANCO'
  const valorHoraDe = (e: EmpleadoBasico) =>
    e.valor_hora || (e.horas_mensuales > 0 ? e.sueldo_basico / e.horas_mensuales : 0)

  // Suma de horas extras registradas del mes para este empleado
  const horasExtrasEmp = useMemo(() => {
    if (!empleado) return { cantidad: 0, registros: [], porcentajePromedio: 50 }
    const hs = horasExtrasMes.filter((h) => h.empleado_id === empleado.id)
    const cantidad = hs.reduce((s, h) => s + Number(h.cantidad), 0)
    // Promedio PONDERADO por horas: con % distintos (ej. unas al 50% y otras al 100%),
    // aplicar este promedio al total de horas da el monto EXACTO, aunque la nómina
    // guarde un solo porcentaje. (Un promedio simple daría mal.)
    const pctProm = cantidad > 0
      ? hs.reduce((s, h) => s + Number(h.cantidad) * Number(h.porcentaje), 0) / cantidad
      : 50
    return { cantidad, registros: hs, porcentajePromedio: Math.round(pctProm * 100) / 100 }
  }, [empleado, horasExtrasMes])

  // Registros de horas extras del empleado para esta nómina: en edición = los ya vinculados a esta
  // nómina; en alta = los del mes aún sin vincular. Son la fuente de las líneas editables.
  const registrosDelEmpleado = useMemo(() => {
    if (!empleado) return [] as HoraExtraRegistro[]
    return registrosExtras.filter((r) =>
      r.empleado_id === empleado.id &&
      (editing ? r.incluido_en_nomina_id === nomina!.id : r.incluido_en_nomina_id == null)
    )
  }, [empleado, registrosExtras, editing, nomina])

  // Líneas iniciales: desde los registros; si es una nómina vieja en edición (tiene horas extras
  // pero sin registros individuales), sembrar una línea con el agregado para no perderlas.
  const lineasIniciales = (): { id: string | null; cantidad: number; porcentaje: number }[] => {
    const desdeRegistros = registrosDelEmpleado.map((r) => ({ id: r.id, cantidad: Number(r.cantidad), porcentaje: Number(r.porcentaje) }))
    if (desdeRegistros.length > 0) return desdeRegistros
    if (editing && (nomina?.horas_extras ?? 0) > 0) {
      return [{ id: null, cantidad: Number(nomina!.horas_extras), porcentaje: Number(nomina!.porcentaje_extras ?? 50) }]
    }
    return []
  }

  // Líneas de horas extras editables (cada una hs + %). Al guardar se reconcilian con los registros.
  const [extrasLineas, setExtrasLineas] = useState<{ id: string | null; cantidad: number; porcentaje: number }[]>(lineasIniciales)
  const extrasTotalHoras = extrasLineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0)
  const extrasPctPonderado = extrasTotalHoras > 0
    ? Math.round((extrasLineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.porcentaje) || 0), 0) / extrasTotalHoras) * 100) / 100
    : 0

  const [vals, setVals] = useState({
    sueldo_basico: nomina?.sueldo_basico ?? empleado?.sueldo_basico ?? 0,
    horas: nomina?.horas_trabajadas ?? empleado?.horas_mensuales ?? 160,
    valor_hora: nomina?.valor_hora ?? (empleado ? valorHoraDe(empleado) : 0),
    horas_extras: nomina?.horas_extras ?? 0,
    porcentaje_extras: nomina?.porcentaje_extras ?? 50,
    comida: nomina?.comida ?? 0,
    asistencia_completa: nomina?.asistencia_completa ?? false,
    aguinaldo_pagado_de_caja: nomina?.aguinaldo_pagado_de_caja ?? 0,
    aguinaldo_directo: nomina?.aguinaldo_directo ?? 0,
    monto_recibo_oficial: nomina?.monto_recibo_oficial ?? 0,
    adicional_no_registrado: nomina?.adicional_no_registrado ?? 0,
    ausencias_horas: nomina?.ausencias_horas ?? 0,
    ausencias_motivo: nomina?.ausencias_motivo ?? '',
    bono_monto: nomina?.bono_monto ?? 0,
    bono_concepto: (nomina?.bono_concepto as 'BONO' | 'PREMIO' | 'COMISION' | 'OTRO' | null) ?? null,
    bono_descripcion: nomina?.bono_descripcion ?? '',
    descuento_otro_monto: nomina?.descuento_otro_monto ?? 0,
    descuento_otro_concepto: (nomina?.descuento_otro_concepto as 'MULTA' | 'DEVOLUCION_ADELANTO' | 'OTRO' | null) ?? null,
    descuento_otro_descripcion: nomina?.descuento_otro_descripcion ?? '',
  })

  // Fecha programada de pago: por default último día del mes de la nómina
  const [fechaProgramada, setFechaProgramada] = useState(() => {
    if (nomina?.fecha_programada_pago) return nomina.fecha_programada_pago
    const [y, m] = mes.split('-').map(Number)
    return new Date(y, m, 0).toISOString().split('T')[0]
  })

  useEffect(() => {
    if (!empleado || editing) return // En edit mode, no resetear los valores
    const valorH = valorHoraDe(empleado)
    const reciboOficial = empleado.tipo_empleado === 'BLANCO' ? empleado.sueldo_basico : 0
    // Pre-llenar adicional_no_registrado: acuerdo de horas + plus salarial fijo
    const acuerdoHoras = (empleado.horas_acuerdo_negro ?? 0) * valorH
    const plusValor = empleado.plus_negro_valor ?? 0
    const plus = empleado.plus_negro_tipo === 'MONTO'
      ? plusValor
      : empleado.plus_negro_tipo === 'PORCENTAJE'
        ? (reciboOficial * plusValor) / 100
        : 0
    const adicionalTotal = Math.round((acuerdoHoras + plus) * 100) / 100
    setVals({
      sueldo_basico: empleado.sueldo_basico,
      valor_hora: valorH,
      horas: empleado.horas_mensuales,
      horas_extras: horasExtrasEmp.cantidad,
      porcentaje_extras: horasExtrasEmp.porcentajePromedio || 50,
      comida: empleado.tipo_empleado === 'NEGRO' ? empleado.monto_comidas : 0,
      asistencia_completa: false,
      aguinaldo_pagado_de_caja: 0,
      aguinaldo_directo: 0,
      monto_recibo_oficial: reciboOficial,
      adicional_no_registrado: adicionalTotal,
      ausencias_horas: 0,
      ausencias_motivo: '',
      bono_monto: 0,
      bono_concepto: null,
      bono_descripcion: '',
      descuento_otro_monto: 0,
      descuento_otro_concepto: null,
      descuento_otro_descripcion: '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleadoId, horasExtrasEmp.cantidad])

  // Re-inicializar las líneas de horas extras al cambiar de empleado (desde sus registros o el agregado).
  useEffect(() => {
    setExtrasLineas(lineasIniciales())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleadoId])

  // Mantener el agregado (horas_extras + porcentaje_extras ponderado) en sync con las líneas.
  useEffect(() => {
    setVals((v) => ({ ...v, horas_extras: extrasTotalHoras, porcentaje_extras: extrasPctPonderado || v.porcentaje_extras }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrasTotalHoras, extrasPctPonderado])

  // Recomputa valor_hora y adicional_no_registrado a partir del oficial/básico/horas.
  // Se llama desde los onChange para mantener todo sincronizado en cascada.
  function recomputarDerivados(nuevos: { oficial?: number; basico?: number; horas?: number }) {
    const oficial = nuevos.oficial ?? vals.monto_recibo_oficial
    const basico = nuevos.basico ?? vals.sueldo_basico
    const horas = nuevos.horas ?? vals.horas

    const baseValorHora = esBlanco && oficial > 0 ? oficial : basico
    const valorH = horas > 0 ? Math.round((baseValorHora / horas) * 100) / 100 : 0

    const acuerdo = (empleado?.horas_acuerdo_negro ?? 0) * valorH
    const plusV = empleado?.plus_negro_valor ?? 0
    const plus = empleado?.plus_negro_tipo === 'MONTO'
      ? plusV
      : empleado?.plus_negro_tipo === 'PORCENTAJE'
        ? (oficial * plusV) / 100
        : 0
    const adicionalTotal = Math.round((acuerdo + plus) * 100) / 100

    return { valor_hora: valorH, adicional_no_registrado: adicionalTotal }
  }

  // Básico efectivo (recibo oficial para BLANCO, sueldo_basico para NEGRO)
  const basicoEfectivoActual = esBlanco && vals.monto_recibo_oficial > 0 ? vals.monto_recibo_oficial : vals.sueldo_basico

  // ¿El sueldo base de esta nómina difiere del de la ficha del empleado?
  // (para BLANCO la ficha guarda el neto del recibo; para NEGRO el sueldo_basico)
  const sueldoFichaActual = empleado?.sueldo_basico ?? 0
  const sueldoNominaBase = esBlanco ? vals.monto_recibo_oficial : vals.sueldo_basico
  const difiereDeFicha = !!empleado && sueldoNominaBase > 0
    && Math.abs(sueldoNominaBase - sueldoFichaActual) > 0.5

  // Base del aguinaldo = sueldo FIJO mensual (oficial + acuerdo fijo en negro).
  // No incluye horas extras reales ni comida/presentismo.
  const baseAguinaldo = basicoEfectivoActual + vals.adicional_no_registrado
  const aguinaldoProvisionado = empleado?.corresponde_aguinaldo
    ? Math.round(baseAguinaldo * empleado.porcentaje_aguinaldo) / 100
    : 0

  const presentismoMonto = !esBlanco && vals.asistencia_completa && empleado
    ? Math.round(basicoEfectivoActual * empleado.presentismo_pct) / 100
    : 0

  const calc = calcular({
    esBlanco: !!esBlanco,
    sueldo_basico: vals.sueldo_basico,
    monto_recibo_oficial: vals.monto_recibo_oficial,
    horas: vals.horas,
    valor_hora: vals.valor_hora,
    horas_extras: vals.horas_extras,
    porcentaje_extras: vals.porcentaje_extras,
    comida: vals.comida,
    presentismo: presentismoMonto,
    aguinaldo_pagado_de_caja: vals.aguinaldo_pagado_de_caja,
    aguinaldo_directo: vals.aguinaldo_directo,
    adicional_no_registrado: vals.adicional_no_registrado,
    ausencias_descuento: vals.ausencias_horas * vals.valor_hora,
    bono_monto: vals.bono_monto,
    descuento_otro_monto: vals.descuento_otro_monto,
    aportes,
    tipoEmpleado: empleado?.tipo_empleado ?? 'NEGRO',
    aguinaldoProvisionado,
  })

  const [error, action, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const res = editing
        ? await updateNomina(nomina!.id, prev, fd)
        : await createNomina(prev, fd)
      if (!res) onClose()
      return res
    },
    null
  )

  // Confirmación "¿este sueldo pasa a la ficha?" cuando el monto difiere de la ficha.
  const formRef = useRef<HTMLFormElement>(null)
  const fichaRef = useRef<HTMLInputElement>(null)
  const decididoRef = useRef(false)
  const [preguntarFicha, setPreguntarFicha] = useState(false)

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (difiereDeFicha && !decididoRef.current) {
      e.preventDefault()
      setPreguntarFicha(true)
      return
    }
    decididoRef.current = false
  }

  function decidirFicha(actualizar: boolean) {
    if (fichaRef.current) fichaRef.current.value = actualizar ? 'true' : 'false'
    decididoRef.current = true
    setPreguntarFicha(false)
    formRef.current?.requestSubmit()
  }

  if (disponibles.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-fg-muted">Todos los empleados ya tienen nómina para este mes.</p>
        <Button className="mt-4" onClick={onClose} variant="secondary">Cerrar</Button>
      </div>
    )
  }

  return (
    <form ref={formRef} action={action} onSubmit={handleSubmit} className="space-y-4">
      <input ref={fichaRef} type="hidden" name="actualizar_sueldo_ficha" defaultValue="false" />
      <input type="hidden" name="mes" value={mes} />
      <input type="hidden" name="fecha_programada_pago" value={fechaProgramada} />
      <input type="hidden" name="porcentaje_extras" value={vals.porcentaje_extras} />
      <input type="hidden" name="monto_recibo_oficial" value={vals.monto_recibo_oficial} />
      <input type="hidden" name="adicional_no_registrado" value={vals.adicional_no_registrado} />
      <input type="hidden" name="asistencia_completa" value={vals.asistencia_completa ? 'true' : 'false'} />
      <input type="hidden" name="presentismo_monto" value={presentismoMonto} />
      <input type="hidden" name="aguinaldo" value={vals.aguinaldo_pagado_de_caja} />
      <input type="hidden" name="aguinaldo_pagado_de_caja" value={vals.aguinaldo_pagado_de_caja} />
      <input type="hidden" name="aguinaldo_directo" value={vals.aguinaldo_directo} />
      {/* sueldo_basico: el input visible solo aparece para NEGRO; para BLANCO mandamos hidden */}
      {esBlanco && <input type="hidden" name="sueldo_basico" value={vals.sueldo_basico} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-fg-muted">Fecha programada de pago *</label>
          <input
            type="date"
            value={fechaProgramada}
            onChange={(e) => setFechaProgramada(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 bg-surface-2 border border-border-strong rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
          <p className="text-xs text-fg-soft">Aparecerá en Pendientes hasta que se confirme el pago</p>
        </div>
      </div>

      {/* BLANCO: recibo oficial (neto) + acuerdo en negro */}
      {esBlanco ? (
        <div className="bg-blue-500/5 border border-blue-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-blue-700 text-sm font-medium">
            <Receipt className="w-4 h-4" />
            Recibo oficial + acuerdo en negro
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-fg-muted">Neto del recibo oficial</label>
              <input
                type="number"
                step="0.01"
                value={vals.monto_recibo_oficial || ''}
                onChange={(e) => {
                  const nuevo = Number(e.target.value)
                  const derived = recomputarDerivados({ oficial: nuevo })
                  setVals((v) => ({ ...v, monto_recibo_oficial: nuevo, ...derived }))
                }}
                className="w-full px-3 py-2 bg-surface-2 border border-border-strong rounded-lg text-blue-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="0.00"
              />
              <p className="text-xs text-fg-soft">El neto del recibo. Recalcula valor hora y adicional automáticamente.</p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-fg-muted flex items-center justify-between">
                <span>Adicional fijo en negro</span>
                {empleado && (empleado.horas_acuerdo_negro ?? 0) > 0 && (
                  <span className="text-[10px] text-amber-700">acuerdo: {empleado.horas_acuerdo_negro} hs</span>
                )}
              </label>
              <input
                type="number"
                step="0.01"
                value={vals.adicional_no_registrado || ''}
                onChange={(e) => setVals((v) => ({ ...v, adicional_no_registrado: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-surface-2 border border-border-strong rounded-lg text-amber-700 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                placeholder="0.00"
              />
              <p className="text-xs text-fg-soft">
                {empleado && ((empleado.horas_acuerdo_negro ?? 0) > 0 || (empleado.plus_negro_tipo && (empleado.plus_negro_valor ?? 0) > 0))
                  ? 'Pre-llenado desde el acuerdo + plus del empleado. Suma al aguinaldo.'
                  : 'Si hay parte fija en negro este mes (suma al aguinaldo).'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <Input
          label="Sueldo básico (NEGRO)"
          name="sueldo_basico"
          type="number" step="0.01"
          value={vals.sueldo_basico}
          onChange={(e) => {
            const nuevo = Number(e.target.value)
            const derived = recomputarDerivados({ basico: nuevo })
            setVals((v) => ({ ...v, sueldo_basico: nuevo, ...derived }))
          }}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input
          label="Horas trabajadas"
          name="horas_trabajadas"
          type="number" step="0.5"
          value={vals.horas}
          onChange={(e) => {
            const nuevo = Number(e.target.value)
            const derived = recomputarDerivados({ horas: nuevo })
            setVals((v) => ({ ...v, horas: nuevo, ...derived }))
          }}
        />
        <Input
          label="Valor hora"
          name="valor_hora"
          type="number" step="0.01"
          value={vals.valor_hora}
          onChange={(e) => setVals((v) => ({ ...v, valor_hora: Number(e.target.value) }))}
        />
        <Input
          label={esBlanco ? 'Comida' : 'Comidas (acuerdo)'}
          name="comida"
          type="number" step="0.01"
          value={vals.comida}
          onChange={(e) => setVals((v) => ({ ...v, comida: Number(e.target.value) }))}
        />
      </div>

      {/* Aguinaldo (SAC) a pagar directo este mes — no sale de la caja */}
      {empleado?.corresponde_aguinaldo && (
        <div className={cn(
          'border rounded-xl p-4 space-y-2',
          vals.aguinaldo_directo > 0 ? 'bg-teal-500/10 border-teal-500/40' : 'bg-surface-2/40 border-border-strong/40'
        )}>
          <label className="text-sm font-medium text-fg-muted flex items-center gap-2">
            <PiggyBank className={cn('w-4 h-4', vals.aguinaldo_directo > 0 ? 'text-teal-700' : 'text-fg-soft')} />
            Aguinaldo (SAC) a pagar este mes
            <span className="text-xs text-fg-soft font-normal">(se paga ahora, no sale de la caja)</span>
          </label>
          <Input
            label="Monto del aguinaldo"
            name="aguinaldo_directo_visible"
            type="number" step="0.01" min="0"
            value={vals.aguinaldo_directo}
            onChange={(e) => setVals((v) => ({ ...v, aguinaldo_directo: Math.max(0, Number(e.target.value)) }))}
            placeholder="0"
          />
          <p className="text-[11px] text-fg-soft">
            Se suma al neto a pagar, genera el gasto de este mes y aparece como concepto propio en el recibo.
          </p>
        </div>
      )}

      {/* Horas extras — varias líneas, cada una con su propio % */}
      <div className="bg-surface-2/60 border border-border-strong/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-fg-muted flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Horas extras
          </label>
          {extrasTotalHoras > 0 && (
            <span className="text-xs text-fg-soft">{extrasTotalHoras} hs · prom. {extrasPctPonderado}%</span>
          )}
        </div>

        {extrasLineas.length === 0 && (
          <p className="text-xs text-fg-soft">Sin horas extras. Agregá una línea si corresponde (podés poner varias a distinto %).</p>
        )}

        <div className="space-y-2">
          {extrasLineas.map((linea, idx) => {
            const setLinea = (patch: Partial<typeof linea>) =>
              setExtrasLineas((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
            const montoLinea = (Number(linea.cantidad) || 0) * vals.valor_hora * (1 + (Number(linea.porcentaje) || 0) / 100)
            return (
              <div key={idx} className="flex items-center gap-2 flex-wrap bg-surface-2/40 rounded-lg p-2">
                <input
                  type="number" step="0.5" min="0"
                  value={linea.cantidad || ''}
                  onChange={(e) => setLinea({ cantidad: Number(e.target.value) })}
                  placeholder="hs"
                  className="w-20 px-2 py-1 bg-surface-2 border border-border-strong rounded text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-xs text-fg-soft">hs al</span>
                <div className="flex items-center gap-1 flex-wrap">
                  {PORCENTAJES_EXTRAS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setLinea({ porcentaje: p })}
                      className={cn(
                        'px-2 py-1 rounded text-xs font-medium transition-colors',
                        Number(linea.porcentaje) === p
                          ? 'bg-orange-500/20 text-orange-600 border border-orange-500/40'
                          : 'bg-surface-2 text-fg-muted border border-[#c8c0b0]'
                      )}
                    >
                      {p}%
                    </button>
                  ))}
                  <input
                    type="number" min="0" max="200"
                    value={linea.porcentaje}
                    onChange={(e) => setLinea({ porcentaje: Number(e.target.value) })}
                    className="w-16 px-2 py-1 bg-surface-2 border border-border-strong rounded text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    title="Podés escribir cualquier porcentaje"
                  />
                  <span className="text-xs text-fg-soft">%</span>
                </div>
                <span className="ml-auto font-mono text-sm text-amber-700">{formatCurrency(montoLinea)}</span>
                <button
                  type="button"
                  onClick={() => setExtrasLineas((ls) => ls.filter((_, i) => i !== idx))}
                  className="text-red-700 hover:text-red-800 p-1"
                  title="Quitar línea"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setExtrasLineas((ls) => [...ls, { id: null, cantidad: 0, porcentaje: 50 }])}
            className="text-xs font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar línea
          </button>
          {extrasTotalHoras > 0 && (
            <span className="font-mono text-base text-amber-700 font-semibold">{formatCurrency(calc.extras_monto)}</span>
          )}
        </div>
      </div>

      {/* Detalle de líneas para reconciliar los registros en el server */}
      <input type="hidden" name="horas_extras" value={extrasTotalHoras} />
      <input type="hidden" name="extras_lineas" value={JSON.stringify(extrasLineas)} />

      {/* Faltas / ausencias — input directo */}
      {empleado && (
        <div className={cn(
          'border rounded-xl p-4 space-y-3',
          vals.ausencias_horas > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-surface-2/40 border-border-strong/40'
        )}>
          <label className="text-sm font-medium text-fg-muted flex items-center gap-2">
            <CalendarX className={cn('w-4 h-4', vals.ausencias_horas > 0 ? 'text-red-700' : 'text-fg-soft')} />
            Faltas / ausencias del mes
            <span className="text-xs text-fg-soft font-normal">(opcional)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Cantidad de horas faltadas"
              name="ausencias_horas"
              type="number"
              step="0.5"
              min="0"
              value={vals.ausencias_horas}
              onChange={(e) => setVals((v) => ({ ...v, ausencias_horas: Math.max(0, Number(e.target.value)) }))}
              placeholder="0"
            />
            <Input
              label="Motivo (opcional)"
              name="ausencias_motivo"
              value={vals.ausencias_motivo}
              onChange={(e) => setVals((v) => ({ ...v, ausencias_motivo: e.target.value }))}
              placeholder="Falta sin aviso, licencia, etc."
            />
          </div>
          {vals.ausencias_horas > 0 && (
            <div className="bg-surface/40 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
              <span className="text-fg-muted">
                {vals.ausencias_horas} hs × {formatCurrency(vals.valor_hora)}
                <span className="text-fg-soft ml-2">≈ {(vals.ausencias_horas / 8).toFixed(2)} día(s)</span>
              </span>
              <span className="font-mono text-red-700 font-semibold">
                −{formatCurrency(vals.ausencias_horas * vals.valor_hora)}
              </span>
            </div>
          )}
          <p className="text-[11px] text-fg-soft pt-1 border-t border-border-strong/40">
            En <strong>RR.HH. → Empleados</strong> podés llevar el historial de faltas por fecha (informativo).
            El descuento real se aplica acá, en la nómina del mes.
          </p>
        </div>
      )}

      {/* Bono / Premio / Comisión (puntual) */}
      {empleado && (
        <div className={cn(
          'border rounded-xl p-4 space-y-3',
          vals.bono_monto > 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-surface-2/40 border-border-strong/40'
        )}>
          <label className="text-sm font-medium text-fg-muted flex items-center gap-2">
            <PiggyBank className={cn('w-4 h-4', vals.bono_monto > 0 ? 'text-green-700' : 'text-fg-soft')} />
            Bono / Premio / Comisión
            <span className="text-xs text-fg-soft font-normal">(puntual — no afecta aguinaldo)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Concepto"
              value={vals.bono_concepto ?? ''}
              onChange={(e) => setVals((v) => ({ ...v, bono_concepto: (e.target.value || null) as typeof vals.bono_concepto }))}
              options={[
                { value: '', label: '— Sin bono —' },
                { value: 'BONO', label: 'Bono' },
                { value: 'PREMIO', label: 'Premio' },
                { value: 'COMISION', label: 'Comisión' },
                { value: 'OTRO', label: 'Otro' },
              ]}
            />
            <Input
              label="Monto"
              name="bono_monto"
              type="number" step="0.01" min="0"
              value={vals.bono_monto}
              onChange={(e) => setVals((v) => ({ ...v, bono_monto: Math.max(0, Number(e.target.value)) }))}
              placeholder="0"
            />
            <Input
              label="Detalle (opcional)"
              name="bono_descripcion"
              value={vals.bono_descripcion}
              onChange={(e) => setVals((v) => ({ ...v, bono_descripcion: e.target.value }))}
              placeholder="Cumplió objetivo, etc."
            />
          </div>
          {vals.bono_monto > 0 && (
            <div className="bg-surface/40 rounded-lg px-3 py-2 text-xs text-fg-muted flex items-center justify-between">
              <span>{vals.bono_concepto ? `${vals.bono_concepto.toLowerCase()}` : 'Bono'} este mes (no afecta aguinaldo)</span>
              <span className="font-mono text-green-700 font-semibold">+{formatCurrency(vals.bono_monto)}</span>
            </div>
          )}
        </div>
      )}

      {/* Otro descuento puntual (multa, devolución, etc.) */}
      {empleado && (
        <div className={cn(
          'border rounded-xl p-4 space-y-3',
          vals.descuento_otro_monto > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-surface-2/40 border-border-strong/40'
        )}>
          <label className="text-sm font-medium text-fg-muted flex items-center gap-2">
            <CalendarX className={cn('w-4 h-4', vals.descuento_otro_monto > 0 ? 'text-red-700' : 'text-fg-soft')} />
            Otro descuento puntual
            <span className="text-xs text-fg-soft font-normal">(multa, devolución de adelanto, etc.)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Concepto"
              value={vals.descuento_otro_concepto ?? ''}
              onChange={(e) => setVals((v) => ({ ...v, descuento_otro_concepto: (e.target.value || null) as typeof vals.descuento_otro_concepto }))}
              options={[
                { value: '', label: '— Sin descuento —' },
                { value: 'MULTA', label: 'Multa' },
                { value: 'DEVOLUCION_ADELANTO', label: 'Devolución de adelanto' },
                { value: 'OTRO', label: 'Otro' },
              ]}
            />
            <Input
              label="Monto"
              name="descuento_otro_monto"
              type="number" step="0.01" min="0"
              value={vals.descuento_otro_monto}
              onChange={(e) => setVals((v) => ({ ...v, descuento_otro_monto: Math.max(0, Number(e.target.value)) }))}
              placeholder="0"
            />
            <Input
              label="Detalle (opcional)"
              name="descuento_otro_descripcion"
              value={vals.descuento_otro_descripcion}
              onChange={(e) => setVals((v) => ({ ...v, descuento_otro_descripcion: e.target.value }))}
              placeholder="Motivo del descuento"
            />
          </div>
          {vals.descuento_otro_monto > 0 && (
            <div className="bg-surface/40 rounded-lg px-3 py-2 text-xs text-fg-muted flex items-center justify-between">
              <span>{vals.descuento_otro_concepto ? vals.descuento_otro_concepto.replace('_', ' ').toLowerCase() : 'Descuento'} este mes</span>
              <span className="font-mono text-red-700 font-semibold">−{formatCurrency(vals.descuento_otro_monto)}</span>
            </div>
          )}
        </div>
      )}

      {/* Presentismo (solo NEGRO) */}
      {!esBlanco && empleado && empleado.presentismo_pct > 0 && (
        <div className="bg-green-500/5 border border-green-500/30 rounded-xl p-3 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={vals.asistencia_completa}
              onChange={(e) => setVals((v) => ({ ...v, asistencia_completa: e.target.checked }))}
              className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2"
            />
            <BadgeCheck className="w-4 h-4 text-green-700" />
            <span className="text-sm text-fg-muted">Asistencia 100% — sumar presentismo ({empleado.presentismo_pct}%)</span>
          </label>
          <span className="font-mono text-sm text-green-700 font-semibold">
            {vals.asistencia_completa ? '+' + formatCurrency(presentismoMonto) : '—'}
          </span>
        </div>
      )}

      <div className="bg-surface-2 rounded-xl p-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-fg-muted mb-3">
          <Calculator className="w-4 h-4" />
          <span className="font-medium text-fg-muted">Cálculo automático</span>
        </div>
        {[
          ...(vals.ausencias_horas > 0 ? [{ label: `Faltas (${vals.ausencias_horas} hs)`, value: -(vals.ausencias_horas * vals.valor_hora), color: 'text-red-700' }] : []),
          ...(vals.bono_monto > 0 ? [{ label: vals.bono_concepto ? `${vals.bono_concepto.charAt(0) + vals.bono_concepto.slice(1).toLowerCase()}` : 'Bono', value: vals.bono_monto, color: 'text-green-700' }] : []),
          ...(vals.descuento_otro_monto > 0 ? [{ label: vals.descuento_otro_concepto ? vals.descuento_otro_concepto.replace('_', ' ').toLowerCase() : 'Descuento', value: -vals.descuento_otro_monto, color: 'text-red-700' }] : []),
          ...(vals.aguinaldo_directo > 0 ? [{ label: 'Aguinaldo (SAC)', value: vals.aguinaldo_directo, color: 'text-teal-700' }] : []),
          { label: 'Neto a pagar', value: calc.neto, color: 'text-green-700 font-semibold text-base' },
          { label: 'Aportes patronales (cargas sociales)', value: calc.aportes_patronales, color: 'text-amber-700' },
          ...(aguinaldoProvisionado > 0
            ? [{
                label: `Provisión aguinaldo (sobre ${formatCurrency(baseAguinaldo)})`,
                value: aguinaldoProvisionado,
                color: 'text-amber-800',
              }]
            : []),
          { label: 'Costo empresa total', value: calc.costo_empresa, color: 'text-primary font-semibold' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`flex justify-between ${color ?? 'text-fg-muted'}`}>
            <span>{label}</span>
            <span className="font-mono">{formatCurrency(value)}</span>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      {preguntarFicha ? (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 space-y-3">
          <p className="text-sm text-fg-muted">
            El sueldo de este mes (<strong className="font-mono text-fg">{formatCurrency(sueldoNominaBase)}</strong>)
            {' '}es distinto al de la ficha del empleado (<strong className="font-mono text-fg">{formatCurrency(sueldoFichaActual)}</strong>).
          </p>
          <p className="text-sm font-medium text-fg">
            ¿Querés que este monto pase a ser el sueldo de ficha del empleado de ahora en más?
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => decidirFicha(false)}>
              No, solo este mes
            </Button>
            <Button type="button" variant="success" onClick={() => decidirFicha(true)}>
              Sí, actualizar ficha
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {editing ? 'Guardar cambios' : 'Generar nómina'}
          </Button>
        </div>
      )}
    </form>
  )
}
