'use client'

import { useActionState, useState, useMemo, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createRetiro, deleteRetiro, registrarPagoSocio, cerrarConvertirRetirosMes } from '@/app/actions/finanzas'
import type { Socio, RetiroSocio, CategoriaRetiro, TipoCambioMes } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useSort, SortTh } from '@/components/ui/sortable'
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils'
import { retiroEsUsd, valorRetiroArs, valorRetiroUsd } from '@/lib/retiros'
import {
  Users, CreditCard, TrendingDown, Calendar, ArrowUpCircle,
  Loader2, Plus, Trash2, RefreshCcw, Lock, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  socios: Socio[]
  retiros: (RetiroSocio & { categoria?: CategoriaRetiro | null })[]
  categorias: CategoriaRetiro[]
  tiposCambio: TipoCambioMes[]
  tarjetas: { id: string; nombre: string; banco: string }[]
  socioInicial: string | null
}

// Es "compromiso futuro" si va a salir de caja en el futuro (cuota de tarjeta sin pagar).
function esCompromisoFuturo(r: RetiroSocio): boolean {
  return r.medio_pago === 'TARJETA'
}

// Mes YYYY-MM del retiro (usa el campo `mes` si está, sino lo deriva de la fecha)
function mesDe(r: RetiroSocio): string {
  if (r.mes) return r.mes
  return r.fecha.substring(0, 7)
}

export function SociosClient({ socios, retiros, categorias, tiposCambio, tarjetas, socioInicial }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // — Cuenta corriente (filtros + pago)
  const [pagoModalSocio, setPagoModalSocio] = useState<Socio | null>(null)
  const [filtroSocio, setFiltroSocio] = useState<string | null>(socioInicial)
  const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null)
  const [filtroMes, setFiltroMes] = useState<string | null>(null)

  // — Operar (alta de retiros + conversión)
  const [altaModalOpen, setAltaModalOpen] = useState(false)
  const [defaultSocio, setDefaultSocio] = useState('')
  const [medioPago, setMedioPago] = useState<'TRANSFERENCIA' | 'EFECTIVO' | 'TARJETA'>('TRANSFERENCIA')
  const [cuotasTotal, setCuotasTotal] = useState(1)
  const [programar, setProgramar] = useState(false)
  const [cierreModalOpen, setCierreModalOpen] = useState(false)
  const [cierreMesInicial, setCierreMesInicial] = useState('')
  const [isPending, startTransition] = useTransition()

  const tcByMes = new Map(tiposCambio.map((t) => [t.mes, t.tipo_cambio]))
  const hoy = new Date().toISOString().substring(0, 7)
  const tcSugerido = tcByMes.get(hoy) ?? Array.from(tcByMes.values())[0] ?? 1

  // Quick action desde el home: ?nuevo=1&socio=NOMBRE abre el alta pre-llenada.
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') {
      abrirAlta(searchParams.get('socio') ?? '')
      const params = new URLSearchParams(searchParams.toString())
      params.delete('nuevo')
      params.delete('socio')
      router.replace(`?${params.toString()}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [altaError, altaAction, isAltaPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const result = await createRetiro(prev, fd)
      if (!result) setAltaModalOpen(false)
      return result
    },
    null
  )

  const mesesDisponibles = useMemo(() => {
    const setM = new Set<string>()
    for (const r of retiros) setM.add(mesDe(r))
    return Array.from(setM).sort((a, b) => b.localeCompare(a))
  }, [retiros])

  // Mes que scopea las cards (retiros del mes + top categorías). Default = último con datos.
  const [mesSeleccionado, setMesSeleccionado] = useState<string>(mesesDisponibles[0] ?? hoy)

  // Datos agregados por socio (misma valuación excluyente que Cuentas particulares).
  // saldoARS/saldoUSD/sinConvertir son GLOBALES (lo pendiente no es de un mes);
  // retirosDelMes y topCategorias reflejan `mesSeleccionado`.
  const datosPorSocio = useMemo(() => {
    const m = new Map<string, {
      socio: Socio
      saldoARS: number
      saldoUSD: number
      sinConvertir: number
      retirosDelMes: number
      cantidadRetiros: number
      topCategorias: { categoria: CategoriaRetiro | null; total: number; count: number }[]
    }>()

    for (const socio of socios) {
      const rs = retiros.filter((r) => r.socio_id === socio.id)
      // saldoARS = Σ valorRetiroArs → es exactamente lo PENDIENTE de dolarizar
      // (los dolarizados suman 0 en ARS). saldoUSD = Σ valorRetiroUsd (lo ya dolarizado).
      const saldoARS = rs.reduce((s, r) => s + valorRetiroArs(r), 0)
      const saldoUSD = rs.reduce((s, r) => s + valorRetiroUsd(r), 0)
      const sinConvertir = rs.filter((r) => !retiroEsUsd(r)).length

      const rsMes = rs.filter((r) => mesDe(r) === mesSeleccionado)
      const retirosDelMes = rsMes.reduce((s, r) => s + Number(r.monto_pesos ?? 0), 0)

      const porCat = new Map<string, { categoria: CategoriaRetiro | null; total: number; count: number }>()
      for (const r of rsMes) {
        const key = r.categoria?.id ?? 'sin'
        if (!porCat.has(key)) porCat.set(key, { categoria: r.categoria ?? null, total: 0, count: 0 })
        const v = porCat.get(key)!
        v.total += Number(r.monto_pesos ?? 0)
        v.count += 1
      }
      const topCategorias = Array.from(porCat.values()).sort((a, b) => b.total - a.total).slice(0, 3)

      m.set(socio.id, { socio, saldoARS, saldoUSD, sinConvertir, retirosDelMes, cantidadRetiros: rs.length, topCategorias })
    }
    return m
  }, [socios, retiros, mesSeleccionado])

  // Sin dolarizar (banner + default del conversor)
  const mesesSinConvertir = useMemo(() => {
    const meses = retiros.filter((r) => !retiroEsUsd(r)).map((r) => mesDe(r)).filter(Boolean)
    return [...new Set(meses)].sort().reverse()
  }, [retiros])
  const mesConvDefault = mesesSinConvertir[0] ?? hoy
  const totalSinConvertir = retiros.filter((r) => !retiroEsUsd(r)).length

  const { sortKey, sortDir, toggleSort, sortRows } = useSort<'fecha' | 'socio' | 'categoria' | 'medio' | 'monto'>('fecha', 'desc')
  const retirosFiltrados = useMemo(() => {
    const filtrados = retiros.filter((r) => {
      if (filtroSocio && r.socio_id !== filtroSocio) return false
      if (filtroCategoria && r.categoria_id !== filtroCategoria) return false
      if (filtroMes && mesDe(r) !== filtroMes) return false
      return true
    })
    return sortRows(filtrados, (r, k): string | number => {
      switch (k) {
        case 'fecha': return r.fecha ?? ''
        case 'socio': return (socios.find((s) => s.id === r.socio_id)?.nombre ?? r.socio ?? '').toLowerCase()
        case 'categoria': return (r.categoria?.nombre ?? '').toLowerCase()
        case 'medio': return (r.medio_pago ?? '').toLowerCase()
        case 'monto': return Number(r.monto_pesos ?? 0)
        default: return ''
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retiros, filtroSocio, filtroCategoria, filtroMes, sortKey, sortDir])

  function abrirAlta(nombre: string) {
    setDefaultSocio(nombre)
    setMedioPago('TRANSFERENCIA')
    setCuotasTotal(1)
    setProgramar(false)
    setAltaModalOpen(true)
  }
  function abrirConversion(mes: string) {
    setCierreMesInicial(mes)
    setCierreModalOpen(true)
  }
  function handleDelete(id: string) {
    if (!confirm('¿Eliminar este retiro?')) return
    startTransition(() => deleteRetiro(id))
  }

  const nombresSocios = socios.map((s) => s.nombre)

  return (
    <div className="space-y-6">
      {/* Header + acciones */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Cuenta corriente de socios
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">
            Saldo deudor de cada socio con Areben SRL. Crece con los retiros, baja con aportes / sueldos / devoluciones.
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
          {socios.map((s) => (
            <Button
              key={s.id}
              onClick={() => abrirAlta(s.nombre)}
              title={`Registrar retiro de ${s.nombre}`}
              className="bg-purple-600 border-purple-500 hover:bg-purple-500"
            >
              <Plus className="w-4 h-4" />
              Retiro {s.alias ?? s.nombre.split(' ')[0]}
            </Button>
          ))}
          <Button variant="secondary" onClick={() => abrirAlta('')} title="Registrar retiro de otro socio">
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

      {/* Selector de mes (scopea retiros del mes + top categorías de las cards) */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-fg-muted flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          Actividad de:
        </span>
        <select
          value={mesSeleccionado}
          onChange={(e) => setMesSeleccionado(e.target.value)}
          className="bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {(mesesDisponibles.length > 0 ? mesesDisponibles : [mesSeleccionado]).map((m) => (
            <option key={m} value={m}>{formatMonth(m)}</option>
          ))}
        </select>
      </div>

      {/* Cards por socio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {socios.map((socio) => {
          const datos = datosPorSocio.get(socio.id)!
          return (
            <div key={socio.id} className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-fg flex items-center gap-2">
                    {socio.nombre}
                    <Badge variant="info">{socio.porcentaje_participacion}%</Badge>
                  </h2>
                  <p className="text-xs text-fg-muted mt-0.5">
                    {datos.cantidadRetiros} retiros · alias: <span className="font-mono">{socio.alias ?? '—'}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => abrirAlta(socio.nombre)} title={`Nuevo retiro de ${socio.nombre}`}>
                    <Plus className="w-3.5 h-3.5" />
                    Retiro
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setPagoModalSocio(socio)} title="Registrar una devolución del socio (baja el saldo deudor)">
                    <ArrowUpCircle className="w-3.5 h-3.5" />
                    Pago
                  </Button>
                </div>
              </div>

              {/* Pendiente de dolarizar (accionable) + saldo USD acumulado como referencia */}
              <div className="px-5 py-5 bg-amber-500/5 border-b border-border">
                <p className="text-xs text-fg-muted uppercase tracking-wide mb-1">Pendiente de dolarizar</p>
                <p className="text-3xl font-bold text-amber-700 font-mono">{formatCurrency(datos.saldoARS)}</p>
                {datos.sinConvertir > 0 ? (
                  <p className="text-xs text-amber-700 mt-1">
                    {datos.sinConvertir} retiro{datos.sinConvertir !== 1 ? 's' : ''} en ARS sin convertir a USD
                  </p>
                ) : (
                  <p className="text-xs text-fg-soft mt-1">Todo dolarizado ✓</p>
                )}
                <Link
                  href="/finanzas/cuentas-patrimoniales?tab=cuentas-particulares"
                  className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-primary transition-colors mt-2"
                >
                  saldo USD acumulado: <span className="font-mono font-medium">{formatCurrency(datos.saldoUSD, 'USD')}</span> →
                </Link>
              </div>

              {/* retiros del mes seleccionado */}
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <span className="text-xs text-fg-muted flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Retiros de {formatMonth(mesSeleccionado)}
                </span>
                <span className="text-sm font-mono font-semibold text-fg">{formatCurrency(datos.retirosDelMes)}</span>
              </div>

              {/* top categorías del mes seleccionado */}
              {datos.topCategorias.length > 0 ? (
                <div className="px-5 py-3">
                  <p className="text-xs text-fg-muted uppercase tracking-wide mb-2">Top categorías · {formatMonth(mesSeleccionado)}</p>
                  <div className="space-y-1.5">
                    {datos.topCategorias.map((c, idx) => (
                      <div key={c.categoria?.id ?? `sin-${idx}`} className="flex items-center justify-between text-xs">
                        <span className="text-fg-muted flex items-center gap-1.5">
                          {c.categoria?.emoji && <span>{c.categoria.emoji}</span>}
                          {c.categoria?.nombre ?? 'Sin categoría'}
                          <span className="text-fg-soft">({c.count})</span>
                        </span>
                        <span className="font-mono text-fg">{formatCurrency(c.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-5 py-3">
                  <p className="text-xs text-fg-soft">Sin retiros en {formatMonth(mesSeleccionado)}</p>
                </div>
              )}

              <div className="px-5 py-3 bg-surface-2/30 border-t border-border">
                <button
                  type="button"
                  onClick={() => setFiltroSocio(socio.id === filtroSocio ? null : socio.id)}
                  className={cn('text-xs font-medium transition-colors', socio.id === filtroSocio ? 'text-primary' : 'text-fg-muted hover:text-primary')}
                >
                  {socio.id === filtroSocio ? '✓ Filtrado abajo' : 'Ver retiros de este socio →'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Detalle: tabla de retiros filtrables */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-semibold text-fg">Detalle de retiros</h2>
            <p className="text-xs text-fg-muted mt-0.5">{retirosFiltrados.length} de {retiros.length} retiros</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filtroSocio ?? ''}
              onChange={(e) => setFiltroSocio(e.target.value || null)}
              className="bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Todos los socios</option>
              {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select
              value={filtroCategoria ?? ''}
              onChange={(e) => setFiltroCategoria(e.target.value || null)}
              className="bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ${c.nombre}` : c.nombre}</option>)}
            </select>
            <select
              value={filtroMes ?? ''}
              onChange={(e) => setFiltroMes(e.target.value || null)}
              className="bg-surface-2 border border-border-strong rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Todos los meses</option>
              {mesesDisponibles.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
            </select>
            {(filtroSocio || filtroCategoria || filtroMes) && (
              <button
                type="button"
                onClick={() => { setFiltroSocio(null); setFiltroCategoria(null); setFiltroMes(null) }}
                className="text-xs text-primary hover:underline"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/30">
                <SortTh col="fecha" label="Fecha" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="py-2" />
                <SortTh col="socio" label="Socio" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="py-2" />
                <SortTh col="categoria" label="Categoría" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="py-2" />
                <SortTh col="medio" label="Medio" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="py-2" />
                <SortTh col="monto" label="Monto" align="right" numeric sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="py-2" />
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Notas</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {retirosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-fg-soft">
                    <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Sin retiros con esos filtros
                  </td>
                </tr>
              ) : (
                retirosFiltrados.map((r) => {
                  const socioNombre = socios.find((s) => s.id === r.socio_id)?.nombre ?? r.socio
                  return (
                    <tr key={r.id} className="border-b border-border/60 hover:bg-surface-2/30">
                      <td className="px-4 py-2 text-fg-muted text-xs whitespace-nowrap">{formatDate(r.fecha)}</td>
                      <td className="px-4 py-2 text-fg font-medium">{socioNombre}</td>
                      <td className="px-4 py-2">
                        {r.categoria ? (
                          <span className="text-xs text-fg-muted">{r.categoria.emoji} {r.categoria.nombre}</span>
                        ) : (
                          <span className="text-xs text-fg-soft">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {esCompromisoFuturo(r) ? (
                          <Badge variant="purple"><CreditCard className="w-2.5 h-2.5 inline mr-0.5" />Tarjeta</Badge>
                        ) : (
                          <Badge variant="default">{r.medio_pago ?? 'Efectivo'}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="font-mono text-fg font-medium flex items-center justify-end gap-1.5">
                          {Number(r.monto_pesos) !== 0 && (
                            <span className={Number(r.monto_pesos) < 0 ? 'text-green-600' : ''}>{formatCurrency(r.monto_pesos)}</span>
                          )}
                          {retiroEsUsd(r) ? (
                            valorRetiroUsd(r) !== 0 && (
                              <span className="text-green-700">/ {formatCurrency(valorRetiroUsd(r), 'USD')}</span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 text-[10px] font-medium">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              sin convertir
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-fg-soft max-w-[220px] truncate">{r.notas ?? '—'}</td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="danger" onClick={() => handleDelete(r.id)} disabled={isPending}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal alta de retiro */}
      <Modal open={altaModalOpen} onOpenChange={(o) => { setAltaModalOpen(o); if (!o) setDefaultSocio('') }} title="Registrar retiro" className="max-w-md">
        <form action={altaAction} className="space-y-4">
          <Input label="Socio" name="socio" list="socios-list-alta" placeholder="Nombre del socio" defaultValue={defaultSocio} required />
          <datalist id="socios-list-alta">
            {nombresSocios.map((s) => <option key={s} value={s} />)}
          </datalist>

          <Select
            label="Categoría"
            name="categoria_id"
            defaultValue=""
            options={[{ value: '', label: '— Sin categoría —' }, ...categorias.map((c) => ({ value: c.id, label: `${c.emoji ?? ''} ${c.nombre}` }))]}
          />

          <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer bg-surface-2/40 border border-border-strong/40 rounded-lg px-3 py-2">
            <input type="checkbox" checked={programar} onChange={(e) => setProgramar(e.target.checked)} className="rounded" />
            Programar a futuro (queda pendiente, no impacta hasta efectivizarlo)
          </label>
          <input type="hidden" name="estado" value={programar ? 'PROGRAMADO' : 'PAGADO'} />

          <Input
            label={programar ? 'Fecha programada' : 'Fecha'}
            name="fecha" type="date"
            defaultValue={new Date().toISOString().split('T')[0]}
            required
          />

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
                          cuotasTotal === n ? 'bg-orange-500/20 border-orange-500/50 text-orange-600' : 'bg-surface-2 border-[#c8c0b0] text-fg-muted hover:text-fg-muted',
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
                  <p className="text-xs text-fg-soft mt-1">Las cuotas se generan como pasivo financiero en /finanzas/tarjetas.</p>
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

          {altaError && <p className="text-sm text-red-700">{altaError}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setAltaModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isAltaPending} title="Guardar el retiro y, si es con tarjeta, generar las cuotas en pasivos">
              {isAltaPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Registrar
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal pago/devolución */}
      {pagoModalSocio && (
        <Modal
          open={!!pagoModalSocio}
          onOpenChange={(o) => { if (!o) setPagoModalSocio(null) }}
          title={`Registrar pago de ${pagoModalSocio.nombre}`}
          description="El socio devuelve plata a la empresa. Se anota como movimiento negativo y baja el saldo deudor."
          className="max-w-md"
        >
          <PagoSocioForm socio={pagoModalSocio} categorias={categorias} onClose={() => { setPagoModalSocio(null); router.refresh() }} />
        </Modal>
      )}

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

// ─── PagoSocioForm ────────────────────────────────────────────────────────────

function PagoSocioForm({ socio, categorias, onClose }: { socio: Socio; categorias: CategoriaRetiro[]; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [montoArs, setMontoArs] = useState(0)
  const [montoUsd, setMontoUsd] = useState(0)
  const [tipoCambio, setTipoCambio] = useState(1000)
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [notas, setNotas] = useState('')

  function submit() {
    setError(null)
    if (montoArs <= 0 && montoUsd <= 0) {
      setError('Ingresá un monto en ARS o USD.')
      return
    }
    startTransition(async () => {
      try {
        await registrarPagoSocio({
          socioId: socio.id,
          fecha,
          montoArs,
          montoUsd,
          tipoCambio: montoUsd > 0 ? tipoCambio : 1,
          categoriaId: categoriaId || undefined,
          notas: notas || undefined,
        })
        onClose()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Estás registrando un <span className="font-semibold text-green-700">pago/devolución</span> de
        <span className="font-semibold text-fg"> {socio.nombre}</span>. El monto se registra como negativo en su cuenta corriente, reduciendo el saldo deudor.
      </p>

      <Input label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Monto en ARS" type="number" step="0.01" min="0" value={montoArs || ''} onChange={(e) => setMontoArs(Number(e.target.value))} placeholder="0.00" />
        <Input label="Monto en USD" type="number" step="0.01" min="0" value={montoUsd || ''} onChange={(e) => setMontoUsd(Number(e.target.value))} placeholder="0.00" />
      </div>

      {montoUsd > 0 && (
        <Input label="Tipo de cambio (1 USD = ? ARS)" type="number" step="0.01" min="0" value={tipoCambio || ''} onChange={(e) => setTipoCambio(Number(e.target.value))} />
      )}

      <Select
        label="Categoría (opcional)"
        value={categoriaId}
        onChange={(e) => setCategoriaId(e.target.value)}
        options={[{ value: '', label: '— Sin categoría —' }, ...categorias.map((c) => ({ value: c.id, label: c.emoji ? `${c.emoji} ${c.nombre}` : c.nombre }))]}
      />

      <Textarea label="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Detalle del pago..." />

      {error && <p className="text-sm text-danger bg-danger-bg border border-danger-bd rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={submit} disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Registrar pago
        </Button>
      </div>
    </div>
  )
}

// ─── CierreConversionModal ───────────────────────────────────────────────────

function CierreConversionModal({
  open, onOpenChange, retiros, tcSugerido, mesInicial,
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

  useEffect(() => {
    if (open) {
      setMes(mesInicial)
      setError(null)
      setDone(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const retirosDelMes = retiros.filter((r) => (r.mes ?? r.fecha.substring(0, 7)) === mes)
  const sinConvertirDelMes = retirosDelMes.filter((r) => !retiroEsUsd(r)).length
  const totalArs = retirosDelMes.reduce((s, r) => s + (r.monto_pesos || 0), 0)
  const totalUsdActual = retirosDelMes.reduce((s, r) => s + (r.monto_usd_calculado ?? 0), 0)
  const totalUsdNuevo = tc > 0 ? totalArs / tc + retirosDelMes.reduce((s, r) => s + (r.monto_usd > 0 ? r.monto_usd : 0), 0) : 0

  const mesesDisponibles = [...new Set(retiros.map((r) => r.mes ?? r.fecha.substring(0, 7)).filter(Boolean))] as string[]
  mesesDisponibles.sort().reverse()

  function ejecutar() {
    setError(null)
    setDone(null)
    if (!tc || tc <= 0) { setError('Ingresá un tipo de cambio válido'); return }
    if (retirosDelMes.length === 0) { setError('No hay retiros en este mes'); return }
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
          options={mesesDisponibles.length > 0 ? mesesDisponibles.map((m) => ({ value: m, label: formatMonth(m) })) : [{ value: mes, label: formatMonth(mes) }]}
        />

        <Input label="Tipo de cambio de cierre" type="number" step="0.01" value={tc || ''} onChange={(e) => setTc(Number(e.target.value))} />

        <div className="bg-surface/60 border border-border-strong/40 rounded-lg p-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-fg-muted">Retiros del mes</p>
            <p className="text-base font-semibold text-fg">
              {retirosDelMes.length}
              {sinConvertirDelMes > 0 && <span className="text-xs font-normal text-amber-600"> · {sinConvertirDelMes} sin convertir</span>}
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
          <Button type="button" variant="success" onClick={ejecutar} disabled={isPending} title="Aplicar el TC a todos los retiros del mes y recalcular sus USD">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Convertir y cerrar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
