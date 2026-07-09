'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

export interface TabItem {
  key: string
  label: string
}

/**
 * Barra de pestañas basada en el query param `?tab=`. El panel activo lo elige la
 * page server-side (leyendo searchParams.tab); este componente solo cambia el param,
 * preservando el resto (ej. ?mes=). Es SSR-friendly y linkeable.
 *
 * Uso en la page:
 *   const TABS = [{ key: 'mes', label: 'Del mes' }, { key: 'fijos', label: 'Fijos' }]
 *   const tab = TABS.some(t => t.key === params.tab) ? params.tab! : TABS[0].key
 *   <Tabs items={TABS} activeKey={tab} />
 *   {tab === 'mes' ? <PanelMes/> : <PanelFijos/>}
 */
export function Tabs({
  items,
  activeKey,
  paramName = 'tab',
}: {
  items: TabItem[]
  activeKey: string
  paramName?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function irA(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(paramName, key)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="border-b border-border">
      <nav className="flex gap-1 -mb-px overflow-x-auto" role="tablist">
        {items.map((t) => {
          const activo = t.key === activeKey
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => irA(t.key)}
              className={cn(
                'whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activo
                  ? 'border-primary text-primary'
                  : 'border-transparent text-fg-muted hover:text-fg hover:border-border-strong',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
