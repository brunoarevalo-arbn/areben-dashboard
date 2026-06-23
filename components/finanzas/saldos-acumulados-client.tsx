'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { pagarSaldoRecurrente, marcarGastoPagado } from '@/app/actions/finanzas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/input'
import { formatCurrency, formatMonth, formatDate, labelCuenta, ordenarCuentas } from '@/lib/utils'
import { Wallet, CheckCircle2, Loader2, Receipt, ChevronDown, ChevronRight, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RegistrarPagoModal, type PagoTarget } from './registrar-pago-modal'

interface GastoPend {
  id: string
  concepto: string
  categoria: string
  monto: number
  monto_neto: number
  moneda: string
  fecha_pago: string | null
  mes: string
  estado: string
  recurrente_id: string | null
  medio_pago: string | null
  total_pagado: number
  saldo_pendiente: number
}

interface Recurrente {
  id: string
  concepto: string
  categoria: string
  monto_estimado: number
  medio_pago: string
  dia_vencimiento: number | null
  tipo_mes: string
}

interface Cuenta {
  id: string
  nombre: string
  banco: string
  titular?: { nombre: string } | null
}

interface Props {
  gastos: GastoPend[]
  recurrentes: Recurrente[]
  cuentas: Cuenta[]
}

interface GrupoRecurrente {
  recurrente: Recurrente
  gastos: GastoPend[]
  totalSaldo: number
  cantidadMeses: number
}

export function SaldosAcumuladosClient({ gastos, recurrentes, cuentas }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pagarTodoTarget, setPagarTodoTarget] = useState<GrupoRecurrente | null>(null)
  const [pagoIndividualTarget, setPagoIndividualTarget] = useState<PagoTarget | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Agrupar gastos por recurrente_id
  const grupos = useMemo<GrupoRecurrente[]>(() => {
    const m = new Map<string, GrupoRecurrente>()
    const recurrentesMap = new Map(recurrentes.map((r) => [r.id, r]))
    for (const g of gastos) {
      if (!g.recurrente_id) continue
      const rec = recurrentesMap.get(g.recurrente_id)
      if (!rec) continue
      if (!m.has(rec.id)) {
        m.set(rec.id, {
          recurrente: rec,
          gastos: [],
          totalSaldo: 0,
          cantidadMeses: 0,
        })
      }
      const grupo = m.get(rec.id)!
      grupo.gastos.push(g)
      grupo.totalSaldo += g.saldo_pendiente
      grupo.cantidadMeses += 1
    }
    return Array.from(m.values()).sort((a, b) => b.totalSaldo - a.totalSaldo)
  }, [gastos, recurrentes])

  const totalDeuda = grupos.reduce((s, g) => s + g.totalSaldo, 0)
  const totalConceptos = grupos.length
  const totalGastosPendientes = gastos.length

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function abrirPagoParcial(g: GastoPend, conceptoRecurrente: string) {
    setPagoIndividualTarget({
      tipo_origen: 'GASTO',
      origen_id: g.id,
      monto_total: g.monto,
      saldo_pendiente: g.saldo_pendiente,
      moneda: (g.moneda === 'USD' ? 'USD' : 'ARS'),
      descripcion: `${conceptoRecurrente} — ${formatMonth(g.mes)}`,
      contexto: g.categoria,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
          <Layers className="w-6 h-6 text-primary" />
          Saldos acumulados
        </h1>
        <p className="text-sm text-fg-muted mt-0.5">
          Deuda total con cada proveedor recurrente (contador, abogado, impuestos, etc.). Pagá uno, todos, o parcial.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-surface border border-amber-500/30 rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Deuda total acumulada</p>
          <p className="text-2xl font-bold text-amber-700 font-mono">{formatCurrency(totalDeuda)}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Conceptos con deuda</p>
          <p className="text-2xl font-bold text-fg">{totalConceptos}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-muted mb-1">Gastos pendientes</p>
          <p className="text-2xl font-bold text-fg">{totalGastosPendientes}</p>
        </div>
      </div>

      {/* Lista de grupos */}
      {grupos.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-700" />
          <p className="text-fg font-medium">¡Sin deudas acumuladas!</p>
          <p className="text-fg-soft text-sm mt-1">
            No hay gastos recurrentes pendientes. Cuando confirmes un recurrente y no lo pagues, aparecerá acá.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map((grupo) => {
            const isExpanded = expanded.has(grupo.recurrente.id)
            return (
              <div key={grupo.recurrente.id} className="bg-surface border border-border rounded-xl overflow-hidden">
                {/* Header del grupo */}
                <div className="px-5 py-4 flex items-center justify-between hover:bg-surface-2/30 cursor-pointer"
                  onClick={() => toggleExpand(grupo.recurrente.id)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      className="p-1 -ml-1 rounded hover:bg-surface-2"
                      onClick={(e) => { e.stopPropagation(); toggleExpand(grupo.recurrente.id) }}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <Receipt className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-fg truncate">{grupo.recurrente.concepto}</p>
                      <p className="text-xs text-fg-soft">
                        {grupo.recurrente.categoria} · {grupo.cantidadMeses} mes{grupo.cantidadMeses > 1 ? 'es' : ''} adeudado{grupo.cantidadMeses > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-fg-muted">Total adeudado</p>
                      <p className="font-mono font-bold text-amber-700">{formatCurrency(grupo.totalSaldo)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="success"
                      onClick={(e) => { e.stopPropagation(); setPagarTodoTarget(grupo) }}
                      disabled={isPending}
                      title="Pagar todos los meses pendientes con un solo movimiento"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      Pagar todo
                    </Button>
                  </div>
                </div>

                {/* Lista de meses adeudados */}
                {isExpanded && (
                  <div className="border-t border-border divide-y divide-border/60">
                    {grupo.gastos.map((g) => (
                      <div key={g.id} className="px-5 py-3 flex items-center justify-between hover:bg-surface-2/20">
                        <div className="min-w-0">
                          <p className="text-sm text-fg font-medium">{formatMonth(g.mes)}</p>
                          <p className="text-xs text-fg-soft">
                            {g.fecha_pago && `Vence ${formatDate(g.fecha_pago)} · `}
                            {g.medio_pago || 'Sin medio'} · {g.categoria}
                            {g.total_pagado > 0 && (
                              <span className="text-amber-700 ml-1">
                                · Pagado parcial {formatCurrency(g.total_pagado)} de {formatCurrency(g.monto)}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="font-mono text-sm font-medium text-fg">{formatCurrency(g.saldo_pendiente)}</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => abrirPagoParcial(g, grupo.recurrente.concepto)}
                            title="Pagar este mes (total o parcial)"
                          >
                            Pagar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: pagar todo */}
      <Modal
        open={!!pagarTodoTarget}
        onOpenChange={(o) => { if (!o) setPagarTodoTarget(null) }}
        title={`Pagar todo — ${pagarTodoTarget?.recurrente.concepto ?? ''}`}
        className="max-w-md"
      >
        {pagarTodoTarget && (
          <PagarTodoForm
            grupo={pagarTodoTarget}
            cuentas={cuentas}
            onClose={() => { setPagarTodoTarget(null); router.refresh() }}
          />
        )}
      </Modal>

      {/* Modal: pagar individual (total o parcial, usando el modal estándar) */}
      <RegistrarPagoModal
        open={!!pagoIndividualTarget}
        onOpenChange={(o) => { if (!o) setPagoIndividualTarget(null) }}
        target={pagoIndividualTarget}
        cuentas={cuentas}
        onSuccess={() => { setPagoIndividualTarget(null); router.refresh() }}
      />
    </div>
  )
}

// ─── PagarTodoForm ───────────────────────────────────────────────────────────

function PagarTodoForm({
  grupo,
  cuentas,
  onClose,
}: {
  grupo: GrupoRecurrente
  cuentas: Cuenta[]
  onClose: () => void
}) {
  const [cuentaId, setCuentaId] = useState<string>('')
  const [fechaPago, setFechaPago] = useState<string>(new Date().toISOString().split('T')[0])
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ pagados: number; total: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    if (!cuentaId) { setError('Seleccioná la cuenta de origen'); return }
    startTransition(async () => {
      try {
        const r = await pagarSaldoRecurrente({
          recurrenteId: grupo.recurrente.id,
          cuentaOrigenId: cuentaId,
          fechaPago,
        })
        setResultado(r)
        setTimeout(onClose, 1500)
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  if (resultado) {
    return (
      <div className="text-center py-6 space-y-2">
        <CheckCircle2 className="w-12 h-12 mx-auto text-green-700" />
        <p className="text-fg font-medium">
          {resultado.pagados} pago{resultado.pagados > 1 ? 's' : ''} registrado{resultado.pagados > 1 ? 's' : ''}
        </p>
        <p className="text-fg-soft text-sm">Total: {formatCurrency(resultado.total)}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
        <p className="text-sm text-fg">
          Vas a pagar <strong>{grupo.cantidadMeses} mes{grupo.cantidadMeses > 1 ? 'es' : ''}</strong> de{' '}
          <strong>{grupo.recurrente.concepto}</strong>:
        </p>
        <p className="text-xl font-mono font-bold text-amber-700 mt-1">{formatCurrency(grupo.totalSaldo)}</p>
        <p className="text-xs text-fg-soft mt-1">
          Meses: {grupo.gastos.map((g) => formatMonth(g.mes)).join(', ')}
        </p>
      </div>

      <Select
        label="Cuenta de origen"
        value={cuentaId}
        onChange={(e) => setCuentaId(e.target.value)}
        options={[{ value: '', label: 'Seleccioná...' }, ...ordenarCuentas(cuentas).map((c) => ({ value: c.id, label: labelCuenta(c) }))]}
        required
      />

      <div>
        <label className="text-xs text-fg-muted block mb-1">Fecha de pago</label>
        <input
          type="date"
          value={fechaPago}
          onChange={(e) => setFechaPago(e.target.value)}
          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-orange-500/60"
        />
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="button" variant="success" onClick={submit} disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Pagar {formatCurrency(grupo.totalSaldo)}
        </Button>
      </div>
    </div>
  )
}
