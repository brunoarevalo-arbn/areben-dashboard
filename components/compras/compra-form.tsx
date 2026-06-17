'use client'

import { useState, useEffect, useTransition } from 'react'
import { createCompra, updateCompra } from '@/app/actions/compras'
import { MoneyInput } from '@/components/ui/money-input'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import {
  Loader2, ChevronDown, ChevronUp,
  CreditCard, Banknote, Building2, FileCheck,
} from 'lucide-react'
import type { Compra, Proveedor } from './compras-client'

// ─── Tipos y constantes locales del form ──────────────────────────────────────

type FormaPago = 'DESPUES' | 'CONTADO' | 'A_PLAZO' | 'EN_CUOTAS' | 'MIXTO'
type Instrumento = 'EFECTIVO' | 'TRANSFERENCIA' | 'CUENTA_CORRIENTE' | 'CHEQUE_FISICO' | 'ECHEQ'

interface CuotaRow {
  monto: number
  fecha_vencimiento: string
  numero_cheque?: string
  banco_emisor?: string
  /** FK a cuentas_bancarias.id — cuenta emisora del cheque (chequera) */
  cuenta_id?: string
  /** Solo se usa en MIXTO — cada fila tiene su propio instrumento */
  instrumento?: Instrumento
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

export function CompraForm({ compra, proveedores, cuentas, onClose, initialNegocio }: { compra?: Compra; proveedores: Proveedor[]; cuentas: { id: string; nombre: string; banco: string }[]; onClose: () => void; initialNegocio?: string }) {
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
  const [cuentaEmisoraId, setCuentaEmisoraId] = useState('')
  const [cuitBeneficiario, setCuitBeneficiario] = useState('')
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
    else if (v === 'A_PLAZO' || v === 'EN_CUOTAS') setInstrumento('CUENTA_CORRIENTE')
    setFechaVencimientoPago('')
    if (v === 'MIXTO' && montoTotal > 0) {
      setCuotas([
        { monto: 0, fecha_vencimiento: hoy, instrumento: 'EFECTIVO' },
      ])
    }
  }

  function addPagoMixto() {
    setCuotas((prev) => [...prev, { monto: 0, fecha_vencimiento: hoy, instrumento: 'TRANSFERENCIA' }])
  }
  function removePagoMixto(i: number) {
    setCuotas((prev) => prev.filter((_, idx) => idx !== i))
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
      const condicion =
        formaPago === 'CONTADO' ? 'CONTADO' :
        formaPago === 'A_PLAZO' ? 'A_PLAZO' :
        formaPago === 'EN_CUOTAS' ? 'EN_CUOTAS' :
        'MIXTO'
      fd.set('condicion_pago', condicion)
      fd.set('instrumento', formaPago === 'MIXTO' ? 'EFECTIVO' : instrumento)
      fd.set('fecha_emision_pago', fechaEmisionPago)
      if (fechaVencimientoPago) fd.set('fecha_vencimiento_pago', fechaVencimientoPago)
      if (numeroCheque) fd.set('numero_cheque', numeroCheque)
      if (cuentaEmisoraId) fd.set('cuenta_id', cuentaEmisoraId)
      if (cuitBeneficiario) fd.set('cuit_beneficiario', cuitBeneficiario)
      if (formaPago === 'EN_CUOTAS' || formaPago === 'MIXTO') {
        // Para EN_CUOTAS, fusionar la cuenta_emisora global a cada cuota (si es cheque)
        const cuotasFinal = formaPago === 'EN_CUOTAS' && esCheque
          ? cuotas.map((c) => ({ ...c, cuenta_id: cuentaEmisoraId || c.cuenta_id }))
          : cuotas
        fd.set('cuotas', JSON.stringify(cuotasFinal))
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

  // Negocio controlado para filtrar proveedores según marca
  const [negocioActual, setNegocioActual] = useState<string>(compra?.negocio ?? initialNegocio ?? 'GENERAL')
  const [proveedorActualId, setProveedorActualId] = useState<string>(compra?.proveedor_id ?? '')

  // Proveedor aparece si: no tiene marcas asignadas (genérico) o incluye la marca elegida
  const proveedoresFiltrados = proveedores.filter((p) => {
    const ps = p as Proveedor & { marcas?: string[] | null }
    if (!ps.marcas || ps.marcas.length === 0) return true
    return ps.marcas.includes(negocioActual)
  })

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Select
          label="Marca / Negocio"
          name="negocio"
          value={negocioActual}
          onChange={(e) => {
            setNegocioActual(e.target.value)
            // Si el proveedor actual ya no aplica a la nueva marca, limpiarlo
            const provs = proveedores.filter((p) => {
              const ps = p as Proveedor & { marcas?: string[] | null }
              if (!ps.marcas || ps.marcas.length === 0) return true
              return ps.marcas.includes(e.target.value)
            })
            if (proveedorActualId && !provs.find((p) => p.id === proveedorActualId)) {
              setProveedorActualId('')
            }
          }}
          options={MARCAS.map((m) => ({ value: m, label: m }))}
        />
        <Select
          label="Proveedor"
          name="proveedor_id"
          value={proveedorActualId}
          onChange={(e) => setProveedorActualId(e.target.value)}
          options={proveedoresFiltrados.map((p) => ({ value: p.id, label: p.nombre }))}
          placeholder={proveedoresFiltrados.length === 0 ? 'Sin proveedores para esta marca' : 'Seleccionar...'}
          required
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

      {/* Monto y facturación */}
      <div className="bg-surface-2 rounded-xl p-4 space-y-4">
        <MoneyInput
          label="Monto total (lo que pagaste)"
          value={montoTotal}
          onChange={setMontoTotal}
          required
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-fg-muted">¿El proveedor te factura?</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { if (!desglosarIVA) handleToggleIVA() }}
              className={cn(
                'px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                desglosarIVA
                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-600'
                  : 'bg-surface-2 border-[#c8c0b0] text-fg-muted hover:bg-surface'
              )}
            >
              Sí, factura
            </button>
            <button
              type="button"
              onClick={() => { if (desglosarIVA) handleToggleIVA() }}
              className={cn(
                'px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                !desglosarIVA
                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-600'
                  : 'bg-surface-2 border-[#c8c0b0] text-fg-muted hover:bg-surface'
              )}
            >
              No, sin factura
            </button>
          </div>
        </div>

        {desglosarIVA && (
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-fg-muted">% que factura</label>
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
              <p className="text-xs text-fg-soft">
                Default 100% (todo facturado). Bajalo si te facturan parcial — ej: pagás $100K y te facturan solo $60K → 60%.
              </p>
            </div>

            <div className="bg-surface rounded-lg p-3 space-y-1.5 border border-border">
              <div className="flex items-center justify-between text-xs">
                <span className="text-fg-muted">Parte facturada (con IVA):</span>
                <span className="font-mono text-fg">{formatCurrency(montoTotal * porcentajeFact / 100)}</span>
              </div>
              {porcentajeFact < 100 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-fg-muted">Parte sin factura:</span>
                  <span className="font-mono text-fg">{formatCurrency(montoTotal * (100 - porcentajeFact) / 100)}</span>
                </div>
              )}
              <div className="border-t border-border pt-1.5 mt-1 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-green-700 font-medium">Va al mayor de compras:</span>
                  <span className="font-mono text-green-700 font-semibold">{formatCurrency(montoNeto + (montoTotal * (100 - porcentajeFact) / 100))}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-amber-700">IVA (crédito fiscal):</span>
                  <span className="font-mono text-amber-700">{formatCurrency(iva)}</span>
                </div>
              </div>
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-fg-soft hover:text-fg">Editar manualmente neto/IVA</summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-fg-muted">
                    Neto sin IVA <span className="text-fg-soft font-normal">(parte facturada)</span>
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
                    IVA (21%) <span className="text-fg-soft font-normal">(parte facturada)</span>
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
            </details>
          </div>
        )}

        {!desglosarIVA && montoTotal > 0 && (
          <div className="bg-surface rounded-lg p-3 border border-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-green-700 font-medium">Va al mayor de compras (sin IVA):</span>
              <span className="font-mono text-green-700 font-semibold">{formatCurrency(montoTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Forma de pago — solo en creación */}
      {!editing && (
      <div className="space-y-3">
        <label className="block text-sm font-medium text-fg-muted">Forma de pago</label>
        <div className="grid grid-cols-5 gap-2">
          {([
            { v: 'DESPUES', label: 'Después' },
            { v: 'CONTADO', label: 'Contado' },
            { v: 'A_PLAZO', label: 'A Plazo' },
            { v: 'EN_CUOTAS', label: 'En Cuotas' },
            { v: 'MIXTO', label: 'Mixto' },
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
            {/* Instrumento — oculto en MIXTO (cada fila tiene el suyo) */}
            {formaPago !== 'MIXTO' && (
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
            )}

            {/* Fechas — etiqueta cambia según el caso */}
            {formaPago !== 'CONTADO' && formaPago !== 'MIXTO' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Fecha de emisión solo cuando es cheque (es la fecha que dice el cheque) */}
              {esCheque && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-fg-muted">Fecha de emisión del cheque</label>
                  <input
                    type="date"
                    value={fechaEmisionPago}
                    onChange={(e) => setFechaEmisionPago(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              )}

              {/* Para A Plazo no-cheque: solo fecha de pago */}
              {formaPago === 'A_PLAZO' && !esCheque && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-fg-muted">
                    {instrumento === 'CUENTA_CORRIENTE' ? 'Fecha de vencimiento' : 'Fecha de pago'}
                    <span className="text-red-700 ml-1">*</span>
                  </label>
                  <input
                    type="date"
                    value={fechaVencimientoPago}
                    onChange={(e) => setFechaVencimientoPago(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-surface-2 border border-amber-500/40 rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              )}

              {/* Para cheques A Plazo: fecha de vencimiento global (cobro).
                  En EN_CUOTAS cada cuota tiene su propia fecha en la tabla → no se muestra acá */}
              {esCheque && formaPago === 'A_PLAZO' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-fg-muted">
                    Fecha de cobro / vencimiento
                    <span className="text-red-700 ml-1">*</span>
                  </label>
                  <input
                    type="date"
                    value={fechaVencimientoPago}
                    onChange={(e) => setFechaVencimientoPago(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-surface-2 border border-amber-500/40 rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              )}
            </div>
            )}

            {formaPago === 'CONTADO' && (
              <p className="text-xs text-fg-soft">
                Fecha de pago: hoy ({formatDate(fechaEmisionPago)})
              </p>
            )}

            {/* Datos cheque */}
            {esCheque && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-fg-muted">
                    Cuenta emisora (chequera) <span className="text-red-700 ml-1">*</span>
                  </label>
                  <select
                    value={cuentaEmisoraId}
                    onChange={(e) => setCuentaEmisoraId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  >
                    <option value="">Seleccioná cuenta...</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>{c.banco} — {c.nombre}</option>
                    ))}
                  </select>
                </div>
                {formaPago !== 'EN_CUOTAS' && (
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
                )}
                {instrumento === 'CHEQUE_FISICO' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-fg-muted">
                      CUIT del beneficiario
                      <span className="text-fg-soft font-normal ml-1">(opcional — útil para físicos)</span>
                    </label>
                    <input
                      type="text"
                      value={cuitBeneficiario}
                      onChange={(e) => setCuitBeneficiario(e.target.value)}
                      placeholder="20-12345678-9"
                      className="w-full px-3 py-2 bg-surface-2 border border-[#c8c0b0] rounded-lg text-fg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                    <p className="text-xs text-fg-soft">
                      A quién endosaste el cheque. Si va al mismo proveedor, podés dejarlo vacío.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Plan de pagos MIXTO */}
            {formaPago === 'MIXTO' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-fg-muted">Plan de pagos</label>
                  <button
                    type="button"
                    onClick={addPagoMixto}
                    className="text-xs px-2 py-1 rounded bg-orange-500/15 border border-orange-500/30 text-orange-600 hover:bg-orange-500/25"
                  >
                    + Agregar pago
                  </button>
                </div>
                <div className="space-y-2">
                  {cuotas.map((c, i) => {
                    const inst = c.instrumento ?? 'EFECTIVO'
                    const esChequeFila = inst === 'CHEQUE_FISICO' || inst === 'ECHEQ'
                    const requiereFecha = inst !== 'EFECTIVO' && inst !== 'TRANSFERENCIA'
                    return (
                      <div key={i} className="bg-surface-2 border border-border-strong/50 rounded-lg p-2.5 space-y-2">
                        <div className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-3 space-y-1">
                            <label className="block text-xs text-fg-soft">Monto</label>
                            <input
                              type="number"
                              step="0.01"
                              value={c.monto || ''}
                              onChange={(e) => updateCuota(i, 'monto', Number(e.target.value))}
                              className="w-full px-2 py-1.5 bg-surface-2 border border-[#c8c0b0] rounded text-fg font-mono focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                            />
                          </div>
                          <div className="col-span-4 space-y-1">
                            <label className="block text-xs text-fg-soft">Instrumento</label>
                            <select
                              value={inst}
                              onChange={(e) => updateCuota(i, 'instrumento', e.target.value)}
                              className="w-full px-2 py-1.5 bg-surface-2 border border-[#c8c0b0] rounded text-fg focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                            >
                              <option value="EFECTIVO">Efectivo</option>
                              <option value="TRANSFERENCIA">Transferencia</option>
                              <option value="CUENTA_CORRIENTE">Cta. Corriente</option>
                              <option value="CHEQUE_FISICO">Cheque físico</option>
                              <option value="ECHEQ">E-Cheq</option>
                            </select>
                          </div>
                          <div className="col-span-4 space-y-1">
                            <label className="block text-xs text-fg-soft">
                              {esChequeFila ? 'Vence (cobro)' : inst === 'CUENTA_CORRIENTE' ? 'Vence' : 'Fecha'}
                            </label>
                            <input
                              type="date"
                              value={c.fecha_vencimiento}
                              onChange={(e) => updateCuota(i, 'fecha_vencimiento', e.target.value)}
                              required={requiereFecha}
                              className="w-full px-2 py-1.5 bg-surface-2 border border-[#c8c0b0] rounded text-fg focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                            />
                          </div>
                          <div className="col-span-1">
                            <button
                              type="button"
                              onClick={() => removePagoMixto(i)}
                              disabled={cuotas.length === 1}
                              title={cuotas.length === 1 ? 'Tiene que haber al menos un pago' : 'Quitar'}
                              className="w-full px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-red-700 hover:bg-red-500/20 text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        {esChequeFila && (
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={c.numero_cheque ?? ''}
                              onChange={(e) => updateCuota(i, 'numero_cheque', e.target.value)}
                              placeholder="Nº cheque"
                              className="px-2 py-1.5 bg-surface-2 border border-[#c8c0b0] rounded text-fg focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                            />
                            <select
                              value={c.cuenta_id ?? ''}
                              onChange={(e) => updateCuota(i, 'cuenta_id', e.target.value)}
                              className="px-2 py-1.5 bg-surface-2 border border-[#c8c0b0] rounded text-fg focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                            >
                              <option value="">Cuenta emisora...</option>
                              {cuentas.map((cu) => (
                                <option key={cu.id} value={cu.id}>{cu.banco} — {cu.nombre}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between items-center px-1 text-xs">
                  <span className="text-fg-soft">Total plan:</span>
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
                        {esCheque && (
                          <th className="text-left px-3 py-1.5 text-fg-soft font-medium">Nº cheque</th>
                        )}
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
                          {esCheque && (
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={c.numero_cheque ?? ''}
                                onChange={(e) => updateCuota(i, 'numero_cheque', e.target.value)}
                                placeholder="Nro."
                                className="w-full px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-fg font-mono focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                              />
                            </td>
                          )}
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
