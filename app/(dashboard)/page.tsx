import { createClient } from '@/lib/supabase/server'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { formatCurrency, getCurrentMonth, formatMonth } from '@/lib/utils'
import { TrendingDown, Users, AlertTriangle, Wallet, CreditCard, Boxes } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()
  const mes = getCurrentMonth()

  const [
    { data: gastosMes },
    { data: saldoActual },
    { data: gastosVencidos },
    { data: nominaPendiente },
    { data: empleadosActivos },
    { data: cuentasInventario },
    { data: saldosInventario },
  ] = await Promise.all([
    supabase
      .from('gastos')
      .select('monto, estado')
      .eq('mes', mes),
    supabase
      .from('saldos_mensuales')
      .select('*')
      .eq('mes', mes)
      .maybeSingle(),
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
    supabase
      .from('empleados')
      .select('id')
      .eq('activo', true),
    supabase
      .from('cuentas_patrimoniales')
      .select('*')
      .eq('tipo', 'INVENTARIO')
      .eq('activo', true)
      .order('orden'),
    supabase
      .from('saldos_cuentas_patrim')
      .select('cuenta_id, saldo_cierre')
      .eq('mes', mes),
  ])

  const totalGastosMes = gastosMes?.reduce((sum, g) => sum + g.monto, 0) ?? 0
  const gastosPagados = gastosMes?.filter((g) => g.estado === 'PAGADO').reduce((sum, g) => sum + g.monto, 0) ?? 0
  const saldoTotal = (saldoActual?.saldo_pesos ?? 0) + (saldoActual?.caja_pesos ?? 0)
  const nominaPendienteTotal = nominaPendiente?.reduce((sum, n) => sum + n.neto, 0) ?? 0
  const cantidadEmpleados = empleadosActivos?.length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-600 mt-0.5">{formatMonth(mes)}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Saldo Total (ARS)"
          value={formatCurrency(saldoTotal)}
          subtitle="Cuentas + Caja"
          icon={Wallet}
          iconColor="bg-orange-500/15"
          variant={saldoTotal < 0 ? 'danger' : 'default'}
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

      {saldoActual && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-[#e8e4dc] rounded-xl p-4">
            <p className="text-xs text-slate-600 mb-1">Cuenta Bancaria (ARS)</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(saldoActual.saldo_pesos)}</p>
          </div>
          <div className="bg-white border border-[#e8e4dc] rounded-xl p-4">
            <p className="text-xs text-slate-600 mb-1">Caja (ARS)</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(saldoActual.caja_pesos)}</p>
          </div>
          <div className="bg-white border border-[#e8e4dc] rounded-xl p-4">
            <p className="text-xs text-slate-600 mb-1">USD</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(saldoActual.saldo_usd + saldoActual.caja_usd, 'USD')}</p>
          </div>
        </div>
      )}

      {!saldoActual && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-300">Sin saldo cargado para este mes</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              <Link href="/finanzas/saldos" className="underline">Cargá el saldo actual</Link> para ver los KPIs completos.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {gastosVencidos && gastosVencidos.length > 0 && (
          <div className="bg-white border border-red-500/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Gastos Vencidos
              </h2>
              <Link href="/finanzas/gastos?estado=VENCIDO" className="text-xs text-orange-500 hover:text-orange-600">
                Ver todos
              </Link>
            </div>
            <div className="space-y-2">
              {gastosVencidos.map((g) => (
                <div key={g.id} className="flex items-center justify-between py-2 border-b border-[#e8e4dc] last:border-0">
                  <div>
                    <p className="text-sm text-slate-800">{g.concepto}</p>
                    <p className="text-xs text-slate-500">{formatMonth(g.mes)}</p>
                  </div>
                  <span className="text-sm font-medium text-red-400">{formatCurrency(g.monto)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {nominaPendiente && nominaPendiente.length > 0 && (
          <div className="bg-white border border-amber-500/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-400" />
                Nómina Pendiente — {formatMonth(mes)}
              </h2>
              <Link href="/rrhh/nomina" className="text-xs text-orange-500 hover:text-orange-600">
                Ver nómina
              </Link>
            </div>
            <div className="space-y-2">
              {nominaPendiente.map((n, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-[#e8e4dc] last:border-0">
                  <p className="text-sm text-slate-800">
                    {n.empleado_nombre} {n.empleado_apellido}
                  </p>
                  <span className="text-sm font-medium text-amber-400">{formatCurrency(n.neto)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-[#e8e4dc] flex justify-between">
              <span className="text-sm text-slate-600">Total a pagar</span>
              <span className="text-sm font-bold text-slate-900">{formatCurrency(nominaPendienteTotal)}</span>
            </div>
          </div>
        )}

        {(!gastosVencidos || gastosVencidos.length === 0) && (!nominaPendiente || nominaPendiente.length === 0) && (
          <div className="col-span-2 bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center">
            <p className="text-green-400 font-medium">Todo al día</p>
            <p className="text-xs text-green-400/70 mt-1">No hay gastos vencidos ni nóminas pendientes.</p>
          </div>
        )}
      </div>

      {/* Posición de inventario por marca */}
      {cuentasInventario && cuentasInventario.length > 0 && (() => {
        const saldosMap = new Map<string, number>()
        for (const s of saldosInventario ?? []) saldosMap.set(s.cuenta_id, Number(s.saldo_cierre))
        return (
          <div className="bg-white border border-teal-500/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-teal-400" />
                Inventario por marca — {formatMonth(mes)}
              </h2>
              <Link href="/finanzas/cuentas-patrimoniales" className="text-xs text-orange-500 hover:text-orange-600">
                Editar saldos
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {cuentasInventario.map((c) => {
                const saldo = saldosMap.get(c.id) ?? 0
                const positivo = saldo > 0
                const negativo = saldo < 0
                return (
                  <div
                    key={c.id}
                    className={cn(
                      'rounded-lg border p-3',
                      positivo && 'bg-teal-500/5 border-teal-500/30',
                      negativo && 'bg-amber-500/5 border-amber-500/30',
                      !positivo && !negativo && 'bg-[#f5f0e6]/40 border-[#d6d0c4]/40',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-700">{c.marca}</span>
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded',
                        positivo && 'bg-teal-500/15 text-teal-300',
                        negativo && 'bg-amber-500/15 text-amber-300',
                        !positivo && !negativo && 'bg-slate-700 text-slate-600',
                      )}>
                        {positivo ? 'Activo · Stock' : negativo ? 'Pasivo · Reposición' : 'Equilibrado'}
                      </span>
                    </div>
                    <p className={cn(
                      'text-lg font-mono font-bold',
                      positivo && 'text-teal-400',
                      negativo && 'text-amber-400',
                      !positivo && !negativo && 'text-slate-700',
                    )}>
                      {positivo ? '+' : negativo ? '−' : ''}{formatCurrency(Math.abs(saldo))}
                    </p>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-slate-500 italic mt-3">
              Saldo = Compras acumuladas − CMV. Positivo = stock disponible · Negativo = deuda de reposición.
            </p>
          </div>
        )
      })()}

      <div className="bg-white border border-[#e8e4dc] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Accesos rápidos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Cargar gasto', href: '/finanzas/gastos', color: 'text-red-400' },
            { label: 'Nueva nómina', href: '/rrhh/nomina', color: 'text-amber-400' },
            { label: 'Registrar retiro', href: '/finanzas/retiros', color: 'text-orange-500' },
            { label: 'Ver análisis', href: '/analisis/pl-marca', color: 'text-green-400' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-[#f5f0e6] hover:bg-[#e8e0d0] rounded-lg p-3 text-center transition-colors"
            >
              <p className={`text-sm font-medium ${item.color}`}>{item.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
