'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  Landmark,
  Boxes,
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
      { label: 'Saldos', href: '/finanzas/saldos', icon: Wallet },
      { label: 'Gastos', href: '/finanzas/gastos', icon: TrendingDown },
      { label: 'Retiros', href: '/finanzas/retiros', icon: CreditCard },
      { label: 'AFIP', href: '/finanzas/afip', icon: Receipt },
      { label: 'Bienes de Uso', href: '/finanzas/bienes', icon: Boxes },
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
    label: 'Análisis',
    icon: BarChart3,
    children: [
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
      { label: 'Aportes', href: '/settings/aportes', icon: Sliders },
      { label: 'Depreciación', href: '/settings/depreciacion', icon: Calculator },
      { label: 'API Gestión Nube', href: '/settings/api-gestion-nube', icon: Plug },
    ],
  },
]

function NavGroup({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const isChildActive = item.children?.some((c) => c.href && pathname.startsWith(c.href))
  const [open, setOpen] = useState(isChildActive ?? false)

  if (!item.children) {
    const isActive = pathname === item.href
    return (
      <Link
        href={item.href!}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-indigo-600/20 text-indigo-400'
            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
        )}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {item.label}
      </Link>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isChildActive
            ? 'text-indigo-400'
            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
        )}
      >
        <span className="flex items-center gap-3">
          <item.icon className="w-4 h-4 shrink-0" />
          {item.label}
        </span>
        <ChevronDown
          className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="mt-1 ml-4 pl-3 border-l border-slate-800 space-y-0.5">
          {item.children.map((child) => {
            const isActive = child.href ? pathname === child.href || pathname.startsWith(child.href + '/') : false
            return (
              <Link
                key={child.href}
                href={child.href!}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-400'
                    : 'text-slate-500 hover:text-slate-100 hover:bg-slate-800'
                )}
              >
                <child.icon className="w-3.5 h-3.5 shrink-0" />
                {child.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">Areben</p>
            <p className="text-xs text-slate-500 truncate">Comercial SRL</p>
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
