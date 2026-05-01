import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Plug } from 'lucide-react'

export default async function ApiGNPage() {
  const supabase = await createClient()
  const { data: config } = await supabase
    .from('configuracion_api')
    .select('*')
    .eq('servicio', 'gestion_nube')
    .maybeSingle()

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">API Gestión Nube</h1>
        <p className="text-sm text-slate-400 mt-0.5">Configuración de integración con Gestión Nube</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center">
            <Plug className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <p className="font-medium text-slate-100">Gestión Nube</p>
            <Badge variant={config?.estado === 'CONFIGURADO' ? 'success' : 'warning'}>
              {config?.estado ?? 'NO_CONFIGURADO'}
            </Badge>
          </div>
        </div>

        <p className="text-sm text-slate-400">
          La integración con la API de Gestión Nube está planificada para una próxima versión.
          Por ahora, los datos se cargan manualmente en el módulo de Análisis → Ventas.
        </p>

        {config?.notas && (
          <p className="text-sm text-slate-500 bg-slate-800 rounded-lg p-3">{config.notas}</p>
        )}
      </div>
    </div>
  )
}
