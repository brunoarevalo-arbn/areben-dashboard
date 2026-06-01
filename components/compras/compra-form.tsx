'use client'

import { useState, useEffect, useTransition } from 'react'
import { createCompra, updateCompra } from '@/app/actions/compras'
import { MoneyInput } from '@/components/ui/money-input'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Loader2, ChevronDown, ChevronUp,
  CreditCard, Banknote, Building2, FileCheck,
} from 'lucide-react'
import type { Compra, Proveedor } from './compras-client'

// ─── Tipos y constantes locales del form ──────────────────────────────────────

type FormaPago = 'DESPUES' | 'CONTADO' | 'A_PLAZO' | 'EN_CUOTAS'
type Instrumento = 'EFECTIVO' | 'TRANSFERENCIA' | 'CUENTA_CORRIENTE' | 'CHEQUE_FISICO' | 'ECHEQ'

interface CuotaRow {
  monto: number
  fecha_vencimiento: string
  numero_cheque?: string
  banco_emisor?: string
}

const MARCAS = ['BDI', 'ZATTIA', 'STUNNED', 'GENERAL']

const INSTRUMENTO_ICONS: Record<string, React.ReactNode> = {
  EFECTIVO: <Banknote className="w-3.5 h-3.5" />,
  TRANSFERENCIA: <Building2 className="w-3.5 h-3.5" />,
  CUENTA_CORRIENTE: <CreditCard className="w-3.5 h-3.5" />,
  CHEQUE_FISICO: <FileCheck className="w-3.5 h-3.5" />,
  ECHEQ: <FileCheck className="w-3.5 h-3.5" />,
}

function calcularIVA(montoTotal: number, porcentajeFact: number) {
  const baseImponible = montoTotal * (porcentajeFact / 100)
  const neto = baseImponible / 1.21
  const iva = baseImponible - neto
  return {
    baseImponible: Math.round(baseImponible * 100) / 100,
    neto: Math.round(neto * 100) / 100,
    iva: Math.round(iva * 100) / 100,
  }
}

function generarFechaOffset(mesesOffset: number) {
  const d = new Date()
  d.setMonth(d.getMonth() + mesesOffset)
  return d.toISOString().split('T')[0]
}

function generarCuotas(n: number, base: number): CuotaRow[] {
  const montoCuota = Math.round((base / n) * 100) / 100
  return Array.from({ length: n }, (_, i) => ({
    monto:
      i === n - 1
        ? Math.round((base - montoCuota * (n - 1)) * 100) / 100
        : montoCuota,
    fecha_vencimiento: generarFechaOffset(i + 1),
  }))
}

// ─── CompraForm ───────────────────────────────────────────────────────────────

export function CompraForm({ compra, proveedores, onClose }: { compra?: Compra; proveedores: Proveedor[]; onClose: () => void }) {
  const hoy = new Date().toISOString().split('T')[0]
  const editing = !!compra

  // Monto / IVA
  const [montoTotal, setMontoTotal] = useState(compra?.monto_total ?? 0)
  const [porcentajeFact, setPorcentajeFact] = useState(compra?.porcentaje_facturacion ?? 100)
  const [desglosarIVA, setDesglosarIVA] = useState(!!compra && (compra.iva ?? 0) > 0)
  const [montoNeto, setMontoNeto] = useState(compra?.monto_neto ?? 0)
  const [iva, setIva] = useState(compra?.iva ?? 0)

  // Forma de pago — solo aplicable al CREAR; al editar se mantiene 'DESPUES' para no tocar pagos
  const [formaPago, setFormaPago] = useState<FormaPago>('DESPUES')
  const [instrumento, setInstrumento] = useState<Instrumento>('EFECTIVO')
  const [fechaEmisionPago, setFechaEmisionPago] = useState(hoy)
  const [fechaVencimientoPago, setFechaVencimientoPago] = useState('')
  const [numeroCheque, setNumeroCheque] = useState('')
  const [bancoEmisor, setBancoEmisor] = useState('')
  const [numCuotas, setNumCuotas] = useState(3)
  const [cuotas, setCuotas] = useState<CuotaRow[]>([])

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const esCheque = instrumento === 'CHEQUE_FISICO' || instrumento === 'ECHEQ'

  const opcionesInstrumento =
    formaPago === 'CONTADO'
      ? [
          { value: 'EFECTIVO', label: 'Efectivo' },
          { value: 'TRANSFERENCIA', label: 'Transferencia' },
        ]
      : [
          { value: 'CUENTA_CORRIENTE', label: 'Cta. Corriente' },
          { value: 'CHEQUE_FISICO', label: 'Cheque Físico' },
          { value: 'ECHEQ', label: 'E-Cheq' },
        ]

  useEffect(() => {
    if (!desglosarIVA) return
    const calc = calcularIVA(montoTotal, porcentajeFact)
    setMontoNeto(calc.neto)
    setIva(calc.iva)
  }, [montoTotal, porcentajeFact, desglosarIVA])

  useEffect(() => {
    if (formaPago !== 'EN_CUOTAS' || montoTotal <= 0) return
    setCuotas(generarCuotas(numCuotas, montoTotal))
  }, [formaPago, numCuotas, montoTotal])

  function handleFormaPagoChange(v: FormaPago) {
    setFormaPago(v)
    if (v === 'CONTADO') setInstrumento('EFECTIVO')
    else if (v !== 'DESPUES') setInstrumento('CUENTA_CORRIENTE')
    setFechaVencimientoPago('')
  }

  function handleToggleIVA() {
    const nuevo = !desglosarIVA
    setDesglosarIVA(nuevo)
    if (nuevo) {
      const calc = calcularIVA(montoTotal, porcentajeFact)
      setMontoNeto(calc.neto)
      setIva(calc.iva)
    } else {
      setMontoNeto(0)
      setIva(0)
    }
  }

  function updateCuota(i: number, field: keyof CuotaRow, value: string | number) {
    setCuotas((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('monto_total', String(montoTotal))
    fd.set('porcentaje_facturacion', String(porcentajeFact))
    fd.set('monto_neto', String(desglosarIVA ? montoNeto : montoTotal))
    fd.set('iva', String(desglosarIVA ? iva : 0))
    fd.set('precio_unitario', String(montoTotal))
    fd.set('cantidad', '1')

    if (formaPago !== 'DESPUES') {
      fd.set('registrar_pago', 'true')
      fd.set('condicion_pago', formaPago === 'CONTADO' ? 'CONTADO' : formaPago === 'A_PLAZO' ? 'A_PLAZO' : 'EN_CUOTAS')
      fd.set('instrumento', instrumento)
      fd.set('fecha_emision_pago', fechaEmisionPago)
      if (fechaVencimientoPago) fd.set('fecha_vencimiento_pago', fechaVencimientoPago)
      if (numeroCheque) fd.set('numero_cheque', numeroCheque)
      if (bancoEmisor) fd.set('banco_emisor', bancoEmisor)
      if (formaPago === 'EN_CUOTAS') {
        fd.set('cuotas', JSON.stringify(cuotas))
      } else {
        fd.set('monto_pago', String(montoTotal))
      }
    } else {
      fd.set('registrar_pago', 'false')
    }

    startTransition(async () => {
      const result = editing
        ? await updateCompra(compra!.id, null, fd)
        : await createCompra(null, fd)
      if (result) setError(result)
      else onClose()
    })
  }

  const totalCuotas = cuotas.reduce((s, c) => s + (c.monto || 0), 0)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Select
          label="Proveedor"
          name="proveedor_id"
          defaultValue={compra?.proveedor_id ?? ''}
          options={proveedores.map((p) => ({ value: p.id, label: p.nombre }))}
          placeholder="Seleccionar..."
          required
        />
        <Select
          label="Negocio"
          name="negocio"
          defaultValue={compra?.negocio ?? 'GENERAL'}
          options={MARCAS.map((m) => ({ value: m, label: m }))}
        />
      </div>

      <Input label="Descripción" name="descripcion" defaultValue={compra?.descripcion ?? ''} placeholder="Qué se compró" required />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Input label="Fecha" name="fecha" type="date" defaultValue={compra?.fecha ?? hoy} required />
        <Select
          label="Moneda"
          name="moneda"
          defaultValue={compra?.moneda ?? 'ARS'}
          options={[
            { value: 'ARS', label: 'ARS (Pesos)' },
            { value: 'USD', label: 'USD (Dólares)' },
          ]}
        />
      </div>

      {/* Monto e IVA */}
      <div className="bg-surface-2 rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <MoneyInput
            label="Monto total (con IVA)"
            value={montoTotal}
            onChange={setMontoTotal}
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-fg-muted">% Facturado</label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={porcentajeFact}
                onChange={(e) => setPorcentajeFact(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-sm pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted text-sm">%</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggleIVA}
          className={cn(
            'w-full flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
            desglosarIVA
              ? 'bg-orange-500/20 border-orange-500/40 text-orange-600'
              : 'bg-surface-2 border-[#c8c0b0] text-fg-muted hover:bg-slate-600'
          )}
        >
          <span>Desglosar IVA (21%)</span>
          {desglosarIVA ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {desglosarIVA && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs text-fg-muted px-1">
              <span>Base imponible = ${formatCurrency(montoTotal * porcentajeFact / 100).replace('$', '')}</span>
              <span className="text-fg-soft">({porcentajeFact}% de {formatCurrency(montoTotal)})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-fg-muted">
                  Neto sin IVA <span className="text-fg-soft font-normal">(editable)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={montoNeto || ''}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    setMontoNeto(n)
                    setIva(Math.round((montoTotal * porcentajeFact / 100 - n) * 100) / 100)
                  }}
                  className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-green-700 font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-fg-muted">
                  IVA (21%) <span className="text-fg-soft font-normal">(editable)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={iva || ''}
                  onChange={(e) => {
                    const iv = Number(e.target.value)
                    setIva(iv)
                    setMontoNeto(Math.round((montoTotal * porcentajeFact / 100 - iv) * 100) / 100)
                  }}
                  className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-amber-700 font-mono focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="flex items-center justify-between bg-surface-2/50 rounded-lg px-4 py-2.5 text-sm">
              <span className="text-fg-muted">Verificación:</span>
              <span className={cn(
                'font-mono font-medium',
                Math.abs(montoNeto + iva - montoTotal * porcentajeFact / 100) < 0.02
                  ? 'text-green-700'
                  : 'text-red-700'
              )}>
                {formatCurrency(montoNeto)} + {formatCurrency(iva)} = {formatCurrency(montoNeto + iva)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Forma de pago — solo en creación */}
      {!editing && (
      <div className="space-y-3">
        <label className="block text-sm font-medium text-fg-muted">Forma de pago</label>
        <div className="grid grid-cols-4 gap-2">
          {([
            { v: 'DESPUES', label: 'Registrar después' },
            { v: 'CONTADO', label: 'Contado' },
            { v: 'A_PLAZO', label: 'A Plazo' },
            { v: 'EN_CUOTAS', label: 'En Cuotas' },
          ] as { v: FormaPago; label: string }[]).map(({ v, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => handleFormaPagoChange(v)}
              className={cn(
                'px-2 py-2 rounded-lg border text-xs font-medium transition-colors text-center',
                formaPago === v
                  ? 'bg-orange-500/20 border-orange-500/50 text-orange-600'
                  : 'bg-surface-2 border-border-strong text-fg-muted hover:text-fg-muted'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {formaPago !== 'DESPUES' && (
          <div className="bg-surface-2/60 border border-border-strong/60 rounded-xl p-4 space-y-3">
            {/* Instrumento */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-fg-muted">Instrumento</label>
              <div className="flex gap-2 flex-wrap">
                {opcionesInstrumento.map((op) => {
                  const Icon = INSTRUMENTO_ICONS[op.value]
                  return (
                    <button
                      key={op.value}
                      type="button"
                      onClick={() => {
                        setInstrumento(op.value as Instrumento)
                        setFechaVencimientoPago('')
                      }}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                        instrumento === op.value
                          ? 'bg-orange-500/20 border-orange-500/50 text-orange-600'
                          : 'bg-surface-2 border-[#c8c0b0] text-fg-muted hover:text-fg-muted'
                      )}
                    >
                      {Icon}
                      {op.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Fecha de emisión */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-fg-muted">Fecha de emisión</label>
                <input
                  type="date"
                  value={fechaEmisionPago}
                  onChange={(e) => setFechaEmisionPago(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>

              {/* Fecha de vencimiento para cheques o A Plazo */}
              {(esCheque || formaPago === 'A_PLAZO') && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-fg-muted">
                    Fecha de cobro / vencimiento
                    {esCheque && <span className="text-red-700 ml-1">*</span>}
                  </label>
                  <input
                    type="date"
                    value={fechaVencimientoPago}
                    onChange={(e) => setFechaVencimientoPago(e.target.value)}
                    required={esCheque}
                    className={cn(
                      'w-full px-3 py-2 bg-surface-2 border rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm',
                      esCheque ? 'border-amber-500/40' : 'border-[#c8c0b0]'
                    )}
                  />
                </div>
              )}
            </div>

            {/* Datos cheque */}
            {esCheque && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-fg-muted">Número de cheque</label>
                  <input
                    type="text"
                    value={numeroCheque}
                    onChange={(e) => setNumeroCheque(e.target.value)}
                    placeholder="Nro."
                    className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-fg-muted">Banco emisor</label>
                  <input
                    type="text"
                    value={bancoEmisor}
                    onChange={(e) => setBancoEmisor(e.target.value)}
                    placeholder="Ej: Nación"
                    className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              </div>
            )}

            {/* Tabla de cuotas */}
            {formaPago === 'EN_CUOTAS' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-fg-muted">Cuotas</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNumCuotas((n) => Math.max(2, n - 1))}
                      className="w-6 h-6 rounded bg-surface-2 hover:bg-slate-600 text-fg-muted flex items-center justify-center font-bold text-sm"
                    >−</button>
                    <span className="text-xs font-mono text-fg-muted w-6 text-center">{numCuotas}</span>
                    <button
                      type="button"
                      onClick={() => setNumCuotas((n) => Math.min(36, n + 1))}
                      className="w-6 h-6 rounded bg-surface-2 hover:bg-slate-600 text-fg-muted flex items-center justify-center font-bold text-sm"
                    >+</button>
                  </div>
                </div>
                <div className="bg-surface-2 rounded-lg overflow-hidden border border-border-strong/50 max-h-52 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface-2 border-b border-border-strong">
                      <tr>
                        <th className="text-left px-3 py-1.5 text-fg-soft font-medium w-8">#</th>
                        <th className="text-left px-3 py-1.5 text-fg-soft font-medium">Monto</th>
                        <th className="text-left px-3 py-1.5 text-fg-soft font-medium">Vencimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuotas.map((c, i) => (
                        <tr key={i} className="border-b border-border-strong/50 last:border-0">
                          <td className="px-3 py-1.5 text-fg-soft">{i + 1}</td>
                          <td className="px-3 py-1.5">
                            <input
                              type="number"
                              step="0.01"
                              value={c.monto || ''}
                              onChange={(e) => updateCuota(i, 'monto', Number(e.target.value))}
                              className="w-full px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-fg font-mono focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="date"
                              value={c.fecha_vencimiento}
                              onChange={(e) => updateCuota(i, 'fecha_vencimiento', e.target.value)}
                              required
                              className="w-full px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-fg focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-between items-center px-1 text-xs">
                  <span className="text-fg-soft">Total cuotas:</span>
                  <span className={cn(
                    'font-mono font-medium',
                    Math.abs(totalCuotas - montoTotal) < 0.02 ? 'text-green-700' : 'text-amber-700'
                  )}>
                    {formatCurrency(totalCuotas)}
                    {Math.abs(totalCuotas - montoTotal) >= 0.02 && (
                      <span className="text-fg-soft ml-1">(dif. {formatCurrency(totalCuotas - montoTotal)})</span>
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      <input type="hidden" name="estado" value={compra?.estado ?? 'PENDIENTE'} />
      <Textarea label="Notas (opcional)" name="notas" defaultValue={compra?.notas ?? ''} placeholder="Número de factura, condiciones..." />

      {error && (
        <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {editing ? 'Guardar cambios' : 'Registrar compra'}
        </Button>
      </div>
    </form>
  )
}
