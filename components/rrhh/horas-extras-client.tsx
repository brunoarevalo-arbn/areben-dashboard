'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, Clock, Copy, Link2, Loader2, RotateCcw, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { NumberInput } from '@/components/ui/number-input'
import { Tabs } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/utils'
import {
  aprobarHorasExtras,
  generarTokenHoras,
  rechazarHoraExtra,
  revocarTokenHoras,
} from '@/app/actions/rrhh'
import type { HoraExtraRegistro } from '@/types/database'

const PORCENTAJES = [0, 30, 50, 100]
const PORCENTAJE_DEFAULT = 30

const TABS = [
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'mes', label: 'Del mes' },
  { key: 'links', label: 'Links' },
]

interface EmpleadoHoras {
  id: string
  nombre: string
  apellido: string
  valor_hora: number
  sueldo_basico: number
  horas_mensuales: number
  token_horas: string | null
  token_horas_creado_at: string | null
}

/** 'YYYY-MM-DD' → '22/08'. A mano: `new Date('2026-08-22')` es UTC y en Argentina muestra el 21. */
function diaMes(fecha: string) {
  const [, m, d] = fecha.split('-')
  return `${d}/${m}`
}

function valorHoraDe(e: EmpleadoHoras) {
  return e.valor_hora || (e.horas_mensuales > 0 ? e.sueldo_basico / e.horas_mensuales : 0)
}

export function HorasExtrasClient({
  mes,
  tab,
  pendientes,
  delMes,
  empleados,
}: {
  mes: string
  tab: string
  pendientes: HoraExtraRegistro[]
  delMes: HoraExtraRegistro[]
  empleados: EmpleadoHoras[]
}) {
  const activo = TABS.some((t) => t.key === tab) ? tab : 'pendientes'
  const porEmpleado = useMemo(
    () => new Map(empleados.map((e) => [e.id, e])),
    [empleados],
  )

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Horas extras</h1>
          <p className="text-sm text-fg-muted mt-0.5">
            Lo que carga cada uno desde su link entra acá. Recién cuando se aprueba entra a la
            liquidación.
          </p>
        </div>
        {pendientes.length > 0 && (
          <Badge variant="warning" className="shrink-0">
            {pendientes.length} sin revisar
          </Badge>
        )}
      </header>

      <Tabs items={TABS} activeKey={activo} />

      {activo === 'pendientes' && (
        <PanelPendientes pendientes={pendientes} porEmpleado={porEmpleado} />
      )}
      {activo === 'mes' && <PanelMes mes={mes} delMes={delMes} porEmpleado={porEmpleado} />}
      {activo === 'links' && <PanelLinks empleados={empleados} />}
    </div>
  )
}

// ============ PENDIENTES ============

function PanelPendientes({
  pendientes,
  porEmpleado,
}: {
  pendientes: HoraExtraRegistro[]
  porEmpleado: Map<string, EmpleadoHoras>
}) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [porcentaje, setPorcentaje] = useState<number>(PORCENTAJE_DEFAULT)
  const [error, setError] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState<HoraExtraRegistro | null>(null)
  const [guardando, startGuardar] = useTransition()

  const grupos = useMemo(() => {
    const m = new Map<string, HoraExtraRegistro[]>()
    for (const r of pendientes) {
      const lista = m.get(r.empleado_id) ?? []
      lista.push(r)
      m.set(r.empleado_id, lista)
    }
    return [...m.entries()]
  }, [pendientes])

  function alternar(id: string) {
    setSeleccion((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function aprobar(ids: string[]) {
    setError(null)
    startGuardar(async () => {
      const r = await aprobarHorasExtras(ids, porcentaje)
      if (r) setError(r)
      else setSeleccion(new Set())
    })
  }

  if (!pendientes.length) {
    return (
      <p className="text-sm text-fg-soft py-8 text-center">
        No hay nada esperando aprobación.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* El % se elige una vez y vale para lo que se apruebe abajo */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-surface-2 border border-border">
        <span className="text-sm text-fg-muted">Aprobar al</span>
        <div className="flex gap-1.5">
          {PORCENTAJES.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={porcentaje === p ? 'primary' : 'secondary'}
              onClick={() => setPorcentaje(p)}
            >
              {p}%
            </Button>
          ))}
        </div>
        <NumberInput
          value={porcentaje}
          onChange={setPorcentaje}
          mostrarCero
          min={0}
          max={200}
          className="w-20 px-2.5 py-1.5 bg-surface border border-border-strong rounded-lg text-sm text-fg"
        />
        {seleccion.size > 0 && (
          <Button size="sm" disabled={guardando} onClick={() => aprobar([...seleccion])}>
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Aprobar {seleccion.size} al {porcentaje}%
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {grupos.map(([empleadoId, registros]) => {
        const emp = porEmpleado.get(empleadoId)
        const vh = emp ? valorHoraDe(emp) : 0
        const totalHs = registros.reduce((s, r) => s + Number(r.cantidad), 0)
        return (
          <div key={empleadoId} className="rounded-xl bg-surface border border-border-strong overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-surface-2 border-b border-border">
              <span className="text-sm font-medium text-fg">
                {emp ? `${emp.nombre} ${emp.apellido}` : 'Empleado dado de baja'}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-fg-soft font-mono">{totalHs} hs</span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={guardando}
                  onClick={() => aprobar(registros.map((r) => r.id))}
                >
                  Aprobar todas al {porcentaje}%
                </Button>
              </span>
            </div>

            <ul className="divide-y divide-border">
              {registros.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={seleccion.has(r.id)}
                    onChange={() => alternar(r.id)}
                    className="w-4 h-4 accent-[var(--primary)]"
                    aria-label={`Seleccionar ${diaMes(r.fecha)}`}
                  />
                  <span className="font-mono text-sm text-fg-muted w-12">{diaMes(r.fecha)}</span>
                  <span className="font-mono text-sm font-semibold text-fg w-14">{Number(r.cantidad)} hs</span>
                  <span className="flex-1 text-xs text-fg-soft truncate">
                    {r.notas}
                    {r.origen === 'EMPLEADO' && <span className="ml-2 italic">la cargó él/ella</span>}
                  </span>
                  {/* Referencia: el número real lo fija la liquidación con SU valor hora */}
                  <span className="text-xs text-fg-soft font-mono hidden sm:inline">
                    ~{formatCurrency(Number(r.cantidad) * vh * (1 + porcentaje / 100))}
                  </span>
                  <Button size="sm" variant="success" disabled={guardando} onClick={() => aprobar([r.id])}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="danger" disabled={guardando} onClick={() => setRechazando(r)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      <p className="text-xs text-fg-soft">
        El monto es orientativo: la liquidación lo recalcula con el valor hora que tenga la nómina
        de ese mes.
      </p>

      {rechazando && (
        <ModalRechazo registro={rechazando} onClose={() => setRechazando(null)} />
      )}
    </div>
  )
}

function ModalRechazo({ registro, onClose }: { registro: HoraExtraRegistro; onClose: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, startGuardar] = useTransition()

  return (
    <Modal open onOpenChange={onClose} title={`No aprobar las ${Number(registro.cantidad)} hs del ${diaMes(registro.fecha)}`} className="max-w-md">
      <div className="p-6 space-y-4">
        <Input
          label="Motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej: ese día saliste a horario"
          autoFocus
        />
        <p className="text-xs text-fg-soft">Esto lo va a leer el empleado en su link.</p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            variant="danger"
            disabled={guardando}
            onClick={() =>
              startGuardar(async () => {
                const r = await rechazarHoraExtra(registro.id, motivo)
                if (r) setError(r)
                else onClose()
              })
            }
          >
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />} No aprobar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ============ DEL MES ============

function PanelMes({
  mes,
  delMes,
  porEmpleado,
}: {
  mes: string
  delMes: HoraExtraRegistro[]
  porEmpleado: Map<string, EmpleadoHoras>
}) {
  if (!delMes.length) {
    return <p className="text-sm text-fg-soft py-8 text-center">Sin horas extras en {mes}.</p>
  }

  return (
    <div className="rounded-xl bg-surface border border-border-strong overflow-hidden">
      <ul className="divide-y divide-border">
        {delMes.map((r) => {
          const emp = porEmpleado.get(r.empleado_id)
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-mono text-fg-muted w-12">{diaMes(r.fecha)}</span>
              <span className="flex-1 text-fg truncate">
                {emp ? `${emp.nombre} ${emp.apellido}` : '—'}
              </span>
              <span className="font-mono text-fg w-24">
                {Number(r.cantidad)} hs al {Number(r.porcentaje)}%
              </span>
              {r.estado === 'PENDIENTE' && <Badge variant="warning">Sin revisar</Badge>}
              {r.estado === 'APROBADA' && <Badge variant="success">Aprobada</Badge>}
              {r.estado === 'RECHAZADA' && <Badge variant="danger">No aprobada</Badge>}
              {r.incluido_en_nomina_id ? (
                <Badge variant="info">Liquidada</Badge>
              ) : (
                <span className="w-[72px]" />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ============ LINKS ============

function PanelLinks({ empleados }: { empleados: EmpleadoHoras[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        Cada empleado tiene su propio link. Se lo mandás una vez y carga desde el celular, sin
        usuario ni contraseña. Si se filtra, lo revocás y le pasás uno nuevo.
      </p>
      <div className="rounded-xl bg-surface border border-border-strong overflow-hidden">
        <ul className="divide-y divide-border">
          {empleados.map((e) => (
            <FilaLink key={e.id} empleado={e} />
          ))}
        </ul>
      </div>
    </div>
  )
}

function FilaLink({ empleado }: { empleado: EmpleadoHoras }) {
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [trabajando, startTrabajo] = useTransition()

  // El link se arma con el origen del navegador: sirve igual en local que en producción,
  // sin ninguna variable de entorno que se pueda quedar vieja.
  const url = empleado.token_horas
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/horas/${empleado.token_horas}`
    : null

  async function copiar() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  function correr(fn: () => Promise<string | null>) {
    setError(null)
    startTrabajo(async () => {
      const r = await fn()
      if (r) setError(r)
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="text-sm text-fg flex-1 min-w-[140px]">
        {empleado.nombre} {empleado.apellido}
      </span>

      {url ? (
        <>
          <code className="text-xs text-fg-soft font-mono truncate max-w-[240px] hidden md:block">{url}</code>
          <Button size="sm" variant="secondary" onClick={copiar}>
            {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiado ? 'Copiado' : 'Copiar'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="Generar uno nuevo: el que está circulando deja de andar"
            disabled={trabajando}
            onClick={() => correr(() => generarTokenHoras(empleado.id))}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="danger"
            title="Revocar: se queda sin link"
            disabled={trabajando}
            onClick={() => correr(() => revocarTokenHoras(empleado.id))}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </>
      ) : (
        <>
          <span className="text-xs text-fg-soft flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Sin link
          </span>
          <Button
            size="sm"
            disabled={trabajando}
            onClick={() => correr(() => generarTokenHoras(empleado.id))}
          >
            {trabajando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            Generar link
          </Button>
        </>
      )}

      {error && <p className="text-xs text-danger w-full">{error}</p>}
    </li>
  )
}
