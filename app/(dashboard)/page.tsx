import { createClient } from '@/lib/supabase/server'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { formatCurrency, getCurrentMonth, formatMonth } from '@/lib/utils'
import { DollarSign, TrendingDown, Users, AlertTriangle, Wallet, CreditCard } from 'lucide-react'
import { EstadoBadge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const mes = getCurrentMonth()

  const [
    { data: gastosMes },
    { data: saldoActual },
    { data: gastosVencidos },
    { data: nominaPendiente },
    { data: empleadosActivos },
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
      .from('nomina_mensual')
      .select('neto, empleado:empleados(nombre, apellido)')
      .eq('mes', mes)
      .eq('estado', 'PENDIENTE'),
    supabase
      .from('empleados')
      .select('id')
      .eq('activo', true),
  ])

  const totalGastosMes = gastosMes?.reduce((sum, g) => sum + g.monto, 0) ?? 0
  const gastosPagados = gastosMes?.filter((g) => g.estado === 'PAGADO').reduce((sum, g) => sum + g.monto, 0) ?? 0
  const saldoTotal = (saldoActual?.saldo_pesos ?? 0) + (saldoActual?.caja_pesos ?? 0)
  const nominaPendienteTotal = nominaPendiente?.reduce((sum, n) => sum + n.neto, 0) ?? 0
  const cantidadEmpleados = empleadosActivos?.length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-0.5">{formatMonth(mes)}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Saldo Total (ARS)"
          value={formatCurrency(saldoTotal)}
          subtitle="Cuentas + Caja"
          icon={Wallet}
          iconColor="bg-indigo-500/15"
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
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Cuenta Bancaria (ARS)</p>
            <p className="text-xl font-bold text-slate-100">{formatCurrency(saldoActual.saldo_pesos)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Caja (ARS)</p>
            <p className="text-xl font-bold text-slate-100">{formatCurrency(saldoActual.caja_pesos)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">USD</p>
            <p className="text-xl font-bold text-slate-100">{formatCurrency(saldoActual.saldo_usd + saldoActual.caja_usd, 'USD')}</p>
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
          <div className="bg-slate-900 border border-red-500/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Gastos Vencidos
              </h2>
              <Link href="/finanzas/gastos?estado=VENCIDO" className="text-xs text-indigo-400 hover:text-indigo-300">
                Ver todos
              </Link>
            </div>
            <div className="space-y-2">
              {gastosVencidos.map((g) => (
                <div key={g.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <div>
                    <p className="text-sm text-slate-200">{g.concepto}</p>
                    <p className="text-xs text-slate-500">{formatMonth(g.mes)}</p>
                  </div>
                  <span className="text-sm font-medium text-red-400">{formatCurrency(g.monto)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {nominaPendiente && nominaPendiente.length > 0 && (
          <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-400" />
                Nómina Pendiente — {formatMonth(mes)}
              </h2>
              <Link href="/rrhh/nomina" className="text-xs text-indigo-400 hover:text-indigo-300">
                Ver nómina
              </Link>
            </div>
            <div className="space-y-2">
              {nominaPendiente.map((n, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <p className="text-sm text-slate-200">
                    {(n.empleado as unknown as { nombre: string; apellido: string } | null)?.nombre}{' '}
                    {(n.empleado as unknown as { nombre: string; apellido: string } | null)?.apellido}
                  </p>
                  <span className="text-sm font-medium text-amber-400">{formatCurrency(n.neto)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between">
              <span className="text-sm text-slate-400">Total a pagar</span>
              <span className="text-sm font-bold text-slate-100">{formatCurrency(nominaPendienteTotal)}</span>
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

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-100 mb-4">Accesos rápidos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Cargar gasto', href: '/finanzas/gastos', color: 'text-red-400' },
            { label: 'Nueva nómina', href: '/rrhh/nomina', color: 'text-amber-400' },
            { label: 'Registrar retiro', href: '/finanzas/retiros', color: 'text-indigo-400' },
            { label: 'Ver análisis', href: '/analisis/pl-marca', color: 'text-green-400' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-slate-800 hover:bg-slate-700 rounded-lg p-3 text-center transition-colors"
            >
              <p className={`text-sm font-medium ${item.color}`}>{item.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
