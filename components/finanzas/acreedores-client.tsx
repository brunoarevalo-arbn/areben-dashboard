'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { asignarAcreedor, crearAcreedor } from '@/app/actions/acreedores'
import type { CuentaAcreedor, AcreedorGastoInput } from '@/lib/acreedores'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import {
  Handshake, ChevronDown, ChevronRight, Plus, Loader2, Search, X, CheckCircle2, Unlink,
} from 'lucide-react'

interface Props {
  cuentas: CuentaAcreedor[]
  proveedores: { id: string; nombre: string }[]
  sinAcreedor: AcreedorGastoInput[]
}

function mesLargo(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  if (!y || !m) return mes
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
}

export function AcreedoresClient({ cuentas, proveedores, sinAcreedor }: Props) {
  const router = useRouter()
  const [abierta, setAbierta] = useState<string | null>(cuentas.find((c) => c.saldo > 0)?.proveedorId ?? null)
  const [soloConSaldo, setSoloConSaldo] = useState(false)
  // A quién le estamos sumando gastos. Es {id, nombre} y no la cuenta entera porque también se
  // usa para una cuenta recién abierta, que todavía no tiene ningún gasto.
  const [agregarA, setAgregarA] = useState<{ id: string; nombre: string } | null>(null)
  const [modalNueva, setModalNueva] = useState(false)

  const visibles = soloConSaldo ? cuentas.filter((c) => c.saldo > 0) : cuentas
  const totalDeuda = cuentas.reduce((s, c) => s + c.saldo, 0)
  const conSaldo = cuentas.filter((c) => c.saldo > 0).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Handshake className="w-6 h-6 text-primary" />
            Cuenta corriente de acreedores
          </h1>
          <p className="text-sm text-fg-muted mt-0.5 max-w-2xl">
            Cuánto se le debe a cada persona con la que hay cuenta abierta: se le va sumando lo que
            se le devenga y se le van restando los pagos, sin fecha fija. La cuenta está bien cuando
            el saldo da cero.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setModalNueva(true)}>
          <Plus className="w-4 h-4" /> Abrir una cuenta
        </Button>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Total que se debe</p>
          <p className="text-xl font-bold text-red-700">{formatCurrency(totalDeuda)}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Cuentas con saldo</p>
          <p className="text-xl font-bold text-fg">{conSaldo} <span className="text-sm font-normal text-fg-soft">de {cuentas.length}</span></p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Sobre el patrimonio</p>
          <p className="text-sm text-fg-muted leading-snug">
            Esta pantalla no suma ni resta nada: la deuda ya la aportan los gastos pendientes en el
            cierre de mes.
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer w-fit">
        <input type="checkbox" checked={soloConSaldo} onChange={(e) => setSoloConSaldo(e.target.checked)}
          className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2" />
        Mostrar solo las que tienen saldo
      </label>

      {/* Lista */}
      {visibles.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-10 text-center text-fg-soft">
          {cuentas.length === 0
            ? 'Todavía no hay ninguna cuenta abierta. Abrí una y sumale los gastos de esa persona.'
            : 'Ninguna cuenta tiene saldo: está todo pago.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map((c) => (
            <CuentaRow
              key={c.proveedorId}
              cuenta={c}
              abierta={abierta === c.proveedorId}
              onToggle={() => setAbierta(abierta === c.proveedorId ? null : c.proveedorId)}
              onAgregar={() => setAgregarA({ id: c.proveedorId, nombre: c.nombre })}
              onRefetch={() => router.refresh()}
            />
          ))}
        </div>
      )}

      <Modal open={!!agregarA} onOpenChange={(o) => !o && setAgregarA(null)}
        title={agregarA ? `Sumar gastos a ${agregarA.nombre}` : ''} className="max-w-3xl">
        {agregarA && (
          <AgregarGastosForm
            acreedor={agregarA}
            candidatos={sinAcreedor}
            onClose={() => { setAgregarA(null); router.refresh() }}
          />
        )}
      </Modal>

      <Modal open={modalNueva} onOpenChange={setModalNueva} title="Abrir una cuenta" className="max-w-md">
        <NuevaCuentaForm
          proveedores={proveedores}
          yaConCuenta={new Set(cuentas.map((c) => c.proveedorId))}
          onElegido={(acreedor) => {
            // Una cuenta recién abierta no aparece en la lista hasta que tiene un gasto, así que
            // se encadena directo con "sumar gastos": si no, Bruno crea el nombre y no ve nada.
            setModalNueva(false)
            setAgregarA(acreedor)
          }}
          onClose={() => setModalNueva(false)}
        />
      </Modal>
    </div>
  )
}

// ─── CuentaRow ────────────────────────────────────────────────────────────────

function CuentaRow({ cuenta, abierta, onToggle, onAgregar, onRefetch }: {
  cuenta: CuentaAcreedor
  abierta: boolean
  onToggle: () => void
  onAgregar: () => void
  onRefetch: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const saldada = cuenta.saldo === 0

  function sacarDeLaCuenta(gastoId: string, concepto: string) {
    if (!confirm(`¿Sacar "${concepto}" de la cuenta de ${cuenta.nombre}?\n\nEl gasto no se borra: solo deja de contar acá.`)) return
    startTransition(async () => {
      const r = await asignarAcreedor([gastoId], null)
      if (r.error) alert(r.error)
      else onRefetch()
    })
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={onToggle} className="text-fg-muted hover:text-fg">
          {abierta ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-fg truncate">{cuenta.nombre}</p>
          <p className="text-[11px] text-fg-soft">
            {cuenta.conceptos.length} {cuenta.conceptos.length === 1 ? 'concepto' : 'conceptos'}
            {cuenta.ultimoPago && <> · último pago {formatDate(cuenta.ultimoPago)}</>}
          </p>
        </div>
        <div className="text-right">
          {saldada ? (
            <p className="text-sm font-bold text-green-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Al día
            </p>
          ) : (
            <>
              <p className="text-sm font-bold font-mono text-red-700">{formatCurrency(cuenta.saldo)}</p>
              <p className="text-[10px] text-fg-soft">se le debe</p>
            </>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onAgregar}>
          <Plus className="w-3.5 h-3.5" /> Sumar gastos
        </Button>
      </div>

      {abierta && (
        <div className="border-t border-border bg-surface-2/30 px-4 py-3 space-y-3">
          {cuenta.conceptos.length === 0 ? (
            <p className="text-xs text-fg-soft">Esta cuenta todavía no tiene ningún gasto asignado.</p>
          ) : (
            cuenta.conceptos.map((c) => (
              <div key={c.id} className="bg-surface border border-border/60 rounded-lg px-3 py-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-fg font-medium">{c.concepto}</p>
                    <p className="text-[11px] text-fg-soft capitalize">
                      {mesLargo(c.mes)}{c.categoria ? ` · ${c.categoria}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono text-fg">{formatCurrency(Number(c.monto))}</p>
                    <p className={cn('text-[11px] font-mono', c.saldo > 0 ? 'text-red-700' : 'text-green-700')}>
                      {c.saldo > 0 ? `queda ${formatCurrency(c.saldo)}` : 'saldado'}
                    </p>
                  </div>
                  <button
                    onClick={() => sacarDeLaCuenta(c.id, c.concepto)}
                    disabled={isPending}
                    title="Sacar de esta cuenta (no borra el gasto)"
                    className="p-1.5 rounded hover:bg-surface-2 text-fg-soft hover:text-red-700 shrink-0"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                </div>

                {c.pagos.length > 0 && (
                  <table className="w-full text-[11px] mt-2 border-t border-border/50 pt-1">
                    <tbody>
                      {c.pagos.map((p) => (
                        <tr key={p.id} className="border-b border-border/30 last:border-0">
                          <td className="py-1 text-fg-soft w-24 whitespace-nowrap">
                            {formatDate(p.fecha_debito ?? p.fecha_emision)}
                          </td>
                          <td className="py-1 text-fg-muted">
                            {/* La nota del pago dice con qué plata se pagó — es la trazabilidad. */}
                            {p.notas || <span className="text-fg-soft">sin detalle</span>}
                          </td>
                          <td className="py-1 text-right font-mono text-green-700 whitespace-nowrap w-28">
                            −{formatCurrency(Number(p.monto))}
                          </td>
                          <td className="py-1 text-right w-20">
                            {!p.debitado && <span className="text-amber-700">agendado</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))
          )}

          <div className="flex justify-end gap-6 text-xs pt-1 border-t border-border">
            <span className="text-fg-muted">Se devengó <b className="font-mono text-fg">{formatCurrency(cuenta.totalDevengado)}</b></span>
            <span className="text-fg-muted">Se pagó <b className="font-mono text-green-700">{formatCurrency(cuenta.totalPagado)}</b></span>
            <span className="text-fg-muted">Saldo <b className={cn('font-mono', cuenta.saldo > 0 ? 'text-red-700' : 'text-green-700')}>{formatCurrency(cuenta.saldo)}</b></span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AgregarGastosForm ────────────────────────────────────────────────────────

function AgregarGastosForm({ acreedor, candidatos, onClose }: {
  acreedor: { id: string; nombre: string }
  candidatos: AcreedorGastoInput[]
  onClose: () => void
}) {
  const [busca, setBusca] = useState('')
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return []
    return candidatos.filter((g) => g.concepto.toLowerCase().includes(q)).slice(0, 100)
  }, [candidatos, busca])

  function toggle(id: string) {
    setElegidos((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  function guardar() {
    setError(null)
    startTransition(async () => {
      const r = await asignarAcreedor([...elegidos], acreedor.id)
      if (r.error) setError(r.error)
      else onClose()
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        Buscá los gastos de esta persona por su nombre o concepto y marcá los que van a la cuenta.
        Solo aparecen los que todavía no están en ninguna cuenta.
      </p>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-soft" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Ej: abogado, contador, Gomez…" className="pl-9" autoFocus />
      </div>

      <div className="max-h-80 overflow-y-auto border border-border rounded-lg divide-y divide-border/50">
        {!busca.trim() ? (
          <p className="text-xs text-fg-soft p-4 text-center">Escribí algo para buscar.</p>
        ) : filtrados.length === 0 ? (
          <p className="text-xs text-fg-soft p-4 text-center">Ningún gasto suelto coincide con “{busca}”.</p>
        ) : (
          filtrados.map((g) => (
            <label key={g.id} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2/50 cursor-pointer">
              <input type="checkbox" checked={elegidos.has(g.id)} onChange={() => toggle(g.id)}
                className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-fg truncate">{g.concepto}</p>
                <p className="text-[11px] text-fg-soft capitalize">{mesLargo(g.mes)}</p>
              </div>
              <span className="text-sm font-mono text-fg-muted shrink-0">{formatCurrency(Number(g.monto))}</span>
            </label>
          ))
        )}
      </div>

      {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-xs text-fg-soft">
          {elegidos.size > 0 ? `${elegidos.size} marcado${elegidos.size === 1 ? '' : 's'}` : ''}
        </span>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={guardar} disabled={isPending || elegidos.size === 0}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Sumar a la cuenta
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── NuevaCuentaForm ──────────────────────────────────────────────────────────
//
// "Abrir una cuenta" = elegir a quién. La cuenta aparece en la lista recién cuando tiene
// algún gasto asignado, así que después hay que sumarle gastos con "Sumar gastos".

function NuevaCuentaForm({ proveedores, yaConCuenta, onElegido, onClose }: {
  proveedores: { id: string; nombre: string }[]
  yaConCuenta: Set<string>
  onElegido: (acreedor: { id: string; nombre: string }) => void
  onClose: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const disponibles = useMemo(
    () => proveedores.filter((p) => !yaConCuenta.has(p.id)),
    [proveedores, yaConCuenta],
  )
  const coincidencias = useMemo(() => {
    const q = nombre.trim().toLowerCase()
    if (!q) return disponibles.slice(0, 8)
    return disponibles.filter((p) => p.nombre.toLowerCase().includes(q)).slice(0, 8)
  }, [disponibles, nombre])

  function crear() {
    setError(null)
    startTransition(async () => {
      const r = await crearAcreedor(nombre)
      if (r.error || !r.id) setError(r.error ?? 'No se pudo crear.')
      else onElegido({ id: r.id, nombre: nombre.trim() })
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input label="¿A quién le abrimos la cuenta?" value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Santiago Gómez (abogado)" autoFocus />
        <p className="text-xs text-fg-muted">
          Si ya está en la lista de abajo, tocalo. Si no, escribí el nombre y crealo: se agrega a la
          misma lista de proveedores que usan las compras, para no tener dos listas de nombres.
        </p>
      </div>

      {coincidencias.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-fg-soft uppercase tracking-wide">Ya están en la lista</p>
          <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1.5">
            {coincidencias.map((p) => (
              <button key={p.id} type="button" onClick={() => onElegido({ id: p.id, nombre: p.nombre })}
                className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border-strong text-xs text-fg-muted hover:text-fg hover:border-primary/40">
                {p.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex items-start gap-2">
          <X className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={crear} disabled={isPending || !nombre.trim()}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Crear y sumar gastos
        </Button>
      </div>
    </div>
  )
}
