'use client'

import { useActionState, useState, useTransition, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createRetiro, deleteRetiro, cerrarConvertirRetirosMes } from '@/app/actions/finanzas'
import type { RetiroSocio, CategoriaRetiro, TipoCambioMes } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils'
import { retiroEsUsd, valorRetiroUsd, valorRetiroArs } from '@/lib/retiros'
import { Plus, Trash2, CreditCard, Loader2, DollarSign, TrendingUp, RefreshCcw, Lock, Banknote, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const SOCIOS_PREDEFINIDOS = ['Darío Arévalo', 'Bruno Arévalo']

const COLORES_CATEGORIA: Record<string, string> = {
  amber: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  orange: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  blue: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  red: 'bg-red-500/15 text-red-700 border-red-500/30',
  green: 'bg-green-500/15 text-green-700 border-green-500/30',
  indigo: 'bg-orange-500/15 text-primary border-orange-500/30',
  purple: 'bg-purple-500/15 text-purple-700 border-purple-500/30',
  pink: 'bg-pink-500/15 text-pink-700 border-pink-500/30',
  slate: 'bg-slate-500/15 text-fg-muted border-slate-500/30',
}

interface Props {
  retiros: (RetiroSocio & { categoria?: CategoriaRetiro | null })[]
  socios: string[]
  categorias: CategoriaRetiro[]
  tiposCambio: TipoCambioMes[]
  tarjetas: { id: string; nombre: string; banco: string }[]
}

function CategoriaTag({ categoria }: { categoria?: CategoriaRetiro | null }) {
  if (!categoria) return <span className="text-fg-muted text-xs">—</span>
  const cls = COLORES_CATEGORIA[categoria.color] ?? COLORES_CATEGORIA.slate
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium', cls)}>
      {categoria.emoji && <span>{categoria.emoji}</span>}
      {categoria.nombre}
    </span>
  )
}

export function RetirosClient({ retiros, socios, categorias, tiposCambio, tarjetas }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [filtroSocio, setFiltroSocio] = useState<string>('')
  const [filtroMes, setFiltroMes] = useState<string>('')
  const [defaultSocio, setDefaultSocio] = useState<string>('')
  const [medioPago, setMedioPago] = useState<'TRANSFERENCIA' | 'EFECTIVO' | 'TARJETA'>('TRANSFERENCIA')
  const [cuotasTotal, setCuotasTotal] = useState(1)
  const [cierreModalOpen, setCierreModalOpen] = useState(false)
  const [cierreMesInicial, setCierreMesInicial] = useState<string>('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Quick action: ?nuevo=1&socio=NOMBRE abre modal pre-llenado
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') {
      const s = searchParams.get('socio') ?? ''
      setDefaultSocio(s)
      setModalOpen(true)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('nuevo')
      params.delete('socio')
      router.replace(`?${params.toString()}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const todosLosSocios = [...new Set([...SOCIOS_PREDEFINIDOS, ...socios])]
  const tcByMes = new Map(tiposCambio.map((t) => [t.mes, t.tipo_cambio]))

  // Filtros
  const retirosFiltrados = useMemo(() => {
    return retiros.filter((r) => {
      if (filtroSocio && r.socio !== filtroSocio) return false
      if (filtroMes && r.mes !== filtroMes) return false
      return true
    })
  }, [retiros, filtroSocio, filtroMes])

  // Resumen por socio (USD master). Valuación EXCLUYENTE (lib/retiros): un retiro cuenta en
  // USD (si está dolarizado/nativo) O en ARS (si sigue sin convertir), nunca en las dos.
  // Así los totales coinciden con Estado de cuenta y Cuentas particulares.
  const resumenSocios = useMemo(() => {
    return todosLosSocios.map((socio) => {
      const rs = retiros.filter((r) => r.socio === socio)
      const usd = rs.reduce((s, r) => s + valorRetiroUsd(r), 0)
      const arsPendiente = rs.reduce((s, r) => s + valorRetiroArs(r), 0)
      const sinConvertir = rs.filter((r) => !retiroEsUsd(r)).length
      return { socio, usd, arsPendiente, sinConvertir, count: rs.length }
    })
  }, [retiros, todosLosSocios])

  // Retiros sin dolarizar, para el aviso y el default del modal de conversión.
  const mesesSinConvertir = useMemo(() => {
    const meses = retiros.filter((r) => !retiroEsUsd(r)).map((r) => r.mes).filter(Boolean) as string[]
    return [...new Set(meses)].sort().reverse()
  }, [retiros])
  const mesConvDefault = mesesSinConvertir[0] ?? new Date().toISOString().substring(0, 7)
  const totalSinConvertir = retiros.filter((r) => !retiroEsUsd(r)).length

  // Resumen por categoría (del filtrado)
  const resumenCategorias = useMemo(() => {
    const map = new Map<string, { categoria: CategoriaRetiro; usd: number; count: number }>()
    for (const r of retirosFiltrados) {
      if (!r.categoria) continue
      const k = r.categoria.id
      if (!map.has(k)) map.set(k, { categoria: r.categoria, usd: 0, count: 0 })
      const v = map.get(k)!
      v.usd += r.monto_usd_calculado ?? r.monto_usd ?? 0
      v.count += 1
    }
    return Array.from(map.values()).sort((a, b) => b.usd - a.usd)
  }, [retirosFiltrados])

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar este retiro?')) return
    startTransition(() => deleteRetiro(id))
  }

  const [error, action, isFormPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const result = await createRetiro(prev, fd)
      if (!result) setModalOpen(false)
      return result
    },
    null
  )

  // Mes actual para sugerir TC
  const hoy = new Date().toISOString().substring(0, 7)
  const tcSugerido = tcByMes.get(hoy) ?? Array.from(tcByMes.values())[0] ?? 1

  // Lista de meses con datos para filtrar
  const mesesDisponibles = [...new Set(retiros.map((r) => r.mes).filter(Boolean))] as string[]
  mesesDisponibles.sort().reverse()

  function abrirConSocio(socio: string) {
    setDefaultSocio(socio)
    setMedioPago('TRANSFERENCIA')
    setCuotasTotal(1)
    setModalOpen(true)
  }

  function abrirConversion(mes: string) {
    setCierreMesInicial(mes)
    setCierreModalOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg">Retiros de Socios</h1>
          <p className="text-sm text-fg-muted mt-0.5">
            {retiros.length} registros · USD como moneda maestra
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            onClick={() => abrirConversion(mesConvDefault)}
            title="Convertir todos los retiros del mes a USD usando un único TC de cierre"
          >
            <RefreshCcw className="w-4 h-4" />
            Cerrar y convertir
          </Button>
          {SOCIOS_PREDEFINIDOS.map((socio) => (
            <Button
              key={socio}
              onClick={() => abrirConSocio(socio)}
              title={`Registrar retiro de ${socio}`}
              className="bg-purple-600 border-purple-500 hover:bg-purple-500"
            >
              <Plus className="w-4 h-4" />
              Retiro {socio.split(' ')[0]}
            </Button>
          ))}
          <Button
            variant="secondary"
            onClick={() => abrirConSocio('')}
            title="Registrar retiro de otro socio (cargar nombre manualmente)"
          >
            <Plus className="w-4 h-4" />
            Otro
          </Button>
        </div>
      </div>

      {/* Aviso: retiros sin dolarizar */}
      {totalSinConvertir > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2.5 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              Hay <strong>{totalSinConvertir}</strong> retiro{totalSinConvertir !== 1 ? 's' : ''} sin dolarizar
              {mesesSinConvertir.length > 0 && (
                <> · el más reciente en <strong>{formatMonth(mesesSinConvertir[0])}</strong></>
              )}
              . Hasta convertirlos no suman al cierre en USD ni a las cuentas particulares.
            </span>
          </div>
          <Button
            variant="secondary"
            onClick={() => abrirConversion(mesConvDefault)}
            title={`Abrir el conversor ya posicionado en ${formatMonth(mesConvDefault)}`}
          >
            <RefreshCcw className="w-4 h-4" />
            Convertir {formatMonth(mesConvDefault)}
          </Button>
        </div>
      )}

      {/* Resumen por socio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {resumenSocios.map(({ socio, usd, arsPendiente, sinConvertir, count }) => (
          <div key={socio} className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-fg-muted">{socio}</p>
              <span className="text-xs text-fg-soft">{count} retiro{count !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-fg-muted flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Total USD (dolarizado)
                </span>
                <span className="text-xl font-mono font-bold text-green-700">
                  {formatCurrency(usd, 'USD')}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-fg-muted">
                  ARS sin convertir
                  {sinConvertir > 0 && <span className="text-amber-600"> · {sinConvertir}</span>}
                </span>
                <span className={cn('text-sm font-mono', arsPendiente ? 'text-amber-700' : 'text-fg-soft')}>
                  {formatCurrency(arsPendiente)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filtroSocio}
          onChange={(e) => setFiltroSocio(e.target.value)}
          className="bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Todos los socios</option>
          {todosLosSocios.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filtroMes}
          onChange={(e) => setFiltroMes(e.target.value)}
          className="bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Todos los meses</option>
          {mesesDisponibles.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
        </select>
        {(filtroSocio || filtroMes) && (
          <button
            type="button"
            onClick={() => { setFiltroSocio(''); setFiltroMes('') }}
            className="text-xs text-fg-muted hover:text-fg-muted"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Resumen por categoría (del filtrado) */}
      {resumenCategorias.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-fg">Análisis por categoría (USD)</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
            {resumenCategorias.map(({ categoria, usd, count }) => (
              <div key={categoria.id} className={cn(
                'rounded-lg border p-3',
                COLORES_CATEGORIA[categoria.color] ?? COLORES_CATEGORIA.slate
              )}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs flex items-center gap-1">
                    {categoria.emoji} {categoria.nombre}
                  </span>
                  <span className="text-xs opacity-60">{count}</span>
                </div>
                <p className="text-base font-mono font-bold">{formatCurrency(usd, 'USD')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Socio</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Categoría</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Fecha</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">ARS</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">USD</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">TC</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {retirosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-fg-soft">
                  <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No hay retiros con esos filtros
                </td>
              </tr>
            ) : (
              retirosFiltrados.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-surface-2/30">
                  <td className="px-4 py-3 text-fg font-medium">{r.socio}</td>
                  <td className="px-4 py-3"><CategoriaTag categoria={r.categoria} /></td>
                  <td className="px-4 py-3 text-fg-muted text-xs">{formatDate(r.fecha)}</td>
                  <td className="px-4 py-3 text-right font-mono text-fg-muted">{formatCurrency(r.monto_pesos)}</td>
                  {retiroEsUsd(r) ? (
                    <>
                      <td className="px-4 py-3 text-right font-mono text-green-700 font-medium">
                        {formatCurrency(valorRetiroUsd(r), 'USD')}
                      </td>
                      <td className="px-4 py-3 text-right text-fg-muted text-xs">{r.tipo_cambio.toFixed(0)}</td>
                    </>
                  ) : (
                    <td className="px-4 py-3 text-right" colSpan={2}>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 text-xs font-medium">
                        <AlertTriangle className="w-3 h-3" />
                        sin convertir
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Button size="sm" variant="danger" onClick={() => handleDelete(r.id)} disabled={isPending}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) setDefaultSocio('') }} title="Registrar retiro" className="max-w-md">
        <form action={action} className="space-y-4">
          <Input
            label="Socio"
            name="socio"
            list="socios-list"
            placeholder="Nombre del socio"
            defaultValue={defaultSocio}
            required
          />
          <datalist id="socios-list">
            {todosLosSocios.map((s) => <option key={s} value={s} />)}
          </datalist>

          <Select
            label="Categoría"
            name="categoria_id"
            defaultValue=""
            options={[
              { value: '', label: '— Sin categoría —' },
              ...categorias.map((c) => ({ value: c.id, label: `${c.emoji ?? ''} ${c.nombre}` })),
            ]}
          />

          <Input
            label="Fecha"
            name="fecha"
            type="date"
            defaultValue={new Date().toISOString().split('T')[0]}
            required
          />

          {/* Medio de pago */}
          <div className="bg-surface-2/40 border border-border-strong/40 rounded-xl p-3 space-y-3">
            <Select
              label="Medio de pago"
              name="medio_pago"
              value={medioPago}
              onChange={(e) => setMedioPago(e.target.value as typeof medioPago)}
              options={[
                { value: 'TRANSFERENCIA', label: 'Transferencia' },
                { value: 'EFECTIVO', label: 'Efectivo' },
                { value: 'TARJETA', label: 'Tarjeta de crédito' },
              ]}
            />

            {medioPago === 'TARJETA' && (
              <>
                <Select
                  label="Tarjeta *"
                  name="tarjeta_id"
                  defaultValue=""
                  options={[{ value: '', label: '— Seleccionar —' }, ...tarjetas.map((t) => ({ value: t.id, label: `${t.banco} · ${t.nombre}` }))]}
                  required
                />
                <div>
                  <label className="block text-xs font-medium text-fg-muted mb-1.5 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    Cantidad de cuotas
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {[1, 3, 6, 12, 18].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCuotasTotal(n)}
                        className={cn(
                          'px-3 py-1 rounded-lg border text-sm font-mono font-medium transition-colors',
                          cuotasTotal === n
                            ? 'bg-orange-500/20 border-orange-500/50 text-orange-600'
                            : 'bg-surface-2 border-[#c8c0b0] text-fg-muted hover:text-fg-muted'
                        )}
                      >
                        {n}
                      </button>
                    ))}
                    <input
                      type="number"
                      min="1"
                      value={cuotasTotal}
                      onChange={(e) => setCuotasTotal(Math.max(1, Number(e.target.value)))}
                      className="w-20 px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-fg font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <input type="hidden" name="cuotas_total" value={cuotasTotal} />
                  <p className="text-xs text-fg-soft mt-1">
                    Las cuotas se generan como pasivo financiero en /finanzas/tarjetas.
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Input label="Monto ARS" name="monto_pesos" type="number" step="0.01" defaultValue="0" />
            <Input label="Monto USD" name="monto_usd" type="number" step="0.01" defaultValue="0" />
          </div>
          <input type="hidden" name="tipo_cambio" value="0" />
          <p className="text-xs text-fg-soft bg-surface-2/40 border border-border-strong/40 rounded-lg px-3 py-2">
            La conversión a USD se aplica a fin de mes con <strong>Cerrar y convertir</strong> usando un único TC.
          </p>

          <Input label="Notas" name="notas" />

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isFormPending} title="Guardar el retiro y, si es con tarjeta, generar las cuotas en pasivos">
              {isFormPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Registrar
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal cierre/conversión */}
      <CierreConversionModal
        open={cierreModalOpen}
        onOpenChange={setCierreModalOpen}
        retiros={retiros}
        tcSugerido={tcSugerido}
        mesInicial={cierreMesInicial || mesConvDefault}
      />
    </div>
  )
}

// ─── CierreConversionModal ───────────────────────────────────────────────────

function CierreConversionModal({
  open,
  onOpenChange,
  retiros,
  tcSugerido,
  mesInicial,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  retiros: RetiroSocio[]
  tcSugerido: number
  mesInicial: string
}) {
  const [mes, setMes] = useState<string>(mesInicial)
  const [tc, setTc] = useState(tcSugerido)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  // Al abrir, posicionarse en el mes que pidió quien lo abrió (banner/botón → último mes sin convertir).
  useEffect(() => {
    if (open) {
      setMes(mesInicial)
      setError(null)
      setDone(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const retirosDelMes = retiros.filter((r) => r.mes === mes)
  const sinConvertirDelMes = retirosDelMes.filter((r) => !retiroEsUsd(r)).length
  const totalArs = retirosDelMes.reduce((s, r) => s + (r.monto_pesos || 0), 0)
  const totalUsdActual = retirosDelMes.reduce((s, r) => s + (r.monto_usd_calculado ?? 0), 0)
  const totalUsdNuevo = tc > 0 ? totalArs / tc + retirosDelMes.reduce((s, r) => s + (r.monto_usd > 0 ? r.monto_usd : 0), 0) : 0

  const mesesDisponibles = [...new Set(retiros.map((r) => r.mes).filter(Boolean))] as string[]
  mesesDisponibles.sort().reverse()

  function ejecutar() {
    setError(null)
    setDone(null)
    if (!tc || tc <= 0) {
      setError('Ingresá un tipo de cambio válido')
      return
    }
    if (retirosDelMes.length === 0) {
      setError('No hay retiros en este mes')
      return
    }
    if (!confirm(`¿Convertir ${retirosDelMes.length} retiro(s) de ${mes} usando TC = ${tc}?\nEsto recalcula el USD de cada uno.`)) return
    startTransition(async () => {
      try {
        const r = await cerrarConvertirRetirosMes(mes, tc)
        setDone(r.ok)
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Cerrar y convertir retiros del mes" className="max-w-md">
      <div className="space-y-4">
        <div className="bg-surface-2/40 border border-border-strong/40 rounded-lg p-3 text-xs text-fg-muted space-y-1">
          <p>Convierte todos los retiros ARS del mes a USD usando un único tipo de cambio.</p>
          <p className="text-fg-muted">Los retiros que ya estaban cargados directamente en USD se respetan.</p>
        </div>

        <Select
          label="Mes a convertir"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          options={mesesDisponibles.length > 0
            ? mesesDisponibles.map((m) => ({ value: m, label: formatMonth(m) }))
            : [{ value: mes, label: formatMonth(mes) }]}
        />

        <Input
          label="Tipo de cambio de cierre"
          type="number"
          step="0.01"
          value={tc || ''}
          onChange={(e) => setTc(Number(e.target.value))}
        />

        <div className="bg-surface/60 border border-border-strong/40 rounded-lg p-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-fg-muted">Retiros del mes</p>
            <p className="text-base font-semibold text-fg">
              {retirosDelMes.length}
              {sinConvertirDelMes > 0 && (
                <span className="text-xs font-normal text-amber-600"> · {sinConvertirDelMes} sin convertir</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-fg-muted">Total ARS</p>
            <p className="text-base font-mono text-primary">{formatCurrency(totalArs)}</p>
          </div>
          <div>
            <p className="text-fg-muted">USD actual</p>
            <p className="text-base font-mono text-fg-muted">{formatCurrency(totalUsdActual, 'USD')}</p>
          </div>
          <div>
            <p className="text-fg-muted">USD c/TC nuevo</p>
            <p className="text-base font-mono text-green-700">{formatCurrency(totalUsdNuevo, 'USD')}</p>
          </div>
        </div>

        {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        {done !== null && (
          <p className="text-sm text-green-700 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
            ✓ {done} retiro(s) convertidos. El TC quedó registrado en cada fila.
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button
            type="button"
            variant="success"
            onClick={ejecutar}
            disabled={isPending}
            title="Aplicar el TC a todos los retiros del mes y recalcular sus USD"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Convertir y cerrar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
