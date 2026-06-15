'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registrarPagoSocio } from '@/app/actions/finanzas'
import type { Socio, RetiroSocio, CategoriaRetiro } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils'
import {
  Users, Wallet, CreditCard, TrendingDown, TrendingUp, Calendar,
  ArrowDownCircle, ArrowUpCircle, Loader2, Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  socios: Socio[]
  retiros: RetiroSocio[]
  categorias: CategoriaRetiro[]
  socioInicial: string | null
}

// Es "compromiso futuro" si va a salir de caja en el futuro (cuota de tarjeta sin pagar).
// Para v1 simplificamos: todo retiro con medio_pago=TARJETA es compromiso, el resto ya salió.
function esCompromisoFuturo(r: RetiroSocio): boolean {
  return r.medio_pago === 'TARJETA'
}

// Mes YYYY-MM del retiro (usa el campo `mes` si está, sino lo deriva de la fecha)
function mesDe(r: RetiroSocio): string {
  if (r.mes) return r.mes
  return r.fecha.substring(0, 7)
}

export function CuentaSociosClient({ socios, retiros, categorias, socioInicial }: Props) {
  const router = useRouter()
  const [pagoModalSocio, setPagoModalSocio] = useState<Socio | null>(null)
  const [filtroSocio, setFiltroSocio] = useState<string | null>(socioInicial)
  const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null)
  const [filtroMes, setFiltroMes] = useState<string | null>(null)

  // Mapa socioId → array de retiros, ARS y USD totales, etc.
  const datosPorSocio = useMemo(() => {
    const m = new Map<string, {
      socio: Socio
      retirosTotal: RetiroSocio[]
      saldoARS: number
      saldoUSD: number
      yaSalidoARS: number
      compromisoARS: number
      yaSalidoUSD: number
      compromisoUSD: number
      retirosMesActual: number
      cantidadRetiros: number
      topCategorias: { categoria: CategoriaRetiro | null; total: number; count: number }[]
    }>()

    const mesActual = new Date().toISOString().substring(0, 7)

    for (const socio of socios) {
      const rs = retiros.filter((r) => r.socio_id === socio.id)
      const saldoARS = rs.reduce((s, r) => s + Number(r.monto_pesos ?? 0), 0)
      const saldoUSD = rs.reduce((s, r) => s + Number(r.monto_usd ?? 0), 0)

      const compromiso = rs.filter(esCompromisoFuturo)
      const yaSalido = rs.filter((r) => !esCompromisoFuturo(r))

      const compromisoARS = compromiso.reduce((s, r) => s + Number(r.monto_pesos ?? 0), 0)
      const yaSalidoARS = yaSalido.reduce((s, r) => s + Number(r.monto_pesos ?? 0), 0)
      const compromisoUSD = compromiso.reduce((s, r) => s + Number(r.monto_usd ?? 0), 0)
      const yaSalidoUSD = yaSalido.reduce((s, r) => s + Number(r.monto_usd ?? 0), 0)

      const retirosMesActual = rs
        .filter((r) => mesDe(r) === mesActual)
        .reduce((s, r) => s + Number(r.monto_pesos ?? 0), 0)

      // Top categorías
      const porCat = new Map<string, { categoria: CategoriaRetiro | null; total: number; count: number }>()
      for (const r of rs) {
        const key = r.categoria?.id ?? 'sin'
        if (!porCat.has(key)) {
          porCat.set(key, { categoria: r.categoria ?? null, total: 0, count: 0 })
        }
        const v = porCat.get(key)!
        v.total += Number(r.monto_pesos ?? 0)
        v.count += 1
      }
      const topCategorias = Array.from(porCat.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)

      m.set(socio.id, {
        socio,
        retirosTotal: rs,
        saldoARS,
        saldoUSD,
        yaSalidoARS,
        compromisoARS,
        yaSalidoUSD,
        compromisoUSD,
        retirosMesActual,
        cantidadRetiros: rs.length,
        topCategorias,
      })
    }

    return m
  }, [socios, retiros])

  // Lista de meses presentes (para filtro)
  const mesesDisponibles = useMemo(() => {
    const setM = new Set<string>()
    for (const r of retiros) setM.add(mesDe(r))
    return Array.from(setM).sort((a, b) => b.localeCompare(a))
  }, [retiros])

  // Retiros filtrados para la tabla de detalle
  const retirosFiltrados = useMemo(() => {
    return retiros.filter((r) => {
      if (filtroSocio && r.socio_id !== filtroSocio) return false
      if (filtroCategoria && r.categoria_id !== filtroCategoria) return false
      if (filtroMes && mesDe(r) !== filtroMes) return false
      return true
    })
  }, [retiros, filtroSocio, filtroCategoria, filtroMes])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          Cuenta corriente de socios
        </h1>
        <p className="text-sm text-fg-muted mt-0.5">
          Saldo deudor de cada socio con Areben SRL. Crece con los retiros, baja con aportes / sueldos / dividendos / devoluciones.
        </p>
      </div>

      {/* Cards por socio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {socios.map((socio) => {
          const datos = datosPorSocio.get(socio.id)!
          return (
            <div key={socio.id} className="bg-surface border border-border rounded-xl overflow-hidden">
              {/* Header del socio */}
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-fg flex items-center gap-2">
                    {socio.nombre}
                    <Badge variant="info">{socio.porcentaje_participacion}%</Badge>
                  </h2>
                  <p className="text-xs text-fg-muted mt-0.5">
                    {datos.cantidadRetiros} retiros registrados · alias: <span className="font-mono">{socio.alias ?? '—'}</span>
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPagoModalSocio(socio)}
                  title="Registrar una devolución del socio (baja el saldo deudor)"
                >
                  <ArrowUpCircle className="w-3.5 h-3.5" />
                  Pago
                </Button>
              </div>

              {/* Saldo deudor total — pieza más prominente */}
              <div className="px-5 py-5 bg-amber-500/5 border-b border-border">
                <p className="text-xs text-fg-muted uppercase tracking-wide mb-1">Saldo deudor con Areben</p>
                <div className="flex items-baseline gap-3">
                  <p className="text-3xl font-bold text-amber-700 font-mono">{formatCurrency(datos.saldoARS)}</p>
                  {datos.saldoUSD > 0 && (
                    <p className="text-sm font-mono text-fg-muted">+ {formatCurrency(datos.saldoUSD, 'USD')}</p>
                  )}
                </div>
              </div>

              {/* Distribución: ya salió de caja vs compromiso futuro */}
              <div className="px-5 py-4 grid grid-cols-2 gap-3 border-b border-border">
                <div>
                  <p className="text-xs text-fg-muted flex items-center gap-1 mb-1">
                    <ArrowDownCircle className="w-3 h-3 text-green-700" />
                    Ya salió de caja
                  </p>
                  <p className="text-base font-bold text-green-700 font-mono">{formatCurrency(datos.yaSalidoARS)}</p>
                  {datos.yaSalidoUSD > 0 && (
                    <p className="text-xs font-mono text-fg-soft">+ {formatCurrency(datos.yaSalidoUSD, 'USD')}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-fg-muted flex items-center gap-1 mb-1">
                    <CreditCard className="w-3 h-3 text-purple-700" />
                    Compromiso futuro (TC)
                  </p>
                  <p className="text-base font-bold text-purple-700 font-mono">{formatCurrency(datos.compromisoARS)}</p>
                  {datos.compromisoUSD > 0 && (
                    <p className="text-xs font-mono text-fg-soft">+ {formatCurrency(datos.compromisoUSD, 'USD')}</p>
                  )}
                </div>
              </div>

              {/* Mes actual */}
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <span className="text-xs text-fg-muted flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Retiros de {formatMonth(new Date().toISOString().substring(0, 7))}
                </span>
                <span className="text-sm font-mono font-semibold text-fg">{formatCurrency(datos.retirosMesActual)}</span>
              </div>

              {/* Top categorías */}
              {datos.topCategorias.length > 0 && (
                <div className="px-5 py-3">
                  <p className="text-xs text-fg-muted uppercase tracking-wide mb-2">Top categorías</p>
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
              )}

              {/* CTA para ver detalle */}
              <div className="px-5 py-3 bg-surface-2/30 border-t border-border">
                <button
                  type="button"
                  onClick={() => setFiltroSocio(socio.id === filtroSocio ? null : socio.id)}
                  className={cn(
                    'text-xs font-medium transition-colors',
                    socio.id === filtroSocio
                      ? 'text-primary'
                      : 'text-fg-muted hover:text-primary',
                  )}
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
            <p className="text-xs text-fg-muted mt-0.5">
              {retirosFiltrados.length} de {retiros.length} retiros
            </p>
          </div>

          {/* Filtros */}
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
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Fecha</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Socio</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Categoría</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Medio</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-fg-muted uppercase">Monto</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-fg-muted uppercase">Notas</th>
              </tr>
            </thead>
            <tbody>
              {retirosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-fg-soft">
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
                          <span className="text-xs text-fg-muted">
                            {r.categoria.emoji} {r.categoria.nombre}
                          </span>
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
                        <div className="font-mono text-fg font-medium">
                          {Number(r.monto_pesos) !== 0 && (
                            <span className={Number(r.monto_pesos) < 0 ? 'text-green-600' : ''}>
                              {formatCurrency(r.monto_pesos)}
                            </span>
                          )}
                          {Number(r.monto_usd) !== 0 && Number(r.monto_pesos) !== 0 && ' / '}
                          {Number(r.monto_usd) !== 0 && (
                            <span className={Number(r.monto_usd) < 0 ? 'text-green-600' : 'text-green-700'}>
                              {formatCurrency(r.monto_usd, 'USD')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-fg-soft max-w-[260px] truncate">{r.notas ?? '—'}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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
    </div>
  )
}

// ─── PagoSocioForm ────────────────────────────────────────────────────────────

function PagoSocioForm({
  socio,
  categorias,
  onClose,
}: {
  socio: Socio
  categorias: CategoriaRetiro[]
  onClose: () => void
}) {
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
        <span className="font-semibold text-fg"> {socio.nombre}</span>. El monto se registra como negativo en su cuenta corriente,
        reduciendo el saldo deudor.
      </p>

      <Input label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Monto en ARS"
          type="number"
          step="0.01"
          min="0"
          value={montoArs || ''}
          onChange={(e) => setMontoArs(Number(e.target.value))}
          placeholder="0.00"
        />
        <Input
          label="Monto en USD"
          type="number"
          step="0.01"
          min="0"
          value={montoUsd || ''}
          onChange={(e) => setMontoUsd(Number(e.target.value))}
          placeholder="0.00"
        />
      </div>

      {montoUsd > 0 && (
        <Input
          label="Tipo de cambio (1 USD = ? ARS)"
          type="number"
          step="0.01"
          min="0"
          value={tipoCambio || ''}
          onChange={(e) => setTipoCambio(Number(e.target.value))}
        />
      )}

      <Select
        label="Categoría (opcional)"
        value={categoriaId}
        onChange={(e) => setCategoriaId(e.target.value)}
        options={[
          { value: '', label: '— Sin categoría —' },
          ...categorias.map((c) => ({ value: c.id, label: c.emoji ? `${c.emoji} ${c.nombre}` : c.nombre })),
        ]}
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
