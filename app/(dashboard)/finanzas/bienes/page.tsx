import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export default async function BienesPage() {
  const supabase = await createClient()
  const { data: bienes } = await supabase
    .from('bienes_uso')
    .select('*')
    .eq('activo', true)
    .order('fecha_compra', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bienes de Uso</h1>
        <p className="text-sm text-slate-600 mt-0.5">{bienes?.length ?? 0} activos</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {!bienes?.length ? (
          <div className="col-span-3 bg-white border border-[#e8e4dc] rounded-xl p-12 text-center text-slate-500">
            No hay bienes de uso registrados
          </div>
        ) : (
          bienes.map((b) => {
            const anosTranscurridos = (new Date().getFullYear() - new Date(b.fecha_compra).getFullYear())
            const depAnual = (b.precio - b.valor_residual) / b.vida_util_anos
            const valorActual = Math.max(b.valor_residual, b.precio - depAnual * anosTranscurridos)
            return (
              <div key={b.id} className="bg-white border border-[#e8e4dc] rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-slate-900">{b.nombre}</p>
                    <p className="text-xs text-slate-500">{b.tipo}</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Precio compra</span>
                    <span className="font-mono text-slate-900">{formatCurrency(b.precio)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Valor actual (est.)</span>
                    <span className="font-mono text-orange-500">{formatCurrency(valorActual)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Dep. anual</span>
                    <span className="font-mono text-red-700">{formatCurrency(depAnual)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Vida útil</span>
                    <span className="text-slate-700">{b.vida_util_anos} años</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Fecha compra</span>
                    <span className="text-slate-700">{formatDate(b.fecha_compra)}</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
