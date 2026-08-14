'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { borrarMovimiento } from '@/app/actions/inversiones'
import { formatMoneda } from '@/lib/inversiones-calc'
import { formatDate } from '@/lib/utils'
import { MOTIVOS_MOVIMIENTO, type Instrumento, type MovimientoInstrumento, type PeriodoInstrumento, type TramoTasa } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { MovimientoModal } from './movimiento-modal'
import { Plus, Pencil, Trash2, Loader2, FileText, CalendarPlus } from 'lucide-react'

const VARIANTE = {
  retiro_parcial: 'warning',
  aporte_nuevo: 'success',
  devolucion: 'danger',
  ajuste: 'default',
} as const

const ETIQUETA = Object.fromEntries(MOTIVOS_MOVIMIENTO.map((m) => [m.valor, m.label]))

export function MovimientosInstrumento({
  instrumento,
  tramos,
  movimientos,
  periodos,
}: {
  instrumento: Instrumento
  tramos: TramoTasa[]
  movimientos: MovimientoInstrumento[]
  periodos: PeriodoInstrumento[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<MovimientoInstrumento | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startBorrado] = useTransition()

  const mesesCerrados = new Set(periodos.filter((p) => p.cerrado).map((p) => p.mes))
  const ordenados = [...movimientos].sort((a, b) => {
    const fa = a.fecha ?? `${a.mes}-00`
    const fb = b.fecha ?? `${b.mes}-00`
    return fb.localeCompare(fa)
  })

  const abrirNuevo = () => { setEditando(null); setError(null); setAbierto(true) }
  const abrirEdicion = (m: MovimientoInstrumento) => { setEditando(m); setError(null); setAbierto(true) }

  const borrar = (id: string) => {
    setError(null)
    setBorrando(id)
    startBorrado(async () => {
      const r = await borrarMovimiento(id)
      setBorrando(null)
      if (!r.ok) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-fg">
            Movimientos de plata {instrumento.codigo && <span className="text-fg-muted">· {instrumento.codigo}</span>}
          </h3>
          <p className="text-[11px] text-fg-soft">
            Todo lo que entró y salió de este plazo fijo, con el día en que pasó.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/reportes/instrumento/${instrumento.id}/ficha`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="secondary">
              <FileText className="w-3.5 h-3.5" /> Ficha PDF
            </Button>
          </a>
          {instrumento.estado === 'activo' && (
            <Button size="sm" onClick={abrirNuevo}>
              <Plus className="w-3.5 h-3.5" /> Registrar movimiento
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>}

      {ordenados.length === 0 ? (
        <p className="text-sm text-fg-soft py-3">Todavía no se movió plata en este plazo fijo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-fg-soft border-b border-border">
                <th className="py-2 pr-3 font-semibold">Día</th>
                <th className="py-2 pr-3 font-semibold">Qué pasó</th>
                <th className="py-2 pr-3 font-semibold text-right">Monto</th>
                <th className="py-2 pr-3 font-semibold">Nota</th>
                <th className="py-2 pr-3 font-semibold">Mes</th>
                <th className="py-2 font-semibold text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((m) => {
                const monto = Number(m.monto)
                const cerrado = mesesCerrados.has(m.mes)
                const deSistema = m.origen === 'devolucion_cierre'
                return (
                  <tr key={m.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {m.fecha ? (
                        <span className="text-fg">{formatDate(m.fecha)}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => abrirEdicion(m)}
                          disabled={cerrado}
                          className="flex items-center gap-1 text-fg-soft hover:text-fg disabled:hover:text-fg-soft disabled:cursor-default"
                          title={cerrado ? 'El mes ya está cerrado' : 'Ponerle el día'}
                        >
                          <CalendarPlus className="w-3 h-3" /> sin día
                        </button>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={VARIANTE[m.motivo]}>{ETIQUETA[m.motivo] ?? m.motivo}</Badge>
                    </td>
                    <td className={`py-2 pr-3 text-right font-mono whitespace-nowrap ${monto < 0 ? 'text-red-700' : 'text-green-700'}`}>
                      {monto > 0 ? '+' : ''}{formatMoneda(monto, instrumento.moneda)}
                    </td>
                    <td className="py-2 pr-3 text-fg-muted text-xs max-w-[16rem]">
                      {m.nota ?? '—'}
                      {!m.fecha && (
                        <span className="block text-[11px] text-fg-soft">sin día — no cambia el interés</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={cerrado ? 'default' : 'info'}>{cerrado ? 'Cerrado' : 'Abierto'}</Badge>
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => abrirEdicion(m)}
                        disabled={cerrado || deSistema}
                        title={
                          deSistema ? 'Lo generó "Devolver y cerrar". Se cambia rehaciendo la devolución.'
                          : cerrado ? 'El mes ya está cerrado. Reabrilo desde Cierre mensual.'
                          : 'Editar'
                        }
                        className="p-1 rounded text-fg-soft hover:text-fg hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => borrar(m.id)}
                        disabled={cerrado || deSistema || pendiente}
                        title={
                          deSistema ? 'Lo generó "Devolver y cerrar". No se borra a mano.'
                          : cerrado ? 'El mes ya está cerrado. Reabrilo desde Cierre mensual.'
                          : 'Borrar'
                        }
                        className="p-1 rounded text-fg-soft hover:text-red-700 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        {borrando === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={abierto}
        onOpenChange={setAbierto}
        title={editando ? 'Cambiar el movimiento' : 'Registrar un movimiento'}
        description={`${instrumento.codigo ?? 'Plazo fijo'} · ${formatMoneda(Number(instrumento.capital_inicial), instrumento.moneda)}`}
      >
        <MovimientoModal
          instrumento={instrumento}
          tramos={tramos}
          movimientos={movimientos}
          editando={editando}
          onClose={() => setAbierto(false)}
          onDone={() => router.refresh()}
        />
      </Modal>
    </div>
  )
}
