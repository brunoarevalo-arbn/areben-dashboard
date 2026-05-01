import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export default async function VacacionesPage() {
  const supabase = await createClient()
  const ano = new Date().getFullYear()

  const { data: vacaciones } = await supabase
    .from('vacaciones_empleados')
    .select('*, empleado:empleados(nombre, apellido)')
    .eq('ano', ano)

  const { data: empleados } = await supabase
    .from('empleados')
    .select('id, nombre, apellido')
    .eq('activo', true)
    .order('apellido')

  const conVacaciones = vacaciones?.map((v) => v.empleado_id) ?? []
  const sinVacaciones = empleados?.filter((e) => !conVacaciones.includes(e.id)) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Vacaciones {ano}</h1>
        <p className="text-sm text-slate-400 mt-0.5">{vacaciones?.length ?? 0} empleados con registro</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Empleado</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Disponibles</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Tomados</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Restantes</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Períodos</th>
            </tr>
          </thead>
          <tbody>
            {!vacaciones?.length ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No hay registros de vacaciones para {ano}
                </td>
              </tr>
            ) : (
              vacaciones.map((v) => (
                <tr key={v.id} className="border-b border-slate-800/60">
                  <td className="px-4 py-3 font-medium text-slate-100">
                    {(v.empleado as { nombre: string; apellido: string } | null)?.apellido},{' '}
                    {(v.empleado as { nombre: string; apellido: string } | null)?.nombre}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">{v.dias_disponibles}d</td>
                  <td className="px-4 py-3 text-right text-amber-400">{v.dias_tomados}d</td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={v.dias_restantes > 5 ? 'success' : v.dias_restantes > 0 ? 'warning' : 'danger'}>
                      {v.dias_restantes}d
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {(v.periodos as { fecha_inicio: string; fecha_fin: string; dias: number }[]).map((p, i) => (
                      <span key={i} className="mr-2">
                        {formatDate(p.fecha_inicio)} → {formatDate(p.fecha_fin)} ({p.dias}d)
                      </span>
                    ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sinVacaciones.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-sm font-medium text-slate-300 mb-2">Sin registro en {ano}:</p>
          <div className="flex flex-wrap gap-2">
            {sinVacaciones.map((e) => (
              <span key={e.id} className="px-2 py-1 bg-slate-800 rounded text-xs text-slate-400">
                {e.apellido}, {e.nombre}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
