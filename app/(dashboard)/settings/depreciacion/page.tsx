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
        <h1 className="text-2xl font-bold text-fg">Configuración de Depreciación</h1>
        <p className="text-sm text-fg-muted mt-0.5">Vida útil por tipo de bien</p>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Tipo de bien</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Vida útil</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Valor residual %</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Estado</th>
            </tr>
          </thead>
          <tbody>
            {tipos?.map((t) => (
              <tr key={t.id} className="border-b border-border/60">
                <td className="px-4 py-3 text-fg font-medium">{t.tipo_bien}</td>
                <td className="px-4 py-3 text-right text-fg-muted">{t.vida_util_anos} años</td>
                <td className="px-4 py-3 text-right text-fg-muted">{t.valor_residual_porcentaje}%</td>
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
