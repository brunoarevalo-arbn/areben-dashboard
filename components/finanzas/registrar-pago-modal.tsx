'use client'

import { useEffect, useState, useTransition } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { formatCurrency, formatDate, cn, labelCuenta, ordenarCuentas } from '@/lib/utils'
import { Loader2, Wallet, CreditCard, Banknote, FileCheck, Trash2, Pencil, AlertCircle } from 'lucide-react'
import type { TipoOrigenPago, InstrumentoPago } from '@/types/database'
import { createPagoUnificado, deletePagoUnificado, crearGastoIntereses, editPago } from '@/app/actions/pagos'

export interface PagoTarget {
  tipo_origen: TipoOrigenPago
  origen_id: string | null
  /** Total de la deuda (para mostrar contexto y validar) */
  monto_total: number
  /** Saldo pendiente actual (para sugerir y validar). Si es null, se permite cualquier monto. */
  saldo_pendiente?: number | null
  moneda?: 'ARS' | 'USD'
  descripcion: string
  contexto?: string | null
  /** Cuenta a pre-seleccionar en el formulario (p. ej. cuenta_id del gasto/recurrente). */
  default_cuenta_id?: string | null
}

export interface PagoHistorialItem {
  id: string
  fecha_emision: string
  fecha_vencimiento?: string | null
  monto: number
  moneda: 'ARS' | 'USD'
  instrumento: string
  cuenta_id?: string | null
  numero_cheque?: string | null
  banco_emisor?: string | null
  notas?: string | null
  acreditado?: boolean
  fecha_acreditacion?: string | null
}

const INSTRUMENTOS: { value: InstrumentoPago; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'TRANSFERENCIA', label: 'Transferencia', icon: Banknote },
  { value: 'EFECTIVO', label: 'Efectivo', icon: Wallet },
  { value: 'CHEQUE_FISICO', label: 'Cheque físico', icon: FileCheck },
  { value: 'ECHEQ', label: 'E-cheq', icon: FileCheck },
  { value: 'CUENTA_CORRIENTE', label: 'Cuenta corriente', icon: Banknote },
  { value: 'TARJETA', label: 'Tarjeta', icon: CreditCard },
]

export function RegistrarPagoModal({
  open,
  onOpenChange,
  target,
  cuentas,
  historial,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  target: PagoTarget | null
  cuentas: { id: string; nombre: string; banco: string; titular?: { nombre: string } | null }[]
  /** Pagos previos contra este origen — si se pasa, se muestra arriba con opción de eliminar. */
  historial?: PagoHistorialItem[]
  onSuccess?: () => void
}) {
  const [monto, setMonto] = useState<number>(0)
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0])
  const [instrumento, setInstrumento] = useState<InstrumentoPago>('TRANSFERENCIA')
  const [cuentaId, setCuentaId] = useState('')
  const [numeroCheque, setNumeroCheque] = useState('')
  const [bancoEmisor, setBancoEmisor] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Interés / punitorio (para deudas vencidas)
  const [tieneInteres, setTieneInteres] = useState(false)
  const [interesTipo, setInteresTipo] = useState<'MONTO' | 'PORCENTAJE'>('MONTO')
  const [interesValor, setInteresValor] = useState<number>(0)
  const [interesConcepto, setInteresConcepto] = useState<'INTERES' | 'PUNITORIO' | 'MORA'>('PUNITORIO')
  const [editTarget, setEditTarget] = useState<PagoHistorialItem | null>(null)
  const [isPending, startTransition] = useTransition()

  // Pre-fill cuenta cuando cambia el target (al abrir contra otro gasto/cuota)
  useEffect(() => {
    if (target?.default_cuenta_id) setCuentaId(target.default_cuenta_id)
  }, [target?.default_cuenta_id, target?.origen_id])

  function reset() {
    setMonto(0)
    setFecha(new Date().toISOString().split('T')[0])
    setInstrumento('TRANSFERENCIA')
    setCuentaId('')
    setNumeroCheque('')
    setBancoEmisor('')
    setFechaVencimiento('')
    setNotas('')
    setError(null)
    setTieneInteres(false)
    setInteresTipo('MONTO')
    setInteresValor(0)
    setInteresConcepto('PUNITORIO')
  }

  function close() {
    reset()
    onOpenChange(false)
  }

  function pagarTodo() {
    if (target?.saldo_pendiente != null) setMonto(Number(target.saldo_pendiente))
    else if (target?.monto_total != null) setMonto(Number(target.monto_total))
  }

  function submit() {
    setError(null)
    if (!target) return
    if (!monto || monto <= 0) {
      setError('Ingresá un monto positivo')
      return
    }
    if (target.tipo_origen !== 'LIBRE' && !target.origen_id) {
      setError('Origen inválido')
      return
    }
    if ((instrumento === 'CHEQUE_FISICO' || instrumento === 'ECHEQ') && !fechaVencimiento) {
      setError('Los cheques requieren fecha de vencimiento')
      return
    }

    startTransition(async () => {
      try {
        await createPagoUnificado({
          tipo_origen: target.tipo_origen,
          origen_id: target.origen_id,
          monto,
          moneda: target.moneda ?? 'ARS',
          fecha_emision: fecha,
          fecha_vencimiento: fechaVencimiento || null,
          instrumento,
          cuenta_id: cuentaId || null,
          numero_cheque: numeroCheque || null,
          banco_emisor: bancoEmisor || null,
          notas: notas || null,
        })
        // Si hay interés/punitorio, crear el gasto financiero asociado
        if (tieneInteres && interesValor > 0) {
          const interesMonto = interesTipo === 'MONTO'
            ? interesValor
            : Math.round((monto * interesValor / 100) * 100) / 100
          if (interesMonto > 0) {
            await crearGastoIntereses({
              monto: interesMonto,
              moneda: target.moneda ?? 'ARS',
              fecha,
              descripcion: target.descripcion,
              cuentaId: cuentaId || null,
              concepto: interesConcepto,
              origenDescripcion: target.contexto ?? target.descripcion,
            })
          }
        }
        onSuccess?.()
        close()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  if (!target) return null

  const saldo = target.saldo_pendiente ?? target.monto_total
  const requiereCheque = instrumento === 'CHEQUE_FISICO' || instrumento === 'ECHEQ'
  const requiereCuenta = ['TRANSFERENCIA', 'EFECTIVO', 'CUENTA_CORRIENTE'].includes(instrumento)
  const moneda = target.moneda ?? 'ARS'
  const excede = monto > 0 && target.saldo_pendiente != null && monto > Number(target.saldo_pendiente) + 0.01

  const totalPagadoHist = (historial ?? []).reduce((s, p) => s + Number(p.monto), 0)
  const pagadoPct = target.monto_total > 0 ? Math.min(100, (totalPagadoHist / target.monto_total) * 100) : 0

  async function borrarPago(id: string) {
    if (!confirm('¿Eliminar este pago?')) return
    startTransition(async () => {
      try {
        await deletePagoUnificado(id)
        onSuccess?.()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }} title="Registrar pago" className="max-w-md">
      <div className="space-y-4">
        {/* Contexto del pago */}
        <div className="bg-surface-2/60 rounded-lg p-3 border border-border-strong/40">
          <p className="text-xs text-fg-muted uppercase tracking-wider mb-1">Pagar contra</p>
          <p className="text-sm font-medium text-fg">{target.descripcion}</p>
          {target.contexto && <p className="text-xs text-fg-soft mt-0.5">{target.contexto}</p>}
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-fg-muted">Total deuda</p>
              <p className="font-mono font-semibold text-fg">{formatCurrency(target.monto_total, moneda)}</p>
            </div>
            <div>
              <p className="text-fg-muted">Saldo pendiente</p>
              <p className="font-mono font-semibold text-amber-700">{formatCurrency(saldo, moneda)}</p>
            </div>
          </div>
          {historial && historial.length > 0 && (
            <div className="mt-2 h-1 w-full bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-green-400 transition-all" style={{ width: `${pagadoPct}%` }} />
            </div>
          )}
        </div>

        {/* Historial de pagos previos */}
        {historial && historial.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Historial de pagos ({historial.length})</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {historial.map((p) => {
                const cuenta = cuentas.find((c) => c.id === p.cuenta_id)
                const editing = editTarget?.id === p.id
                return (
                  <div key={p.id} className="bg-surface-2/40 border border-border-strong/40 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 flex items-center justify-between">
                      <div className="text-xs">
                        <p className="text-fg-muted">
                          <span className="font-mono text-green-700 font-semibold">{formatCurrency(p.monto, p.moneda)}</span>
                          <span className="text-fg-soft ml-2">·</span>
                          <span className="text-fg-muted ml-2">{formatDate(p.fecha_emision)}</span>
                        </p>
                        <p className="text-fg-soft mt-0.5">
                          {p.instrumento.replace('_', ' ').toLowerCase()}
                          {cuenta ? ` · ${cuenta.banco} ${cuenta.nombre}` : ''}
                          {p.notas ? ` · ${p.notas}` : ''}
                        </p>
                        {p.acreditado
                          ? p.fecha_acreditacion && (
                            <p className="text-[10px] text-green-700 mt-0.5">✓ Acreditado {formatDate(p.fecha_acreditacion)}</p>
                          )
                          : p.acreditado === false && (
                            <p className="text-[10px] text-amber-700 mt-0.5">● Programado — sin acreditar</p>
                          )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditTarget(editing ? null : p)}
                          disabled={isPending}
                          title="Editar fechas, número/banco de cheque o notas"
                          className="text-primary hover:text-orange-600 disabled:opacity-40"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => borrarPago(p.id)}
                          disabled={isPending}
                          title="Eliminar este pago"
                          className="text-red-700 hover:text-danger disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {editing && (
                      <EditarPagoInline
                        pago={p}
                        onClose={() => setEditTarget(null)}
                        onSaved={() => { setEditTarget(null); onSuccess?.() }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Monto + atajo "pagar todo" */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-fg-muted">Monto a pagar</label>
            {target.saldo_pendiente != null && Number(target.saldo_pendiente) > 0 && (
              <button
                type="button"
                onClick={pagarTodo}
                className="text-xs text-primary hover:text-orange-600"
                title="Cargar el saldo pendiente completo"
              >
                Pagar todo ({formatCurrency(saldo, moneda)})
              </button>
            )}
          </div>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={monto || ''}
            onChange={(e) => setMonto(Number(e.target.value))}
            placeholder="0,00"
            className="w-full px-3 py-2 bg-surface-2 border border-border-strong rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {excede && (
            <p className="text-xs text-amber-700">El monto excede el saldo pendiente</p>
          )}
        </div>

        <Input label="Fecha del pago" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />

        <Select
          label="Instrumento"
          value={instrumento}
          onChange={(e) => setInstrumento(e.target.value as InstrumentoPago)}
          options={INSTRUMENTOS.map((i) => ({ value: i.value, label: i.label }))}
        />

        {requiereCuenta && (
          <Select
            label={instrumento === 'EFECTIVO' ? 'Caja' : 'Cuenta de origen'}
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            options={[{ value: '', label: '— Sin asignar —' }, ...ordenarCuentas(cuentas).map((c) => ({ value: c.id, label: labelCuenta(c) }))]}
          />
        )}

        {requiereCheque && (
          <div className="bg-surface-2/40 border border-border-strong/40 rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="N° de cheque" value={numeroCheque} onChange={(e) => setNumeroCheque(e.target.value)} placeholder="12345678" />
              <Input label="Banco emisor" value={bancoEmisor} onChange={(e) => setBancoEmisor(e.target.value)} placeholder="Galicia, MP, etc." />
            </div>
            <Input
              label="Fecha de vencimiento"
              type="date"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
              required
            />
            <p className="text-xs text-fg-soft">El cheque queda como pendiente de acreditación hasta su vencimiento.</p>
          </div>
        )}

        <Textarea
          label="Notas"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Adelanto, vale, etc."
        />

        {/* Interés / Punitorio (deudas vencidas) */}
        <div className={cn(
          'border rounded-lg p-3 space-y-2 transition-colors',
          tieneInteres ? 'bg-amber-500/10 border-amber-500/30' : 'bg-surface-2/40 border-border-strong/40'
        )}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={tieneInteres}
              onChange={(e) => setTieneInteres(e.target.checked)}
              className="w-4 h-4 rounded border-[#c8c0b0] bg-surface-2"
            />
            <AlertCircle className={cn('w-4 h-4', tieneInteres ? 'text-amber-700' : 'text-fg-soft')} />
            <span className="text-sm text-fg-muted">Cobro interés / punitorio (pago vencido)</span>
          </label>
          {tieneInteres && (
            <>
              <div className="grid grid-cols-2 gap-2 pl-6">
                <Select
                  label="Concepto"
                  value={interesConcepto}
                  onChange={(e) => setInteresConcepto(e.target.value as typeof interesConcepto)}
                  options={[
                    { value: 'PUNITORIO', label: 'Punitorio' },
                    { value: 'INTERES', label: 'Interés' },
                    { value: 'MORA', label: 'Mora' },
                  ]}
                />
                <Select
                  label="Tipo"
                  value={interesTipo}
                  onChange={(e) => setInteresTipo(e.target.value as typeof interesTipo)}
                  options={[
                    { value: 'MONTO', label: 'Monto fijo $' },
                    { value: 'PORCENTAJE', label: '% sobre monto pagado' },
                  ]}
                />
              </div>
              <div className="pl-6">
                <label className="block text-xs font-medium text-fg-muted mb-1">
                  {interesTipo === 'MONTO' ? 'Monto del recargo ($)' : 'Porcentaje (%)'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={interesValor || ''}
                    onChange={(e) => setInteresValor(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 bg-surface-2 border border-border-strong rounded-lg text-fg font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-soft text-xs">
                    {interesTipo === 'MONTO' ? '$' : '%'}
                  </span>
                </div>
              </div>
              {interesValor > 0 && monto > 0 && (() => {
                const calc = interesTipo === 'MONTO'
                  ? interesValor
                  : Math.round((monto * interesValor / 100) * 100) / 100
                return (
                  <div className="pl-6 bg-surface/40 rounded-lg px-3 py-2 text-xs text-fg-muted flex items-center justify-between">
                    <span>Se creará un gasto en <strong>"Gasto Financiero"</strong> por:</span>
                    <span className="font-mono text-amber-700 font-semibold">{formatCurrency(calc, target.moneda ?? 'ARS')}</span>
                  </div>
                )
              })()}
            </>
          )}
        </div>

        {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={close}>Cancelar</Button>
          <Button
            type="button"
            onClick={submit}
            disabled={isPending || !monto || excede}
            title="Confirmar el pago contra esta deuda"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Registrar pago
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── EditarPagoInline ─────────────────────────────────────────────────────────
// Edición liviana inline: fechas, datos de cheque, notas. Para cambios estructurales
// (monto/instrumento/cuenta) se borra y se recrea.

function EditarPagoInline({
  pago,
  onClose,
  onSaved,
}: {
  pago: PagoHistorialItem
  onClose: () => void
  onSaved: () => void
}) {
  const [fechaEmision, setFechaEmision] = useState(pago.fecha_emision)
  const [fechaVencimiento, setFechaVencimiento] = useState(pago.fecha_vencimiento ?? '')
  const [numeroCheque, setNumeroCheque] = useState(pago.numero_cheque ?? '')
  const [bancoEmisor, setBancoEmisor] = useState(pago.banco_emisor ?? '')
  const [notas, setNotas] = useState(pago.notas ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const esCheque = pago.instrumento === 'CHEQUE_FISICO' || pago.instrumento === 'ECHEQ'

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        await editPago(pago.id, {
          fecha_emision: fechaEmision,
          fecha_vencimiento: fechaVencimiento || null,
          numero_cheque: numeroCheque || null,
          banco_emisor: bancoEmisor || null,
          notas: notas || null,
        })
        onSaved()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="border-t border-border-strong/40 bg-surface/40 px-3 py-3 space-y-2">
      <p className="text-[10px] text-fg-soft">
        Para cambiar monto, instrumento o cuenta: eliminá este pago y creá uno nuevo.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-fg-muted mb-0.5">Fecha emisión</label>
          <input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)}
            className="w-full px-2 py-1 bg-surface-2 border border-border-strong rounded text-xs text-fg" />
        </div>
        <div>
          <label className="block text-[10px] text-fg-muted mb-0.5">Fecha vencimiento</label>
          <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)}
            className="w-full px-2 py-1 bg-surface-2 border border-border-strong rounded text-xs text-fg" />
        </div>
      </div>
      {esCheque && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-fg-muted mb-0.5">N° cheque</label>
            <input type="text" value={numeroCheque} onChange={(e) => setNumeroCheque(e.target.value)}
              className="w-full px-2 py-1 bg-surface-2 border border-border-strong rounded text-xs text-fg" />
          </div>
          <div>
            <label className="block text-[10px] text-fg-muted mb-0.5">Banco emisor</label>
            <input type="text" value={bancoEmisor} onChange={(e) => setBancoEmisor(e.target.value)}
              className="w-full px-2 py-1 bg-surface-2 border border-border-strong rounded text-xs text-fg" />
          </div>
        </div>
      )}
      <div>
        <label className="block text-[10px] text-fg-muted mb-0.5">Notas</label>
        <input type="text" value={notas} onChange={(e) => setNotas(e.target.value)}
          className="w-full px-2 py-1 bg-surface-2 border border-border-strong rounded text-xs text-fg" />
      </div>
      {error && <p className="text-[11px] text-red-700">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={submit} disabled={isPending}>
          {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
          Guardar
        </Button>
      </div>
    </div>
  )
}
