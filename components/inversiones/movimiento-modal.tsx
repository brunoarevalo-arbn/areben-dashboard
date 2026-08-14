'use client'

import { useMemo, useState, useTransition } from 'react'
import { crearMovimiento, editarMovimiento } from '@/app/actions/inversiones'
import { generarPeriodos, formatMoneda, type MovimientoCalc } from '@/lib/inversiones-calc'
import { MOTIVOS_MOVIMIENTO, type MotivoMovimiento, type Instrumento, type MovimientoInstrumento, type TramoTasa } from '@/types/database'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'
import { Loader2, ArrowDownLeft, ArrowUpRight } from 'lucide-react'

function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** El día anterior a una fecha: el vencimiento no admite movimientos, ese día ya cierra. */
function diaAnterior(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Los motivos que sacan plata. El resto la suma. */
const SACA_PLATA: MotivoMovimiento[] = ['retiro_parcial', 'devolucion']

export function MovimientoModal({
  instrumento,
  tramos,
  movimientos,
  editando,
  onClose,
  onDone,
}: {
  instrumento: Instrumento
  tramos: TramoTasa[]
  /** Todos los movimientos del instrumento, para poder mostrar el antes y el después. */
  movimientos: MovimientoInstrumento[]
  /** Si viene, el modal edita ese movimiento en vez de crear uno nuevo. */
  editando?: MovimientoInstrumento | null
  onClose: () => void
  onDone: () => void
}) {
  const [fecha, setFecha] = useState(editando?.fecha ?? hoyISO())
  const [motivo, setMotivo] = useState<MotivoMovimiento>(editando?.motivo ?? 'retiro_parcial')
  const [monto, setMonto] = useState(Math.abs(Number(editando?.monto ?? 0)))
  const [nota, setNota] = useState(editando?.nota ?? '')
  const [ajusteEntra, setAjusteEntra] = useState((Number(editando?.monto ?? 0)) > 0)
  const [error, setError] = useState<string | null>(null)
  const [guardando, startGuardado] = useTransition()

  const sale = motivo === 'ajuste' ? !ajusteEntra : SACA_PLATA.includes(motivo)
  const montoConSigno = sale ? -Math.abs(monto) : Math.abs(monto)

  const minFecha = instrumento.fecha_inicio
  const maxFecha = instrumento.fecha_fin ? diaAnterior(instrumento.fecha_fin) : hoyISO()

  // Vista previa: se corre el mismo motor que después guarda, una vez con los
  // movimientos que ya hay y otra sumando el nuevo. Así el número que se ve es el
  // número que va a quedar.
  const preview = useMemo(() => {
    const tramosArr = tramos.length > 0
      ? tramos.map((t) => ({ fecha_desde: t.fecha_desde, tasa_mensual: Number(t.tasa_mensual) }))
      : [{ fecha_desde: instrumento.fecha_inicio, tasa_mensual: Number(instrumento.tasa_mensual) }]

    const base = {
      capitalInicial: Number(instrumento.capital_inicial),
      fechaInicio: instrumento.fecha_inicio,
      fechaFin: instrumento.fecha_fin,
      capitalizable: instrumento.capitalizable,
      hasta: (instrumento.fecha_fin ?? hoyISO()).substring(0, 7),
      tramos: tramosArr,
      plazoDias: instrumento.plazo_dias,
    }

    const actuales: MovimientoCalc[] = movimientos
      .filter((m) => m.id !== editando?.id)
      .map((m) => ({ mes: m.mes, fecha: m.fecha ?? null, monto: Number(m.monto) }))

    const sumaInteres = (ms: MovimientoCalc[]) => {
      const p = generarPeriodos({ ...base, movimientos: ms })
      return Math.round(p.reduce((s, x) => s + x.interes_devengado, 0) * 100) / 100
    }

    const antes = sumaInteres(actuales)
    if (!monto || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { antes, despues: antes, diferencia: 0 }

    const despues = sumaInteres([...actuales, { mes: fecha.substring(0, 7), fecha, monto: montoConSigno }])
    return { antes, despues, diferencia: Math.round((despues - antes) * 100) / 100 }
  }, [instrumento, tramos, movimientos, editando, fecha, monto, montoConSigno])

  const fueraDePlazo = fecha < minFecha || fecha > maxFecha
  const puedeGuardar = monto > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !fueraDePlazo && !guardando

  const guardar = () => {
    setError(null)
    startGuardado(async () => {
      const payload = { fecha, monto: montoConSigno, motivo, nota: nota.trim() || null }
      const r = editando
        ? await editarMovimiento(editando.id, payload)
        : await crearMovimiento({ instrumentoId: instrumento.id, ...payload })
      if (!r.ok) { setError(r.error); return }
      onDone()
      onClose()
    })
  }

  return (
    <div className="space-y-5">
      {/* Qué pasó */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-fg-muted uppercase tracking-wide">¿Qué pasó?</label>
        <div className="grid grid-cols-2 gap-2">
          {MOTIVOS_MOVIMIENTO.filter((m) => m.valor !== 'devolucion').map((m) => (
            <button
              key={m.valor}
              type="button"
              onClick={() => setMotivo(m.valor)}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                motivo === m.valor
                  ? 'border-primary bg-primary/10'
                  : 'border-border-strong bg-surface-2 hover:bg-surface-2/70'
              }`}
            >
              <span className="block text-sm font-medium text-fg">{m.label}</span>
              <span className="block text-[11px] text-fg-soft">{m.ayuda}</span>
            </button>
          ))}
        </div>
        {motivo === 'ajuste' && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setAjusteEntra(false)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${!ajusteEntra ? 'border-primary bg-primary/10 text-fg' : 'border-border-strong text-fg-muted'}`}
            >
              <ArrowDownLeft className="w-3 h-3" /> Sale plata
            </button>
            <button
              type="button"
              onClick={() => setAjusteEntra(true)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${ajusteEntra ? 'border-primary bg-primary/10 text-fg' : 'border-border-strong text-fg-muted'}`}
            >
              <ArrowUpRight className="w-3 h-3" /> Entra plata
            </button>
          </div>
        )}
      </div>

      {/* Día y monto */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-fg-muted uppercase tracking-wide">
            {sale ? '¿Qué día sacó la plata?' : '¿Qué día entró la plata?'}
          </label>
          <input
            type="date"
            value={fecha}
            min={minFecha}
            max={maxFecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="text-[11px] text-fg-soft">
            Puede ser de un mes anterior, mientras ese mes no esté cerrado.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-fg-muted uppercase tracking-wide">¿Cuánto?</label>
          <MoneyInput
            value={monto}
            onChange={setMonto}
            prefix={instrumento.moneda === 'USD' ? 'U$S' : '$'}
            min={0}
          />
        </div>
      </div>

      {/* Nota */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-fg-muted uppercase tracking-wide">
          Nota <span className="normal-case font-normal text-fg-soft">(opcional)</span>
        </label>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          placeholder="Ej.: se lo llevó para la obra"
          className="w-full bg-surface-2 border border-border-strong rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-soft focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      {/* Qué le pasa a los intereses */}
      <div className="bg-surface-2/50 rounded-lg p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-fg-muted">Intereses del plazo hoy</span>
          <span className="font-mono text-fg">{formatMoneda(preview.antes, instrumento.moneda)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">Con este movimiento</span>
          <span className="font-mono text-fg">{formatMoneda(preview.despues, instrumento.moneda)}</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-border-strong/50">
          <span className="font-semibold text-fg">Diferencia</span>
          <span className={`font-mono font-bold ${preview.diferencia < 0 ? 'text-red-700' : preview.diferencia > 0 ? 'text-green-700' : 'text-fg-muted'}`}>
            {preview.diferencia === 0 ? '—' : formatMoneda(preview.diferencia, instrumento.moneda)}
          </span>
        </div>
        <p className="text-[11px] text-fg-soft pt-1 leading-snug">
          Lo que sale cobra la tasa pactada hasta el día que se va, y deja de cobrar desde ahí.
          Lo que queda sigue cobrando normal hasta el vencimiento.
        </p>
      </div>

      {fueraDePlazo && (
        <p className="text-sm text-amber-700">
          El día tiene que estar entre el {minFecha.split('-').reverse().join('/')} y el{' '}
          {maxFecha.split('-').reverse().join('/')}.
        </p>
      )}
      {error && <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>}

      <div className="flex justify-end gap-3 pt-3 border-t border-border">
        <Button type="button" variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button type="button" onClick={guardar} disabled={!puedeGuardar}>
          {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
          {editando ? 'Guardar cambios' : 'Registrar movimiento'}
        </Button>
      </div>
    </div>
  )
}
