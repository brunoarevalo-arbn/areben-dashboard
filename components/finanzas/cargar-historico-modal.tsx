'use client'

import { useState, useTransition } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { Loader2, FileCheck, CreditCard, Banknote, Receipt, Upload, Edit3 } from 'lucide-react'
import { createPagoUnificado } from '@/app/actions/pagos'
import {
  crearCuotasHistoricas,
  crearCtaCteHistorica,
  crearGastoHistorico,
  importChequesHistoricos,
  importCuotasHistoricas,
  importCtaCteHistoricas,
  importGastosHistoricos,
} from '@/app/actions/historicos'
import { ExcelImport } from '@/components/ui/excel-import'
import { cn } from '@/lib/utils'

export type HistoricoTipo = 'CHEQUE' | 'CUOTA' | 'CTA_CTE' | 'GASTO'

const TIPO_LABELS: Record<HistoricoTipo, { label: string; descripcion: string; icon: React.ComponentType<{ className?: string }> }> = {
  CHEQUE: {
    label: 'Cheque histórico',
    descripcion: 'Cheque ya emitido sin asignar a deuda — asignable después',
    icon: FileCheck,
  },
  CUOTA: {
    label: 'Cuota tarjeta histórica',
    descripcion: 'Cuotas que ya están girando sin compra original cargada',
    icon: CreditCard,
  },
  CTA_CTE: {
    label: 'Cuenta corriente histórica',
    descripcion: 'Saldo a plazo con un proveedor que viene de antes',
    icon: Banknote,
  },
  GASTO: {
    label: 'Gasto pendiente histórico',
    descripcion: 'Un gasto que ya quedaba pendiente desde antes',
    icon: Receipt,
  },
}

interface Props {
  open: boolean
  tipo: HistoricoTipo | null
  onOpenChange: (o: boolean) => void
  cuentas: { id: string; nombre: string; banco: string }[]
  tarjetas?: { id: string; nombre: string; banco: string }[]
  proveedores?: { id: string; nombre: string }[]
  onSuccess?: () => void
}

const CATEGORIAS = ['Alquiler', 'Servicios', 'Sueldos', 'Marketing', 'Logística', 'Impuestos', 'Seguros', 'Mantenimiento', 'Tecnología', 'Otros']

export function CargarHistoricoModal({ open, tipo, onOpenChange, cuentas, tarjetas = [], proveedores = [], onSuccess }: Props) {
  const [modo, setModo] = useState<'MANUAL' | 'EXCEL'>('MANUAL')
  const [excelOpen, setExcelOpen] = useState(false)
  if (!tipo) return null
  const meta = TIPO_LABELS[tipo]
  const Icon = meta.icon

  return (
    <>
      <Modal open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setModo('MANUAL'); setExcelOpen(false) } }} title={meta.label} className="max-w-md">
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-200 flex items-start gap-2">
            <Icon className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Cargando pasivo histórico (mes 0)</p>
              <p className="opacity-80">{meta.descripcion}</p>
            </div>
          </div>

          {/* Toggle Manual/Excel */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setModo('MANUAL')}
              className={cn(
                'flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                modo === 'MANUAL'
                  ? 'bg-orange-500/20 border-orange-500/50 text-orange-600'
                  : 'bg-[#f5f0e6] border-[#d6d0c4] text-slate-600 hover:text-slate-800',
              )}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Cargar 1 a uno
            </button>
            <button
              type="button"
              onClick={() => { setModo('EXCEL'); setExcelOpen(true) }}
              className={cn(
                'flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                modo === 'EXCEL'
                  ? 'bg-green-600/20 border-green-500/50 text-green-300'
                  : 'bg-[#f5f0e6] border-[#d6d0c4] text-slate-600 hover:text-slate-800',
              )}
            >
              <Upload className="w-3.5 h-3.5" />
              Importar Excel
            </button>
          </div>

          {modo === 'MANUAL' && (
            <>
              {tipo === 'CHEQUE' && <FormCheque cuentas={cuentas} onSuccess={onSuccess} onClose={() => onOpenChange(false)} />}
              {tipo === 'CUOTA' && <FormCuota tarjetas={tarjetas} onSuccess={onSuccess} onClose={() => onOpenChange(false)} />}
              {tipo === 'CTA_CTE' && <FormCtaCte proveedores={proveedores} onSuccess={onSuccess} onClose={() => onOpenChange(false)} />}
              {tipo === 'GASTO' && <FormGasto onSuccess={onSuccess} onClose={() => onOpenChange(false)} />}
            </>
          )}

          {modo === 'EXCEL' && (
            <div className="text-center py-6">
              <Upload className="w-10 h-10 mx-auto mb-2 text-slate-500" />
              <p className="text-sm text-slate-600 mb-4">Importá múltiples filas desde una planilla Excel</p>
              <Button onClick={() => setExcelOpen(true)} variant="success">
                <Upload className="w-4 h-4" />
                Abrir importador
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* Importador Excel — un componente por tipo */}
      {tipo === 'CHEQUE' && (
        <ExcelImport
          open={excelOpen}
          onOpenChange={setExcelOpen}
          title="Importar cheques históricos"
          description="Subí una planilla con los cheques en circulación. Cada fila se cargará como pago LIBRE, asignable después."
          templateName="cheques-historicos"
          templateColumns={[
            { key: 'numero', label: 'numero', example: '12345678' },
            { key: 'banco', label: 'banco', example: 'Galicia' },
            { key: 'tipo', label: 'tipo', example: 'CHEQUE_FISICO' },
            { key: 'monto', label: 'monto', required: true, example: 50000 },
            { key: 'moneda', label: 'moneda', example: 'ARS' },
            { key: 'fecha_emision', label: 'fecha_emision', required: true, example: '2026-04-01' },
            { key: 'fecha_vencimiento', label: 'fecha_vencimiento', required: true, example: '2026-05-15' },
            { key: 'notas', label: 'notas', example: 'Pago a Juan Pérez' },
          ]}
          onImport={async (rows) => {
            const r = await importChequesHistoricos(rows)
            if (r.ok > 0) onSuccess?.()
            return r
          }}
        />
      )}
      {tipo === 'CUOTA' && (
        <ExcelImport
          open={excelOpen}
          onOpenChange={setExcelOpen}
          title="Importar cuotas tarjeta históricas"
          description="Cargá cuotas que ya están girando. La columna tarjeta_nombre debe coincidir con el nombre exacto en /finanzas/tarjetas."
          templateName="cuotas-historicas"
          templateColumns={[
            { key: 'tarjeta_nombre', label: 'tarjeta_nombre', required: true, example: 'Visa Galicia' },
            { key: 'concepto', label: 'concepto', required: true, example: 'Notebook' },
            { key: 'monto_cuota', label: 'monto_cuota', required: true, example: 50000 },
            { key: 'cuotas_restantes', label: 'cuotas_restantes', required: true, example: 6 },
            { key: 'cuota_actual', label: 'cuota_actual', example: 3 },
            { key: 'cuotas_total', label: 'cuotas_total', example: 12 },
            { key: 'primer_mes_vencimiento', label: 'primer_mes_vencimiento', required: true, example: '2026-05' },
          ]}
          onImport={async (rows) => {
            const r = await importCuotasHistoricas(rows)
            if (r.ok > 0) onSuccess?.()
            return r
          }}
        />
      )}
      {tipo === 'CTA_CTE' && (
        <ExcelImport
          open={excelOpen}
          onOpenChange={setExcelOpen}
          title="Importar cuentas corrientes históricas"
          description="Saldos de cuenta corriente con proveedores. proveedor_nombre debe coincidir exacto con /compras/proveedores."
          templateName="cta-cte-historicas"
          templateColumns={[
            { key: 'proveedor_nombre', label: 'proveedor_nombre', required: true, example: 'Distribuidor S.A.' },
            { key: 'monto', label: 'monto', required: true, example: 200000 },
            { key: 'moneda', label: 'moneda', example: 'ARS' },
            { key: 'fecha_origen', label: 'fecha_origen', required: true, example: '2026-03-15' },
            { key: 'fecha_vencimiento', label: 'fecha_vencimiento', required: true, example: '2026-05-15' },
            { key: 'notas', label: 'notas', example: 'Factura 1234' },
          ]}
          onImport={async (rows) => {
            const r = await importCtaCteHistoricas(rows)
            if (r.ok > 0) onSuccess?.()
            return r
          }}
        />
      )}
      {tipo === 'GASTO' && (
        <ExcelImport
          open={excelOpen}
          onOpenChange={setExcelOpen}
          title="Importar gastos pendientes históricos"
          description="Gastos que ya quedaban pendientes de meses anteriores."
          templateName="gastos-historicos"
          templateColumns={[
            { key: 'concepto', label: 'concepto', required: true, example: 'Alquiler marzo' },
            { key: 'categoria', label: 'categoria', required: true, example: 'Alquiler' },
            { key: 'monto', label: 'monto', required: true, example: 350000 },
            { key: 'moneda', label: 'moneda', example: 'ARS' },
            { key: 'iva_incluido', label: 'iva_incluido', example: 'SI' },
            { key: 'porcentaje_iva', label: 'porcentaje_iva', example: 21 },
            { key: 'negocio', label: 'negocio', example: 'GENERAL' },
            { key: 'fecha', label: 'fecha', required: true, example: '2026-03-01' },
            { key: 'fecha_pago', label: 'fecha_pago', required: true, example: '2026-05-10' },
            { key: 'notas', label: 'notas', example: 'Pendiente del mes 0' },
          ]}
          onImport={async (rows) => {
            const r = await importGastosHistoricos(rows)
            if (r.ok > 0) onSuccess?.()
            return r
          }}
        />
      )}
    </>
  )
}

// ─── Form: Cheque histórico (LIBRE) ───────────────────────────────────────────

function FormCheque({ cuentas, onSuccess, onClose }: { cuentas: Props['cuentas']; onSuccess?: () => void; onClose: () => void }) {
  const [tipo, setTipo] = useState<'CHEQUE_FISICO' | 'ECHEQ'>('CHEQUE_FISICO')
  const [monto, setMonto] = useState<number>(0)
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS')
  const [fechaEmision, setFechaEmision] = useState(() => new Date().toISOString().split('T')[0])
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [numeroCheque, setNumeroCheque] = useState('')
  const [bancoEmisor, setBancoEmisor] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    if (!monto || monto <= 0) return setError('Ingresá un monto positivo')
    if (!fechaVencimiento) return setError('La fecha de vencimiento es obligatoria')
    startTransition(async () => {
      try {
        await createPagoUnificado({
          tipo_origen: 'LIBRE',
          origen_id: null,
          monto,
          moneda,
          fecha_emision: fechaEmision,
          fecha_vencimiento: fechaVencimiento,
          instrumento: tipo,
          cuenta_id: cuentaId || null,
          numero_cheque: numeroCheque || null,
          banco_emisor: bancoEmisor || null,
          notas: notas ? `${notas} (HISTÓRICO)` : 'Cheque histórico — sin asignar',
        })
        onSuccess?.()
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <>
      <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as 'CHEQUE_FISICO' | 'ECHEQ')} options={[
        { value: 'CHEQUE_FISICO', label: 'Cheque físico' },
        { value: 'ECHEQ', label: 'E-cheq' },
      ]} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Monto</label>
          <input type="number" step="0.01" min="0.01" value={monto || ''} onChange={(e) => setMonto(Number(e.target.value))} placeholder="0,00"
            className="w-full px-3 py-2 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <Select label="Moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as 'ARS' | 'USD')} options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Fecha emisión" type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} required />
        <Input label="Fecha vencimiento" type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="N° de cheque" value={numeroCheque} onChange={(e) => setNumeroCheque(e.target.value)} placeholder="12345678" />
        <Input label="Banco emisor" value={bancoEmisor} onChange={(e) => setBancoEmisor(e.target.value)} placeholder="Galicia, MP" />
      </div>
      <Select label="Cuenta del cheque (opcional)" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}
        options={[{ value: '', label: '— Sin asignar —' }, ...cuentas.map((c) => ({ value: c.id, label: `${c.banco} · ${c.nombre}` }))]} />
      <Textarea label="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="A quién se le firmó, motivo, etc." />
      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={submit} disabled={isPending} title="Guardar el cheque histórico como pago LIBRE">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
          Cargar cheque
        </Button>
      </div>
    </>
  )
}

// ─── Form: Cuota tarjeta histórica ────────────────────────────────────────────

function FormCuota({ tarjetas, onSuccess, onClose }: { tarjetas: NonNullable<Props['tarjetas']>; onSuccess?: () => void; onClose: () => void }) {
  const [tarjetaId, setTarjetaId] = useState('')
  const [concepto, setConcepto] = useState('')
  const [montoCuota, setMontoCuota] = useState<number>(0)
  const [cuotasRestantes, setCuotasRestantes] = useState(1)
  const [cuotaActual, setCuotaActual] = useState(1)
  const [cuotasTotalOriginal, setCuotasTotalOriginal] = useState(1)
  const [primerMesVencimiento, setPrimerMesVencimiento] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const totalRestante = montoCuota * cuotasRestantes

  function submit() {
    setError(null)
    if (!tarjetaId) return setError('Seleccioná la tarjeta')
    if (!concepto.trim()) return setError('Concepto obligatorio')
    if (montoCuota <= 0) return setError('Monto debe ser positivo')
    startTransition(async () => {
      try {
        await crearCuotasHistoricas({
          tarjeta_id: tarjetaId,
          concepto,
          monto_cuota: montoCuota,
          cuotas_restantes: cuotasRestantes,
          cuota_actual: cuotaActual,
          cuotas_total_original: cuotasTotalOriginal,
          primer_mes_vencimiento: primerMesVencimiento,
        })
        onSuccess?.()
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <>
      <Select label="Tarjeta" value={tarjetaId} onChange={(e) => setTarjetaId(e.target.value)} required
        options={[{ value: '', label: '— Seleccionar —' }, ...tarjetas.map((t) => ({ value: t.id, label: `${t.banco} · ${t.nombre}` }))]} />
      <Input label="Concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: Notebook Apple" required />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Monto por cuota</label>
          <input type="number" step="0.01" min="0.01" value={montoCuota || ''} onChange={(e) => setMontoCuota(Number(e.target.value))} placeholder="0,00"
            className="w-full px-3 py-2 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Primer mes a vencer</label>
          <input type="month" value={primerMesVencimiento} onChange={(e) => setPrimerMesVencimiento(e.target.value)}
            className="w-full px-3 py-2 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">N° cuota actual</label>
          <input type="number" min="1" value={cuotaActual} onChange={(e) => setCuotaActual(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Cuotas total original</label>
          <input type="number" min="1" value={cuotasTotalOriginal} onChange={(e) => setCuotasTotalOriginal(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Restantes a cargar</label>
          <input type="number" min="1" max="60" value={cuotasRestantes} onChange={(e) => setCuotasRestantes(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-amber-400 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
      </div>
      <p className="text-xs text-slate-500 bg-[#f5f0e6]/40 border border-[#d6d0c4]/40 rounded-lg px-3 py-2">
        Total a cargar: <span className="font-mono text-amber-400 font-semibold">{formatCurrency(totalRestante)}</span> en {cuotasRestantes} cuota(s)
        desde <span className="text-slate-700">{primerMesVencimiento}</span> en adelante.
        {cuotasTotalOriginal > cuotasRestantes && (
          <span className="block mt-1 text-slate-500">Las {cuotasTotalOriginal - cuotasRestantes} cuota(s) anteriores ({cuotaActual > 1 ? `1-${cuotaActual - 1}` : '—'}) se asumen pagadas.</span>
        )}
      </p>
      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={submit} disabled={isPending} title="Generar las cuotas restantes en el sistema">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          Cargar {cuotasRestantes} cuota(s)
        </Button>
      </div>
    </>
  )
}

// ─── Form: Cuenta corriente histórica ─────────────────────────────────────────

function FormCtaCte({ proveedores, onSuccess, onClose }: { proveedores: NonNullable<Props['proveedores']>; onSuccess?: () => void; onClose: () => void }) {
  const [proveedorId, setProveedorId] = useState('')
  const [monto, setMonto] = useState<number>(0)
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS')
  const [fechaOrigen, setFechaOrigen] = useState(() => new Date().toISOString().split('T')[0])
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    if (!proveedorId) return setError('Seleccioná un proveedor')
    if (monto <= 0) return setError('Monto debe ser positivo')
    if (!fechaVencimiento) return setError('Fecha de vencimiento obligatoria')
    startTransition(async () => {
      try {
        await crearCtaCteHistorica({
          proveedor_id: proveedorId,
          monto,
          moneda,
          fecha_origen: fechaOrigen,
          fecha_vencimiento: fechaVencimiento,
          notas: notas || null,
        })
        onSuccess?.()
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <>
      <Select label="Proveedor" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} required
        options={[{ value: '', label: '— Seleccionar —' }, ...proveedores.map((p) => ({ value: p.id, label: p.nombre }))]} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Monto adeudado</label>
          <input type="number" step="0.01" min="0.01" value={monto || ''} onChange={(e) => setMonto(Number(e.target.value))} placeholder="0,00"
            className="w-full px-3 py-2 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <Select label="Moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as 'ARS' | 'USD')} options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Fecha de origen" type="date" value={fechaOrigen} onChange={(e) => setFechaOrigen(e.target.value)} required />
        <Input label="Vencimiento" type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} required />
      </div>
      <Textarea label="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="N° factura, condiciones, motivo..." />
      <p className="text-xs text-slate-500 bg-[#f5f0e6]/40 border border-[#d6d0c4]/40 rounded-lg px-3 py-2">
        Crea una <strong>compra histórica</strong> + un pago a plazo pendiente. Cuando lo pagues por la pantalla normal, el saldo se cierra solo.
      </p>
      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={submit} disabled={isPending} title="Crear la compra histórica + pago cta cte pendiente">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
          Cargar cta. cte.
        </Button>
      </div>
    </>
  )
}

// ─── Form: Gasto pendiente histórico ──────────────────────────────────────────

function FormGasto({ onSuccess, onClose }: { onSuccess?: () => void; onClose: () => void }) {
  const [concepto, setConcepto] = useState('')
  const [categoria, setCategoria] = useState(CATEGORIAS[0])
  const [monto, setMonto] = useState<number>(0)
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS')
  const [ivaIncluido, setIvaIncluido] = useState(false)
  const [porcentajeIva, setPorcentajeIva] = useState(21)
  const [negocio, setNegocio] = useState<'BDI' | 'ZATTIA' | 'STUNNED' | 'GENERAL'>('GENERAL')
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0])
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().split('T')[0])
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    if (!concepto.trim()) return setError('Concepto obligatorio')
    if (monto <= 0) return setError('Monto debe ser positivo')
    startTransition(async () => {
      try {
        await crearGastoHistorico({
          concepto,
          categoria,
          monto,
          moneda,
          iva_incluido: ivaIncluido,
          porcentaje_iva: porcentajeIva,
          negocio,
          fecha,
          fecha_pago: fechaPago,
          notas: notas || null,
        })
        onSuccess?.()
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <>
      <Input label="Concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: Alquiler marzo" required />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}
          options={CATEGORIAS.map((c) => ({ value: c, label: c }))} />
        <Select label="Negocio" value={negocio} onChange={(e) => setNegocio(e.target.value as typeof negocio)}
          options={['BDI', 'ZATTIA', 'STUNNED', 'GENERAL'].map((m) => ({ value: m, label: m }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Monto</label>
          <input type="number" step="0.01" min="0.01" value={monto || ''} onChange={(e) => setMonto(Number(e.target.value))} placeholder="0,00"
            className="w-full px-3 py-2 bg-[#f5f0e6] border border-[#d6d0c4] rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <Select label="Moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as 'ARS' | 'USD')} options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]} />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" checked={ivaIncluido} onChange={(e) => setIvaIncluido(e.target.checked)} className="w-4 h-4 rounded border-[#c8c0b0] bg-slate-700" />
        Monto incluye IVA
      </label>
      {ivaIncluido && (
        <Input label="% IVA" type="number" min="0" max="100" value={porcentajeIva} onChange={(e) => setPorcentajeIva(Number(e.target.value))} />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Fecha del gasto" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        <Input label="Vencimiento de pago" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} required />
      </div>
      <Textarea label="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Detalle del gasto histórico" />
      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={submit} disabled={isPending} title="Crear gasto pendiente histórico">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
          Cargar gasto
        </Button>
      </div>
    </>
  )
}
