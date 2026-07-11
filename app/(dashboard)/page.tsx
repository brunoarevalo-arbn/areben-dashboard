import { createClient } from '@/lib/supabase/server'
import { getMesActivo } from '@/lib/mes-activo'
import { calcularReposicion } from '@/app/actions/finanzas'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatMonth } from '@/lib/utils'
import { TrendingDown, Users, AlertTriangle, Wallet, CreditCard, Boxes, FileCheck } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { CierreMensual } from '@/types/database'
import { EstadoMesPanel } from '@/components/dashboard/estado-mes-panel'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const supabase = await createClient()
  const mes = (await searchParams).mes ?? (await getMesActivo())

  const [
    { data: gastosMes },
    { data: saldosCuentas },
    { data: cierre },
    { data: gastosVencidos },
    { data: nominaPendiente },
    { data: empleadosActivos },
    { data: cuentasInventario },
    { data: existencias },
  ] = await Promise.all([
    supabase.from('gastos').select('monto, estado').eq('mes', mes),
    // Fuente viva de saldos (el resto de la app ya no usa saldos_mensuales)
    supabase
      .from('saldos_cuentas')
      .select('saldo_ars, saldo_usd, cuenta:cuentas_bancarias(activo)')
      .eq('mes', mes),
    supabase.from('cierres_mensuales').select('*').eq('mes', mes).maybeSingle(),
    supabase
      .from('gastos')
      .select('id, concepto, monto, negocio, mes')
      .eq('estado', 'VENCIDO')
      .order('mes', { ascending: false })
      .limit(5),
    supabase
      .from('v_nominas_con_empleado')
      .select('neto, empleado_nombre, empleado_apellido')
      .eq('mes', mes)
      .eq('estado', 'PENDIENTE'),
    supabase.from('empleados').select('id').eq('activo', true),
    supabase
      .from('cuentas_patrimoniales')
      .select('*')
      .eq('tipo', 'INVENTARIO')
      .eq('activo', true)
      .order('orden'),
    supabase.from('existencias_marca').select('marca, unidades, valuacion').eq('mes', mes),
  ])

  // Valor de inventario (arranque + compras − CMV) en vivo — misma fuente que el cierre (nada guardado).
  const repoValores = (cuentasInventario?.length ?? 0) > 0
    ? await Promise.all([calcularReposicion('BDI', mes), calcularReposicion('ZATTIA_STUNNED', mes)])
    : null
  const repoData = (marca: string | null) =>
    marca === 'BDI' ? repoValores?.[0]
      : marca === 'ZATTIA' ? repoValores?.[1]
        : null // STUNNED consolidado en ZATTIA

  const cierreMes = cierre as CierreMensual | null

  const totalGastosMes = gastosMes?.reduce((sum, g) => sum + g.monto, 0) ?? 0
  const gastosPagados = gastosMes?.filter((g) => g.estado === 'PAGADO').reduce((sum, g) => sum + g.monto, 0) ?? 0

  // Saldo total del mes = saldos de cuentas activas + caja del cierre (reactivo al mes)
  const cuentasActivas = (saldosCuentas ?? []).filter((s) => {
    const c = (s.cuenta ?? null) as unknown as { activo: boolean } | null
    return c?.activo !== false
  })
  const cuentasArs = cuentasActivas.reduce((s, x) => s + Number(x.saldo_ars ?? 0), 0)
  const cuentasUsd = cuentasActivas.reduce((s, x) => s + Number(x.saldo_usd ?? 0), 0)
  const cajaArs = cierreMes?.caja_ars ?? 0
  const cajaUsd = cierreMes?.caja_usd ?? 0
  const saldoTotalArs = cuentasArs + cajaArs
  const saldoUsd = cuentasUsd + cajaUsd
  const hayDatosSaldo = cuentasActivas.length > 0 || cierreMes != null

  const nominaPendienteTotal = nominaPendiente?.reduce((sum, n) => sum + n.neto, 0) ?? 0
  const cantidadEmpleados = empleadosActivos?.length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg">Dashboard</h1>
        <p className="text-sm text-fg-muted mt-0.5">{formatMonth(mes)}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Saldo Total (ARS)"
          value={formatCurrency(saldoTotalArs)}
          subtitle="Cuentas + Caja"
          icon={Wallet}
          iconColor="bg-orange-500/15"
          variant={saldoTotalArs < 0 ? 'danger' : 'default'}
        />
        <KpiCard
          title="Gastos del Mes"
          value={formatCurrency(totalGastosMes)}
          subtitle={`Pagado: ${formatCurrency(gastosPagados)}`}
          icon={TrendingDown}
          iconColor="bg-red-500/15"
        />
        <KpiCard
          title="Nómina Pendiente"
          value={formatCurrency(nominaPendienteTotal)}
          subtitle={`${nominaPendiente?.length ?? 0} empleados`}
          icon={CreditCard}
          iconColor="bg-amber-500/15"
          variant={nominaPendienteTotal > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          title="Empleados Activos"
          value={String(cantidadEmpleados)}
          subtitle="Total en planta"
          icon={Users}
          iconColor="bg-green-500/15"
        />
      </div>

      {hayDatosSaldo && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-xs text-fg-muted mb-1">Cuentas Bancarias (ARS)</p>
            <p className="text-xl font-bold text-fg">{formatCurrency(cuentasArs)}</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-xs text-fg-muted mb-1">Caja (ARS)</p>
            <p className="text-xl font-bold text-fg">{formatCurrency(cajaArs)}</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-xs text-fg-muted mb-1">USD</p>
            <p className="text-xl font-bold text-fg">{formatCurrency(saldoUsd, 'USD')}</p>
          </div>
        </div>
      )}

      {!hayDatosSaldo && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-900">Sin saldo cargado para {formatMonth(mes)}</p>
            <p className="text-xs text-amber-800 mt-0.5">
              <Link href={`/finanzas/saldos?mes=${mes}`} className="underline">Cargá los saldos del mes</Link> para ver los KPIs completos.
            </p>
          </div>
        </div>
      )}

      {/* Resumen del cierre del mes */}
      <div className="bg-surface border border-primary/20 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-primary" />
            Resumen de cierre — {formatMonth(mes)}
            {cierreMes?.cerrado ? (
              <Badge variant="success">Cerrado</Badge>
            ) : cierreMes ? (
              <Badge variant="warning">Borrador</Badge>
            ) : null}
          </h2>
          <Link href={`/finanzas/cierre-mes?mes=${mes}`} className="text-xs text-primary hover:text-orange-600">
            Ver cierre
          </Link>
        </div>
        {cierreMes ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-surface-2/40 p-3">
              <p className="text-[10px] uppercase text-fg-muted mb-1">Activos</p>
              <p className="text-lg font-mono font-bold text-fg">{formatCurrency(cierreMes.total_activos_ars)}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2/40 p-3">
              <p className="text-[10px] uppercase text-fg-muted mb-1">Pasivos</p>
              <p className="text-lg font-mono font-bold text-red-700">{formatCurrency(cierreMes.total_pasivos_ars)}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2/40 p-3">
              <p className="text-[10px] uppercase text-fg-muted mb-1">Patrimonio Neto</p>
              <p className="text-lg font-mono font-bold text-fg">{formatCurrency(cierreMes.pn_ars)}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2/40 p-3">
              <p className="text-[10px] uppercase text-fg-muted mb-1">Resultado</p>
              <p className={cn('text-lg font-mono font-bold', cierreMes.resultado_ars >= 0 ? 'text-success' : 'text-red-700')}>
                {formatCurrency(cierreMes.resultado_ars)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-fg-soft">
            Todavía no hay cierre para este mes.{' '}
            <Link href={`/finanzas/cierre-mes?mes=${mes}`} className="underline">Armalo en Cierre de mes</Link>.
          </p>
        )}
      </div>

      <EstadoMesPanel mes={mes} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {gastosVencidos && gastosVencidos.length > 0 && (
          <div className="bg-surface border border-red-500/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-700" />
                Gastos Vencidos
              </h2>
              <Link href="/finanzas/gastos?estado=VENCIDO" className="text-xs text-primary hover:text-orange-600">
                Ver todos
              </Link>
            </div>
            <div className="space-y-2">
              {gastosVencidos.map((g) => (
                <div key={g.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm text-fg-muted">{g.concepto}</p>
                    <p className="text-xs text-fg-soft">{formatMonth(g.mes)}</p>
                  </div>
                  <span className="text-sm font-medium text-red-700">{formatCurrency(g.monto)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {nominaPendiente && nominaPendiente.length > 0 && (
          <div className="bg-surface border border-amber-500/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-700" />
                Nómina Pendiente — {formatMonth(mes)}
              </h2>
              <Link href="/rrhh/nomina" className="text-xs text-primary hover:text-orange-600">
                Ver nómina
              </Link>
            </div>
            <div className="space-y-2">
              {nominaPendiente.map((n, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <p className="text-sm text-fg-muted">
                    {n.empleado_nombre} {n.empleado_apellido}
                  </p>
                  <span className="text-sm font-medium text-amber-700">{formatCurrency(n.neto)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border flex justify-between">
              <span className="text-sm text-fg-muted">Total a pagar</span>
              <span className="text-sm font-bold text-fg">{formatCurrency(nominaPendienteTotal)}</span>
            </div>
          </div>
        )}

        {(!gastosVencidos || gastosVencidos.length === 0) && (!nominaPendiente || nominaPendiente.length === 0) && (
          <div className="col-span-2 bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <p className="text-green-800 font-medium">Todo al día</p>
            <p className="text-xs text-green-700 mt-1">No hay gastos vencidos ni nóminas pendientes.</p>
          </div>
        )}
      </div>

      {/* Posición de inventario por marca */}
      {cuentasInventario && cuentasInventario.length > 0 && (() => {
        const stockMap = new Map<string, { u: number; v: number }>()
        for (const e of existencias ?? []) stockMap.set(e.marca, { u: Number(e.unidades), v: Number(e.valuacion) })
        return (
          <div className="bg-surface border border-teal-500/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
                <Boxes className="w-4 h-4 text-success" />
                Valor de inventario — {formatMonth(mes)}
              </h2>
              <Link href="/finanzas/cuentas-patrimoniales" className="text-xs text-primary hover:text-orange-600">
                Editar saldos
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {cuentasInventario.map((c) => {
                const rd = repoData(c.marca)
                const saldo = rd?.saldo ?? 0
                const mm = rd?.detalle.find((d) => d.mes === mes)
                const comprasMes = mm?.comprasNetas ?? 0
                const cmvMes = mm?.cmv ?? 0
                const saldoInicial = saldo - (comprasMes - cmvMes)
                const positivo = saldo > 0
                const negativo = saldo < 0
                return (
                  <div
                    key={c.id}
                    className={cn(
                      'rounded-lg border p-3',
                      positivo && 'bg-teal-500/5 border-teal-500/30',
                      negativo && 'bg-amber-500/5 border-amber-500/30',
                      !positivo && !negativo && 'bg-surface-2/40 border-border-strong/40',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-fg-muted">{c.marca}</span>
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded',
                        positivo && 'bg-teal-500/15 text-success',
                        negativo && 'bg-amber-500/15 text-amber-800',
                        !positivo && !negativo && 'bg-surface-2 text-fg-muted',
                      )}>
                        {positivo ? 'Activo' : negativo ? 'Negativo' : '—'}
                      </span>
                    </div>
                    <p className={cn(
                      'text-lg font-mono font-bold',
                      positivo && 'text-success',
                      negativo && 'text-amber-700',
                      !positivo && !negativo && 'text-fg-muted',
                    )}>
                      {positivo ? '+' : negativo ? '−' : ''}{formatCurrency(Math.abs(saldo))}
                    </p>
                    {rd && (comprasMes || cmvMes) ? (
                      <p className="text-[10px] text-fg-soft font-mono mt-1">
                        Inicial {formatCurrency(saldoInicial)} · <span className="text-success">+ compras {formatCurrency(comprasMes)}</span> · <span className="text-amber-700">− CMV {formatCurrency(cmvMes)}</span>
                      </p>
                    ) : null}
                    {c.marca && stockMap.has(c.marca) && (
                      <p className="text-[11px] text-fg-soft mt-1">
                        Stock real: {stockMap.get(c.marca)!.u.toLocaleString('es-AR')} u. · {formatCurrency(stockMap.get(c.marca)!.v)}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-fg-soft italic mt-3">
              Valor de inventario = arranque + Σ(compras netas − CMV). Sube por compra, baja por venta (CMV). Es la valuación contable, no el stock físico. ZATTIA incluye STUNNED.
            </p>
          </div>
        )
      })()}

      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-fg mb-4">Accesos rápidos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Cargar gasto', href: '/finanzas/gastos', color: 'text-danger' },
            { label: 'Nueva nómina', href: '/rrhh/nomina', color: 'text-amber-800' },
            { label: 'Registrar retiro', href: '/finanzas/cuenta-socios?tab=movimientos', color: 'text-primary' },
            { label: 'Ver análisis', href: '/analisis/pl-marca', color: 'text-success' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-slate-900 hover:bg-slate-800 rounded-lg p-3 text-center transition-colors"
            >
              <p className={`text-sm font-medium ${item.color}`}>{item.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
