'use client'

// "A dónde transferirle" — la libreta de cuentas de un acreedor, dentro de su cuenta corriente.
//
// Lo que se hace acá es copiar un alias o un CBU y pegarlo en el home banking, así que la pantalla
// está armada alrededor de eso: el dato grande y legible, el botón de copiar al lado, y el titular
// abajo para poder comparar con el nombre que muestra el banco antes de confirmar.
//
// La cuenta SUGERIDA va primera y marcada. Es la que la pantalla propone y la que va a proponer el
// Monitor cuando se le pida a un cliente que transfiera directo acá.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  guardarCuentaAcreedor, marcarCuentaSugerida,
  archivarCuentaAcreedor, reactivarCuentaAcreedor,
} from '@/app/actions/acreedor-cuentas'
import {
  formatearCbu, ordenarCuentasAcreedor, validarCuenta, type AcreedorCuenta,
} from '@/lib/acreedor-cuentas'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  Landmark, Copy, Check, Star, Plus, Pencil, Archive, Loader2, RotateCcw,
} from 'lucide-react'

interface Props {
  acreedor: { id: string; nombre: string }
  cuentas: AcreedorCuenta[]
}

export function AcreedorCuentasBlock({ acreedor, cuentas }: Props) {
  const router = useRouter()
  const [editando, setEditando] = useState<AcreedorCuenta | 'nueva' | null>(null)
  const [verArchivadas, setVerArchivadas] = useState(false)

  const activas = ordenarCuentasAcreedor(cuentas.filter((c) => c.activa))
  const archivadas = ordenarCuentasAcreedor(cuentas.filter((c) => !c.activa))

  return (
    <div className="bg-surface border border-border/60 rounded-lg px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <Landmark className="w-3.5 h-3.5 text-primary shrink-0" />
        <p className="text-xs font-semibold text-fg flex-1">A dónde transferirle</p>
        <button
          type="button"
          onClick={() => setEditando('nueva')}
          className="text-[11px] text-fg-muted hover:text-fg flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Agregar cuenta
        </button>
      </div>

      {activas.length === 0 ? (
        <p className="text-[11px] text-fg-soft">
          Todavía no hay ninguna cuenta cargada. Sin esto, cada vez que haya que mandarle plata hay
          que buscar el CBU en un chat.
        </p>
      ) : (
        <div className="space-y-1.5">
          {activas.map((c) => (
            <CuentaFila key={c.id} cuenta={c} onEditar={() => setEditando(c)} onCambio={() => router.refresh()} />
          ))}
        </div>
      )}

      {archivadas.length > 0 && (
        <div className="pt-1 border-t border-border/50">
          <button
            type="button"
            onClick={() => setVerArchivadas((v) => !v)}
            className="text-[11px] text-fg-soft hover:text-fg-muted"
          >
            {verArchivadas ? 'Ocultar' : 'Ver'} {archivadas.length} cuenta{archivadas.length === 1 ? '' : 's'} que ya no se usa{archivadas.length === 1 ? '' : 'n'}
          </button>
          {verArchivadas && (
            <div className="space-y-1.5 mt-1.5">
              {archivadas.map((c) => (
                <CuentaFila key={c.id} cuenta={c} onEditar={() => setEditando(c)} onCambio={() => router.refresh()} />
              ))}
            </div>
          )}
        </div>
      )}

      <Modal
        open={!!editando}
        onOpenChange={(o) => !o && setEditando(null)}
        title={editando === 'nueva' ? `Nueva cuenta de ${acreedor.nombre}` : 'Editar la cuenta'}
        className="max-w-lg"
      >
        {editando && (
          <CuentaForm
            acreedorId={acreedor.id}
            cuenta={editando === 'nueva' ? null : editando}
            esLaPrimera={activas.length === 0}
            onClose={() => { setEditando(null); router.refresh() }}
          />
        )}
      </Modal>
    </div>
  )
}

// ─── Una cuenta ───────────────────────────────────────────────────────────────

function CuentaFila({ cuenta, onEditar, onCambio }: {
  cuenta: AcreedorCuenta
  onEditar: () => void
  onCambio: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function correr(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (r.error) setError(r.error)
      else onCambio()
    })
  }

  function archivar() {
    if (!confirm('¿Marcar esta cuenta como que ya no se usa?\n\nNo se borra: se puede volver a activar cuando quieras.')) return
    correr(() => archivarCuentaAcreedor(cuenta.id))
  }

  return (
    <div className={cn(
      'rounded-lg border px-2.5 py-2',
      cuenta.sugerida ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-surface-2/30',
      !cuenta.activa && 'opacity-60',
    )}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-0.5">
          {cuenta.alias && (
            <Copiable texto={cuenta.alias} etiqueta="alias" className="text-sm font-medium text-fg" />
          )}
          {cuenta.cbu && (
            <Copiable
              texto={cuenta.cbu}
              mostrar={formatearCbu(cuenta.cbu)}
              etiqueta="CBU"
              className={cn('font-mono text-[11px]', cuenta.alias ? 'text-fg-muted' : 'text-fg')}
            />
          )}
          <p className="text-[11px] text-fg-soft">
            {[cuenta.banco, cuenta.titular && `a nombre de ${cuenta.titular}`].filter(Boolean).join(' · ') || 'sin banco ni titular cargado'}
          </p>
          {cuenta.notas && <p className="text-[11px] text-fg-soft italic">{cuenta.notas}</p>}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {cuenta.sugerida ? (
            <span className="text-[10px] text-primary font-medium flex items-center gap-1 px-1.5">
              <Star className="w-3 h-3 fill-current" /> la que se usa
            </span>
          ) : cuenta.activa ? (
            <button
              type="button" onClick={() => correr(() => marcarCuentaSugerida(cuenta.id))} disabled={isPending}
              title="Usar esta por defecto"
              className="p-1.5 rounded hover:bg-surface-2 text-fg-soft hover:text-primary"
            >
              <Star className="w-3.5 h-3.5" />
            </button>
          ) : null}

          <button type="button" onClick={onEditar} title="Editar"
            className="p-1.5 rounded hover:bg-surface-2 text-fg-soft hover:text-fg">
            <Pencil className="w-3.5 h-3.5" />
          </button>

          {cuenta.activa ? (
            <button type="button" onClick={archivar} disabled={isPending} title="Ya no se usa"
              className="p-1.5 rounded hover:bg-surface-2 text-fg-soft hover:text-red-700">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <button type="button" onClick={() => correr(() => reactivarCuentaAcreedor(cuenta.id))} disabled={isPending}
              title="Volver a usarla"
              className="p-1.5 rounded hover:bg-surface-2 text-fg-soft hover:text-fg">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-700 mt-1">{error}</p>}
    </div>
  )
}

/** Un dato con su botón de copiar al lado: es lo único que se hace con esta pantalla. */
function Copiable({ texto, mostrar, etiqueta, className }: {
  texto: string
  mostrar?: string
  etiqueta: string
  className?: string
}) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch {
      // Algunos navegadores no dejan copiar sin https: el dato igual está a la vista.
    }
  }

  return (
    <button type="button" onClick={copiar} title={`Copiar el ${etiqueta}`}
      className={cn('flex items-center gap-1.5 hover:text-primary group text-left', className)}>
      <span className="truncate">{mostrar ?? texto}</span>
      {copiado ? (
        <span className="text-[10px] text-green-700 flex items-center gap-0.5 shrink-0">
          <Check className="w-3 h-3" /> copiado
        </span>
      ) : (
        <Copy className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 text-fg-soft" />
      )}
    </button>
  )
}

// ─── Alta / edición ───────────────────────────────────────────────────────────

function CuentaForm({ acreedorId, cuenta, esLaPrimera, onClose }: {
  acreedorId: string
  cuenta: AcreedorCuenta | null
  esLaPrimera: boolean
  onClose: () => void
}) {
  const [alias, setAlias] = useState(cuenta?.alias ?? '')
  const [cbu, setCbu] = useState(cuenta?.cbu ?? '')
  const [banco, setBanco] = useState(cuenta?.banco ?? '')
  const [titular, setTitular] = useState(cuenta?.titular ?? '')
  const [notas, setNotas] = useState(cuenta?.notas ?? '')
  const [sugerida, setSugerida] = useState(cuenta?.sugerida ?? esLaPrimera)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // El mismo chequeo que hace el servidor, para avisar mientras se escribe. En un formulario
  // recién abierto no se muestra nada: "falta el alias" antes de escribir la primera letra se
  // lee como un error, no como una ayuda.
  const problema = validarCuenta({ alias, cbu })
  const mostrarProblema = !!problema && !!(alias.trim() || cbu.trim())

  function guardar() {
    setError(null)
    startTransition(async () => {
      const r = await guardarCuentaAcreedor({
        id: cuenta?.id, proveedorId: acreedorId, alias, cbu, banco, titular, notas, sugerida,
      })
      if (r.error) setError(r.error)
      else onClose()
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Con el alias solo ya alcanza para transferir. El CBU conviene igual: los alias se pueden
        soltar y quedar en manos de otro, el CBU no cambia.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Alias" value={alias} onChange={(e) => setAlias(e.target.value)}
          placeholder="Ej: santiago.gomez.est" autoFocus />
        <Input label="Banco" value={banco} onChange={(e) => setBanco(e.target.value)}
          placeholder="Ej: Galicia" />
      </div>

      <Input label="CBU o CVU" value={cbu} onChange={(e) => setCbu(e.target.value)}
        placeholder="22 números" inputMode="numeric" className="font-mono" />

      <div className="space-y-1.5">
        <Input label="¿A nombre de quién está?" value={titular} onChange={(e) => setTitular(e.target.value)}
          placeholder="Ej: Gómez y Asociados SRL" />
        <p className="text-xs text-fg-muted">
          Es el nombre que va a mostrar el banco al confirmar la transferencia. Muchas veces no es
          el de la persona: es el del estudio o el de un familiar. Tenerlo escrito evita frenar en
          el último paso pensando que uno se equivocó de cuenta.
        </p>
      </div>

      <Input label="Nota (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)}
        placeholder="Ej: acá cobra los honorarios del juicio" />

      <label className="flex items-start gap-2 text-sm text-fg-muted cursor-pointer">
        <input type="checkbox" checked={sugerida} onChange={(e) => setSugerida(e.target.checked)}
          className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2 mt-0.5" />
        <span>
          Usar esta cuenta por defecto
          <span className="block text-xs text-fg-soft">
            Es la que se va a ofrecer primero. Solo puede haber una: si marcás esta, la otra deja de serlo.
          </span>
        </span>
      </label>

      {(error || mostrarProblema) && (
        <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error ?? problema}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={guardar} disabled={isPending || !!problema}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Guardar
        </Button>
      </div>
    </div>
  )
}
