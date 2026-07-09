'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  createImpuesto, renameImpuesto, deleteImpuesto, setSaldoImpositivo,
} from '@/app/actions/finanzas'
import type { CuentaPatrimonial, SaldoCuentaPatrim } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { formatCurrency, getMonthOptions, cn } from '@/lib/utils'
import {
  Plus, Pencil, Trash2, Loader2, Save, X, Receipt, Check,
} from 'lucide-react'

type Posicion = 'favor' | 'pagar'

interface Props {
  mes: string
  cuentas: CuentaPatrimonial[]
  saldos: SaldoCuentaPatrim[]
}

// De un saldo guardado → posición + monto positivo que ve el usuario
function leerPosicion(cierre: number | null | undefined): { posicion: Posicion; monto: number; cargado: boolean } {
  const c = Number(cierre ?? 0)
  if (cierre === null || cierre === undefined) return { posicion: 'favor', monto: 0, cargado: false }
  return { posicion: c < 0 ? 'pagar' : 'favor', monto: Math.abs(c), cargado: true }
}

// ─── ImpuestoRow ─────────────────────────────────────────────────────────────

function ImpuestoRow({
  cuenta,
  saldo,
  mes,
}: {
  cuenta: CuentaPatrimonial
  saldo: SaldoCuentaPatrim | undefined
  mes: string
}) {
  const inicial = leerPosicion(saldo?.saldo_cierre)
  const [editing, setEditing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nombre, setNombre] = useState(cuenta.nombre)
  const [posicion, setPosicion] = useState<Posicion>(inicial.posicion)
  const [monto, setMonto] = useState<number>(inicial.monto)
  const [isPending, startTransition] = useTransition()

  function guardarSaldo() {
    startTransition(async () => {
      try {
        await setSaldoImpositivo({ cuentaId: cuenta.id, mes, posicion, monto })
        setEditing(false)
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  function guardarNombre() {
    startTransition(async () => {
      try {
        await renameImpuesto(cuenta.id, nombre)
        setRenaming(false)
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  function borrar() {
    if (!confirm(`¿Eliminar "${cuenta.nombre}"? Se borran todos sus saldos de todos los meses.`)) return
    startTransition(async () => {
      try {
        await deleteImpuesto(cuenta.id)
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  const esFavor = inicial.posicion === 'favor'

  return (
    <tr className="border-b border-border/60 hover:bg-surface-2/30">
      {/* Nombre */}
      <td className="px-4 py-2.5">
        {renaming ? (
          <div className="flex items-center gap-1">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-48 px-2 py-1 bg-surface-2 border border-border-strong rounded text-fg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <button onClick={guardarNombre} disabled={isPending} className="p-1 rounded bg-green-600/20 text-green-700 hover:bg-green-600/30" title="Guardar nombre">
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            </button>
            <button onClick={() => { setRenaming(false); setNombre(cuenta.nombre) }} className="p-1 rounded bg-surface-2 text-fg-muted"><X className="w-3 h-3" /></button>
          </div>
        ) : (
          <p className="text-fg text-sm font-medium">{cuenta.nombre}</p>
        )}
      </td>

      {/* Posición + monto */}
      <td className="px-3 py-2.5">
        {editing ? (
          <div className="flex items-center gap-2 justify-end">
            <div className="grid grid-cols-2 gap-1">
              {([
                { v: 'favor', label: 'A favor' },
                { v: 'pagar', label: 'A pagar' },
              ] as const).map((p) => (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => setPosicion(p.v)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap',
                    posicion === p.v
                      ? p.v === 'favor'
                        ? 'bg-green-500/15 border-green-500/40 text-green-700'
                        : 'bg-red-500/15 border-red-500/40 text-red-700'
                      : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="number"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(Number(e.target.value))}
              placeholder="0"
              className="w-36 px-2 py-1.5 bg-surface-2 border border-border-strong rounded text-fg font-mono text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 justify-end">
            {inicial.cargado ? (
              <>
                <span className={cn(
                  'text-[11px] font-medium px-2 py-0.5 rounded-full border',
                  esFavor ? 'border-green-500/40 text-green-700 bg-green-500/10' : 'border-red-500/40 text-red-700 bg-red-500/10',
                )}>
                  {esFavor ? 'A favor' : 'A pagar'}
                </span>
                <span className="font-mono text-fg text-sm w-36 text-right">{formatCurrency(inicial.monto)}</span>
              </>
            ) : (
              <span className="text-xs text-fg-soft w-36 text-right italic">sin cargar</span>
            )}
          </div>
        )}
      </td>

      {/* Acciones */}
      <td className="px-2 py-2.5 text-right">
        <div className="flex items-center gap-1 justify-end">
          {editing ? (
            <>
              <button onClick={guardarSaldo} disabled={isPending} className="p-1.5 rounded bg-green-600/20 text-green-700 hover:bg-green-600/30" title="Guardar">
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => { setEditing(false); setPosicion(inicial.posicion); setMonto(inicial.monto) }}
                className="p-1.5 rounded bg-surface-2 text-fg-muted"
                title="Cancelar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} title="Cargar / editar saldo del mes" className="p-1.5 rounded hover:bg-surface-2 text-primary">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setRenaming(true)} title="Renombrar impuesto" className="p-1.5 rounded hover:bg-surface-2 text-fg-muted">
                <Receipt className="w-3.5 h-3.5" />
              </button>
              <button onClick={borrar} title="Eliminar impuesto" className="p-1.5 rounded hover:bg-surface-2 text-red-700">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── SaldosImpositivosClient ───────────────────────────────────────────────────

export function SaldosImpositivosClient({ mes, cuentas, saldos }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [modal, setModal] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState<string | null>(null)

  const saldosByCuenta = useMemo(() => {
    const m = new Map<string, SaldoCuentaPatrim>()
    for (const s of saldos) m.set(s.cuenta_id, s)
    return m
  }, [saldos])

  // Totales del mes
  const { totalFavor, totalPagar } = useMemo(() => {
    let favor = 0, pagar = 0
    for (const c of cuentas) {
      const cierre = Number(saldosByCuenta.get(c.id)?.saldo_cierre ?? 0)
      if (cierre > 0) favor += cierre
      else if (cierre < 0) pagar += Math.abs(cierre)
    }
    return { totalFavor: favor, totalPagar: pagar }
  }, [cuentas, saldosByCuenta])

  const neta = totalFavor - totalPagar

  function setMes(nuevo: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', nuevo)
    router.push(`?${params.toString()}`)
  }

  function crear() {
    setErrorCrear(null)
    setCreando(true)
    startCrear()
    async function startCrear() {
      const err = await createImpuesto(nuevoNombre)
      setCreando(false)
      if (err) { setErrorCrear(err); return }
      setNuevoNombre('')
      setModal(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Receipt className="w-6 h-6 text-primary" />
            Saldos Impositivos
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">
            Posición de cada impuesto en el mes — <span className="text-green-700 font-medium">a favor</span> (te lo deben, suma como activo) o{' '}
            <span className="text-red-700 font-medium">a pagar</span> (lo debés, resta como pasivo). Impacta el resultado del mes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select options={getMonthOptions(24)} value={mes} onChange={(e) => setMes(e.target.value)} className="w-44" />
          <Button onClick={() => { setNuevoNombre(''); setErrorCrear(null); setModal(true) }}>
            <Plus className="w-4 h-4" />
            Nuevo impuesto
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-surface border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">A favor (activo)</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totalFavor)}</p>
        </div>
        <div className="bg-surface border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">A pagar (pasivo)</p>
          <p className="text-xl font-bold text-red-700">{formatCurrency(totalPagar)}</p>
        </div>
        <div className="bg-surface border border-orange-500/20 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Posición neta del mes</p>
          <p className={cn('text-xl font-bold', neta >= 0 ? 'text-primary' : 'text-amber-700')}>
            {neta >= 0 ? '+' : ''}{formatCurrency(neta)}
            <span className="block text-[11px] font-normal text-fg-soft">{neta >= 0 ? 'a favor neto' : 'a pagar neto'}</span>
          </p>
        </div>
      </div>

      {/* Tabla */}
      {cuentas.length > 0 ? (
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-[10px] font-medium text-fg-muted uppercase">Impuesto</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-fg-muted uppercase">Posición del mes</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <ImpuestoRow key={c.id} cuenta={c} saldo={saldosByCuenta.get(c.id)} mes={mes} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <Receipt className="w-8 h-8 mx-auto mb-2 text-fg-muted" />
          <p className="text-fg-soft mb-3">Todavía no cargaste ningún impuesto</p>
          <Button onClick={() => { setNuevoNombre(''); setErrorCrear(null); setModal(true) }}>
            <Plus className="w-3.5 h-3.5" />
            Crear el primero
          </Button>
        </div>
      )}

      {/* Modal nuevo impuesto */}
      <Modal open={modal} onOpenChange={setModal} title="Nuevo impuesto" className="max-w-md">
        <div className="space-y-4">
          <Input
            label="Nombre del impuesto"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Ej: IVA técnico, Ganancias, IIBB, DREI…"
            autoFocus
          />
          <p className="text-xs text-fg-soft">
            Después, en cada mes, marcás si está <span className="text-green-700">a favor</span> o <span className="text-red-700">a pagar</span> y el monto.
          </p>
          {errorCrear && <p className="text-sm text-red-700">{errorCrear}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
            <Button type="button" onClick={crear} disabled={creando || !nuevoNombre.trim()}>
              {creando && <Loader2 className="w-4 h-4 animate-spin" />}
              Crear impuesto
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
