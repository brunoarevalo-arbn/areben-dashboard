'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { Check, Clock, Loader2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { NumberInput } from '@/components/ui/number-input'
import {
  borrarHorasPorToken,
  cargarHorasPorToken,
  type EstadoHoras,
} from '@/app/actions/horas-publicas'

const HORAS_RAPIDAS = [1, 2, 3, 4]

/** 'YYYY-MM-DD' → '22/08'. A mano: `new Date('2026-08-22')` es UTC y en Argentina muestra el 21. */
function diaMes(fecha: string) {
  const [, m, d] = fecha.split('-')
  return `${d}/${m}`
}

/** Suma de días a una fecha 'YYYY-MM-DD' sin pasar por Date (que trae la zona horaria de arrastre). */
function sumarDias(fecha: string, dias: number) {
  const [a, m, d] = fecha.split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d))
  t.setUTCDate(t.getUTCDate() + dias)
  return t.toISOString().slice(0, 10)
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function CargaHorasClient({ token, estado }: { token: string; estado: EstadoHoras }) {
  const hoy = estado.hoy.slice(0, 10)
  const ayer = sumarDias(hoy, -1)

  const [fecha, setFecha] = useState(hoy)
  const [cantidad, setCantidad] = useState<number | null>(null)
  const [listo, setListo] = useState(false)

  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      fd.set('token', token)
      fd.set('fecha', fecha)
      const r = await cargarHorasPorToken(prev, fd)
      if (!r) {
        setCantidad(null)
        setFecha(hoy)
        setListo(true)
      }
      return r
    },
    null,
  )

  // El "listo" es un acuse, no un estado: se apaga solo.
  useEffect(() => {
    if (!listo) return
    const t = setTimeout(() => setListo(false), 4000)
    return () => clearTimeout(t)
  }, [listo])

  const mesActual = hoy.slice(0, 7)
  const delMes = estado.registros.filter((r) => r.fecha.startsWith(mesActual) && r.estado !== 'RECHAZADA')
  const totalMes = delMes.reduce((s, r) => s + Number(r.cantidad), 0)
  const enRevision = delMes.filter((r) => r.estado === 'PENDIENTE').reduce((s, r) => s + Number(r.cantidad), 0)
  const nombreMes = MESES[Number(mesActual.slice(5, 7)) - 1]

  return (
    <main className="min-h-dvh bg-bg px-4 py-8">
      <div className="w-full max-w-md mx-auto space-y-6">
        <header>
          <h1 className="text-xl font-semibold text-fg">Hola, {estado.nombre}</h1>
          <p className="text-sm text-fg-muted mt-0.5">Cargá acá las horas extras que hacés.</p>
        </header>

        <form action={formAction} className="space-y-4 p-4 rounded-xl bg-surface border border-border-strong">
          <div className="space-y-1.5">
            <label htmlFor="fecha" className="block text-sm font-medium text-fg">¿Qué día?</label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={fecha === hoy ? 'primary' : 'secondary'} onClick={() => setFecha(hoy)}>
                Hoy
              </Button>
              <Button type="button" size="sm" variant={fecha === ayer ? 'primary' : 'secondary'} onClick={() => setFecha(ayer)}>
                Ayer
              </Button>
            </div>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              max={hoy}
              min={sumarDias(hoy, -45)}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <NumberInput
              id="cantidad"
              name="cantidad"
              label="¿Cuántas horas?"
              value={cantidad}
              onChange={setCantidad}
              min={0.25}
              max={12}
              // `step` va en "any" a propósito: con un step fijo el navegador rechaza en silencio
              // los valores que no caen en la grilla (con min=0.25 y step=0.5, "2" es inválido) y
              // el formulario no se manda sin decir por qué. El rango lo valida el servidor.
              step="any"
              placeholder="Ej: 2.5"
            />
            <div className="flex gap-2">
              {HORAS_RAPIDAS.map((h) => (
                <Button
                  key={h}
                  type="button"
                  size="sm"
                  variant={cantidad === h ? 'primary' : 'secondary'}
                  onClick={() => setCantidad(h)}
                >
                  {h} h
                </Button>
              ))}
            </div>
          </div>

          <Textarea label="Nota (opcional)" name="notas" rows={2} placeholder="Ej: cierre de local" />

          {error && <p className="text-sm text-danger">{error}</p>}
          {listo && (
            <p className="text-sm text-success flex items-center gap-1.5">
              <Check className="w-4 h-4" /> Listo, quedó cargada. Te la van a revisar.
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />} Enviar
          </Button>
        </form>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-fg">Tus cargas de {nombreMes}</h2>
            <span className="text-xs text-fg-soft">
              {totalMes} hs{enRevision > 0 && ` · ${enRevision} en revisión`}
            </span>
          </div>

          {estado.registros.length === 0 && (
            <p className="text-sm text-fg-soft">Todavía no cargaste ninguna.</p>
          )}

          <ul className="space-y-1.5">
            {estado.registros.map((r) => (
              <FilaCarga key={r.id} token={token} registro={r} />
            ))}
          </ul>
        </section>

        <p className="text-xs text-fg-soft text-center pt-2">
          Este link es tuyo, no lo compartas. Si se te complica algo, avisale a administración.
        </p>
      </div>
    </main>
  )
}

function FilaCarga({
  token,
  registro,
}: {
  token: string
  registro: EstadoHoras['registros'][number]
}) {
  const [borrando, startBorrar] = useTransition()
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null)

  return (
    <li className="p-3 rounded-lg bg-surface border border-border-strong">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-fg">
          <Clock className="w-3.5 h-3.5 text-fg-soft" />
          <span className="font-mono">{diaMes(registro.fecha)}</span>
          <span className="font-semibold">{Number(registro.cantidad)} hs</span>
        </span>

        <span className="flex items-center gap-2">
          {registro.estado === 'PENDIENTE' && <Badge variant="warning">En revisión</Badge>}
          {registro.estado === 'APROBADA' && (
            <Badge variant="success">Aprobada · {Number(registro.porcentaje)}%</Badge>
          )}
          {registro.estado === 'RECHAZADA' && <Badge variant="danger">No aprobada</Badge>}

          {registro.estado === 'PENDIENTE' && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Borrar esta carga"
              disabled={borrando}
              onClick={() =>
                startBorrar(async () => {
                  setErrorBorrar(await borrarHorasPorToken(token, registro.id))
                })
              }
            >
              {borrando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            </Button>
          )}
        </span>
      </div>

      {registro.notas && <p className="text-xs text-fg-soft mt-1">{registro.notas}</p>}
      {registro.estado === 'RECHAZADA' && registro.rechazo_motivo && (
        <p className="text-xs text-danger mt-1">{registro.rechazo_motivo}</p>
      )}
      {errorBorrar && <p className="text-xs text-danger mt-1">{errorBorrar}</p>}
    </li>
  )
}
