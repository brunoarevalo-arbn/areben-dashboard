import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'

export default async function DepreciacionPage() {
  const supabase = await createClient()
  const { data: tipos } = await supabase
    .from('configuracion_depreciacion')
    .select('*')
    .order('tipo_bien')

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Configuración de Depreciación</h1>
        <p className="text-sm text-slate-400 mt-0.5">Vida útil por tipo de bien</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Tipo de bien</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Vida útil</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Valor residual %</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Estado</th>
            </tr>
          </thead>
          <tbody>
            {tipos?.map((t) => (
              <tr key={t.id} className="border-b border-slate-800/60">
                <td className="px-4 py-3 text-slate-100 font-medium">{t.tipo_bien}</td>
                <td className="px-4 py-3 text-right text-slate-300">{t.vida_util_anos} años</td>
                <td className="px-4 py-3 text-right text-slate-300">{t.valor_residual_porcentaje}%</td>
                <td className="px-4 py-3">
                  <Badge variant={t.activo ? 'success' : 'danger'}>{t.activo ? 'Activo' : 'Inactivo'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
