import { createClient } from '@/lib/supabase/server'
import { SECTORES } from '@/lib/sectores'
import type { EstadoSectorMes } from '@/types/database'
import { EstadoSectorToggle } from './estado-sector-toggle'
import { ClipboardCheck } from 'lucide-react'
import Link from 'next/link'

// Panel del Home: muestra, por mes, qué sectores ya se cargaron ("listo") y cuáles faltan.
export async function EstadoMesPanel({ mes }: { mes: string }) {
  const supabase = await createClient()
  const { data } = await supabase.from('estado_sector_mes').select('*').eq('mes', mes)
  const byKey = new Map<string, EstadoSectorMes>()
  for (const r of (data ?? []) as EstadoSectorMes[]) byKey.set(r.sector, r)

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-sm font-semibold text-fg mb-4 flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-primary" />
        Estado del mes — ¿qué está cargado?
      </h2>
      <div className="space-y-1">
        {SECTORES.map((s) => {
          const e = byKey.get(s.key)
          const listo = !!e?.listo
          return (
            <div
              key={s.key}
              className="flex items-center justify-between gap-3 py-2 border-b border-border/60 last:border-0"
            >
              <div className="min-w-0">
                <Link href={s.ruta} className="text-sm text-fg hover:text-primary font-medium">
                  {s.label}
                </Link>
                {listo && e?.marcado_por && (
                  <p className="text-[11px] text-fg-soft">
                    por {e.marcado_por}
                    {e.marcado_at ? ` · ${new Date(e.marcado_at).toLocaleDateString('es-AR')}` : ''}
                  </p>
                )}
              </div>
              <EstadoSectorToggle sector={s.key} mes={mes} listo={listo} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
