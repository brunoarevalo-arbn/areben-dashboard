'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Building2,
  LayoutDashboard,
  DollarSign,
  Users,
  ShoppingCart,
  BarChart3,
  Settings,
  ChevronDown,
  Wallet,
  Receipt,
  TrendingDown,
  FileText,
  Package,
  Truck,
  Calculator,
  TrendingUp,
  PieChart,
  Sliders,
  Plug,
  UserCheck,
  CalendarDays,
  CreditCard,
  Boxes,
  ArrowDownCircle,
  FileCheck,
  PiggyBank,
  Clock,
} from 'lucide-react'

interface NavItem {
  label: string
  href?: string
  icon: React.ElementType
  children?: NavItem[]
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    label: 'Finanzas',
    icon: DollarSign,
    children: [
      {
        label: 'Gastos',
        icon: TrendingDown,
        children: [
          { label: 'Del mes', href: '/finanzas/gastos', icon: TrendingDown },
          { label: 'Fijos', href: '/finanzas/gastos?tab=fijos', icon: Receipt },
        ],
      },
      {
        label: 'Pagos y deuda',
        icon: Wallet,
        children: [
          { label: 'Pagos del mes', href: '/finanzas/pagos', icon: Wallet },
          { label: 'Pendientes', href: '/finanzas/pagos?tab=pendientes', icon: Clock },
          { label: 'Cuentas corrientes', href: '/finanzas/pagos?tab=cuentas-corrientes', icon: Receipt },
        ],
      },
      { label: 'Tarjetas', href: '/finanzas/tarjetas', icon: CreditCard },
      {
        label: 'Patrimonio',
        icon: Boxes,
        children: [
          { label: 'Por tipo', href: '/finanzas/cuentas-patrimoniales', icon: Boxes },
          { label: 'Impositivos', href: '/finanzas/cuentas-patrimoniales?tab=impositivos', icon: Receipt },
          { label: 'Bienes de uso', href: '/finanzas/cuentas-patrimoniales?tab=bienes', icon: Boxes },
        ],
      },
      { label: 'Tesorería', href: '/finanzas/saldos', icon: Wallet },
      {
        label: 'Socios',
        icon: Users,
        children: [
          { label: 'Movimientos', href: '/finanzas/cuenta-socios', icon: CreditCard },
          { label: 'Estado de cuenta', href: '/finanzas/cuenta-socios?tab=estado', icon: Users },
        ],
      },
      {
        label: 'AFIP',
        icon: Receipt,
        children: [
          { label: 'Facturación', href: '/finanzas/afip', icon: Receipt },
          { label: 'Planes de pago', href: '/finanzas/afip?tab=planes', icon: FileText },
        ],
      },
      { label: 'Préstamos bancarios', href: '/finanzas/prestamos', icon: TrendingDown },
      { label: 'Cierre de mes', href: '/finanzas/cierre-mes', icon: FileCheck },
    ],
  },
  {
    label: 'Inversiones',
    icon: PiggyBank,
    children: [
      { label: 'Inversores', href: '/inversiones', icon: Users },
      { label: 'Capital de inversores', href: '/inversiones/prestamos', icon: TrendingUp },
      { label: 'Cierre mensual', href: '/inversiones/cierre', icon: FileCheck },
      { label: 'Gastos financieros', href: '/inversiones/gastos', icon: TrendingUp },
      { label: 'Reporte', href: '/inversiones/reporte', icon: PieChart },
    ],
  },
  {
    label: 'RR.HH.',
    icon: Users,
    children: [
      { label: 'Empleados', href: '/rrhh/empleados', icon: UserCheck },
      { label: 'Nómina', href: '/rrhh/nomina', icon: FileText },
      { label: 'Vacaciones', href: '/rrhh/vacaciones', icon: CalendarDays },
    ],
  },
  {
    label: 'Compras',
    icon: ShoppingCart,
    children: [
      { label: 'Proveedores', href: '/compras/proveedores', icon: Truck },
      { label: 'Compras', href: '/compras/lista', icon: Package },
      { label: 'Costeo Importación', href: '/compras/costeo', icon: Calculator },
      { label: 'Proyecciones', href: '/compras/proyecciones', icon: TrendingUp },
    ],
  },
  {
    label: 'Egresos',
    icon: ArrowDownCircle,
    children: [
      { label: 'Pagos', href: '/egresos/pagos', icon: CreditCard },
      { label: 'Cartera de Cheques', href: '/egresos/cheques', icon: FileCheck },
    ],
  },
  {
    label: 'Análisis',
    icon: BarChart3,
    children: [
      { label: 'Inteligencia', href: '/analisis/gn', icon: BarChart3 },
      { label: 'Ventas', href: '/analisis/ventas', icon: TrendingUp },
      { label: 'P&L por Marca', href: '/analisis/pl-marca', icon: PieChart },
      { label: 'Cash Flow', href: '/analisis/cash-flow', icon: BarChart3 },
      { label: 'Exportar', href: '/analisis/exportar', icon: FileText },
    ],
  },
  {
    label: 'Configuración',
    icon: Settings,
    children: [
      { label: 'Empresa', href: '/settings/empresa', icon: Building2 },
      { label: 'Prorrateo', href: '/settings/prorrateo', icon: Sliders },
      { label: 'Aportes', href: '/settings/aportes', icon: Sliders },
      { label: 'Depreciación', href: '/settings/depreciacion', icon: Calculator },
      { label: 'API Gestión Nube', href: '/settings/api-gestion-nube', icon: Plug },
      { label: 'Cuentas de cobro', href: '/settings/cuentas-cobro', icon: Wallet },
    ],
  },
]

function isAnyDescendantActive(item: NavItem, pathname: string): boolean {
  if (item.href) {
    const path = item.href.split('?')[0] // ignorar query (?tab=) para expandir el grupo
    if (pathname === path) return true
    if (path !== '/' && pathname.startsWith(path + '/')) return true
  }
  return item.children?.some((c) => isAnyDescendantActive(c, pathname)) ?? false
}

function NavGroup({ item, level = 0 }: { item: NavItem; level?: number }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hasChildren = !!item.children?.length
  const childActive = hasChildren && (item.children?.some((c) => isAnyDescendantActive(c, pathname)) ?? false)
  const [open, setOpen] = useState(childActive)

  // Hoja: link directo
  if (!hasChildren) {
    const [path, query] = (item.href ?? '').split('?')
    const pathMatches = !!item.href && (pathname === path || (path !== '/' && pathname.startsWith(path + '/')))
    const hrefTab = query ? new URLSearchParams(query).get('tab') : null
    const currentTab = searchParams.get('tab')
    // Con ?tab= → activo si coincide la pestaña; sin tab (default) → activo si no hay tab en la URL
    const isActive = pathMatches && (hrefTab ? currentTab === hrefTab : !currentTab)

    // Estilos por nivel: top level usa el del menú principal, children usan el más chico
    const baseLeaf = level === 0
      ? 'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors'
      : 'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors'

    const activeLeaf = level === 0
      ? 'bg-orange-500/15 text-orange-400'
      : 'bg-orange-500/15 text-orange-400'

    const inactiveLeaf = level === 0
      ? 'text-slate-300 hover:text-white hover:bg-slate-800'
      : 'text-fg-soft hover:text-white hover:bg-slate-800'

    return (
      <Link
        href={item.href!}
        className={cn(baseLeaf, isActive ? activeLeaf : inactiveLeaf)}
      >
        <item.icon className={level === 0 ? 'w-4 h-4 shrink-0' : 'w-3.5 h-3.5 shrink-0'} />
        {item.label}
      </Link>
    )
  }

  // Group: botón con chevron + children indentados
  const baseGroup = level === 0
    ? 'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors'
    : 'w-full flex items-center justify-between gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors'

  const groupColor = childActive
    ? 'text-orange-400'
    : level === 0
      ? 'text-slate-300 hover:text-white hover:bg-slate-800'
      : 'text-fg-soft hover:text-white hover:bg-slate-800'

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(baseGroup, groupColor)}
      >
        <span className={level === 0 ? 'flex items-center gap-3' : 'flex items-center gap-2.5'}>
          <item.icon className={level === 0 ? 'w-4 h-4 shrink-0' : 'w-3.5 h-3.5 shrink-0'} />
          {item.label}
        </span>
        <ChevronDown
          className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="mt-1 ml-4 pl-3 border-l border-slate-700 space-y-0.5">
          {item.children!.map((child) => (
            <NavGroup key={child.label} item={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="w-64 md:w-60 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">Areben</p>
            <p className="text-xs text-fg-soft truncate">Comercial SRL</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => (
          <NavGroup key={item.label} item={item} />
        ))}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <div className="flex gap-1">
          {(['BDI', 'ZATTIA', 'STUNNED'] as const).map((marca) => (
            <span
              key={marca}
              className={cn(
                'flex-1 text-center text-xs py-1 rounded font-medium',
                marca === 'BDI' && 'bg-purple-500/15 text-purple-400',
                marca === 'ZATTIA' && 'bg-pink-500/15 text-pink-400',
                marca === 'STUNNED' && 'bg-amber-500/15 text-amber-400'
              )}
            >
              {marca}
            </span>
          ))}
        </div>
      </div>
    </aside>
  )
}
