'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { marcarProduccionPasada, revertirProduccionPasada, deleteCompra } from '@/app/actions/compras'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Plus, Boxes, Loader2, ArrowRightCircle, Undo2, Trash2, Pencil, Factory } from 'lucide-react'
import { CompraForm } from './compra-form'
import type { Compra, Proveedor } from './compras-client'

const CAT_LABELS: Record<string, string> = {
  MANO_DE_OBRA: 'Mano de obra',
  INSUMO: 'Insumos',
  AVIO: 'Avíos',
  OTRO: 'Otros',
}

type Cuenta = { id: string; nombre: string; banco: string; titular?: { nombre: string } | null }

export function ProduccionClient({
  compras,
  proveedores,
  cuentas,
}: {
  compras: Compra[]
  proveedores: Proveedor[]
  cuentas: Cuenta[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Compra | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const hoy = new Date().toISOString().split('T')[0]
  const [fechaPasaje, setFechaPasaje] = useState(hoy)

  const enProceso = useMemo(() => compras.filter((c) => !c.fecha_pasaje), [compras])
  const pasadas = useMemo(() => compras.filter((c) => c.fecha_pasaje), [compras])

  const totalEnProceso = enProceso.reduce((s, c) => s + Number(c.monto_neto), 0)
  const totalPasadas = pasadas.reduce((s, c) => s + Number(c.monto_neto), 0)

  // Agrupar "en proceso" por categoría
  const porCategoria = useMemo(() => {
    const m = new Map<string, Compra[]>()
    for (const c of enProceso) {
      const k = c.categoria_produccion ?? 'OTRO'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(c)
    }
    return m
  }, [enProceso])

  function toggle(id: string) {
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function handlePasar() {
    if (sel.size === 0) return
    startTransition(async () => {
      const err = await marcarProduccionPasada(Array.from(sel), fechaPasaje)
      if (err) { alert(err); return }
      setSel(new Set())
      router.refresh()
    })
  }

  function handleRevertir(id: string) {
    startTransition(async () => {
      const err = await revertirProduccionPasada([id])
      if (err) { alert(err); return }
      router.refresh()
    })
  }

  function handleDelete(c: Compra) {
    if (!confirm(`¿Eliminar "${c.descripcion}"? Esto borra la compra y sus pagos.`)) return
    startTransition(async () => {
      try {
        await deleteCompra(c.id)
        router.refresh()
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
            <Factory className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-fg">Producción</h1>
            <p className="text-sm text-fg-soft">Insumos y mano de obra por mercadería en fabricación</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> Compra de producción
        </Button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-orange-500/30 rounded-xl p-4">
          <p className="text-xs text-fg-soft uppercase tracking-wide">Producción en proceso (activo)</p>
          <p className="text-2xl font-bold font-mono text-primary mt-1">{formatCurrency(totalEnProceso)}</p>
          <p className="text-xs text-fg-soft mt-1">{enProceso.length} ítems sin terminar · montos netos (sin IVA)</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-fg-soft uppercase tracking-wide">Ya pasado a stock</p>
          <p className="text-2xl font-bold font-mono text-fg-muted mt-1">{formatCurrency(totalPasadas)}</p>
          <p className="text-xs text-fg-soft mt-1">{pasadas.length} ítems terminados</p>
        </div>
      </div>

      {/* Barra de pasaje */}
      {sel.size > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 flex items-center justify-between flex-wrap gap-3 sticky top-2 z-10">
          <span className="text-sm text-fg-muted">
            {sel.size} seleccionada{sel.size > 1 ? 's' : ''} · {formatCurrency(enProceso.filter((c) => sel.has(c.id)).reduce((s, c) => s + Number(c.monto_neto), 0))}
          </span>
          <div className="flex items-center gap-2">
            <label className="text-xs text-fg-soft">Fecha de pasaje</label>
            <input
              type="date"
              value={fechaPasaje}
              onChange={(e) => setFechaPasaje(e.target.value)}
              className="px-2 py-1.5 bg-surface-2 border border-border-strong rounded text-fg text-sm"
            />
            <Button onClick={handlePasar} disabled={isPending}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightCircle className="w-4 h-4" />}
              Marcar como pasada a stock
            </Button>
          </div>
        </div>
      )}

      {/* En proceso, por categoría */}
      {enProceso.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-fg-soft">
          <Boxes className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No hay producción en proceso. Cargá una compra de producción para empezar.
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(porCategoria.entries()).map(([cat, items]) => {
            const subtotal = items.reduce((s, c) => s + Number(c.monto_neto), 0)
            return (
              <div key={cat} className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-surface-2/50 border-b border-border flex items-center justify-between">
                  <h3 className="text-sm font-medium text-fg-muted">{CAT_LABELS[cat] ?? cat}</h3>
                  <span className="font-mono text-sm text-primary">{formatCurrency(subtotal)}</span>
                </div>
                <div className="divide-y divide-border">
                  {items.map((c) => (
                    <div key={c.id} className="px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-surface-2/30">
                      <input
                        type="checkbox"
                        checked={sel.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="w-4 h-4 accent-orange-500 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-fg-muted truncate">{c.descripcion}</p>
                        <p className="text-xs text-fg-soft">
                          {c.proveedor?.nombre ?? '—'} · {formatDate(c.fecha)}
                          {Number(c.saldo_pendiente) > 0
                            ? <span className="text-amber-700"> · debe {formatCurrency(Number(c.saldo_pendiente))}</span>
                            : <span className="text-green-700"> · pagada</span>}
                        </p>
                      </div>
                      <span className="font-mono text-fg-muted shrink-0">{formatCurrency(Number(c.monto_neto))}</span>
                      <button onClick={() => setEditTarget(c)} className="p-1.5 rounded hover:bg-surface-2 text-fg-soft" title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 rounded hover:bg-red-500/10 text-red-700" title="Eliminar">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pasadas a stock */}
      {pasadas.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-surface-2/50 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-medium text-fg-muted">Pasadas a stock</h3>
            <span className="font-mono text-sm text-fg-muted">{formatCurrency(totalPasadas)}</span>
          </div>
          <div className="divide-y divide-border">
            {pasadas.map((c) => (
              <div key={c.id} className="px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-surface-2/30">
                <div className="min-w-0 flex-1">
                  <p className="text-fg-muted truncate">{c.descripcion}</p>
                  <p className="text-xs text-fg-soft">
                    {CAT_LABELS[c.categoria_produccion ?? 'OTRO'] ?? c.categoria_produccion} · {c.proveedor?.nombre ?? '—'} · pasó el {formatDate(c.fecha_pasaje!)}
                  </p>
                </div>
                <span className="font-mono text-fg-soft shrink-0">{formatCurrency(Number(c.monto_neto))}</span>
                <button
                  onClick={() => handleRevertir(c.id)}
                  disabled={isPending}
                  className="p-1.5 rounded hover:bg-surface-2 text-fg-soft"
                  title="Volver a en proceso"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal alta */}
      <Modal
        open={showForm}
        onOpenChange={setShowForm}
        title="Compra de producción"
        description="Insumo o mano de obra — suma como producción en proceso"
        className="max-w-xl"
      >
        <CompraForm
          proveedores={proveedores}
          cuentas={cuentas}
          initialNegocio="PRODUCCION"
          onClose={() => { setShowForm(false); router.refresh() }}
        />
      </Modal>

      {/* Modal edición */}
      {editTarget && (
        <Modal
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null) }}
          title="Editar compra de producción"
          className="max-w-xl"
        >
          <CompraForm
            compra={editTarget}
            proveedores={proveedores}
            cuentas={cuentas}
            onClose={() => { setEditTarget(null); router.refresh() }}
          />
        </Modal>
      )}
    </div>
  )
}
