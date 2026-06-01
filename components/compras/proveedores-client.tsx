'use client'

import { useActionState, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createProveedor, updateProveedor } from '@/app/actions/compras'
import { importProveedoresExcel } from '@/app/actions/finanzas'
import type { Proveedor } from '@/types/database'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ExcelImport } from '@/components/ui/excel-import'
import { Plus, Pencil, Truck, Globe, Loader2, Mail, Phone, Upload } from 'lucide-react'

function ProveedorForm({ prov, onClose }: { prov?: Proveedor; onClose: () => void }) {
  const action = prov ? updateProveedor.bind(null, prov.id) : createProveedor
  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const res = await action(prev, fd)
      if (!res) onClose()
      return res
    },
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <Input label="Nombre" name="nombre" defaultValue={prov?.nombre} required />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Select
          label="Tipo"
          name="tipo"
          defaultValue={prov?.tipo ?? 'NACIONAL'}
          options={[
            { value: 'NACIONAL', label: 'Nacional' },
            { value: 'IMPORTACION', label: 'Importación' },
          ]}
        />
        <Select
          label="Moneda"
          name="moneda"
          defaultValue={prov?.moneda ?? 'ARS'}
          options={[
            { value: 'ARS', label: 'ARS (Pesos)' },
            { value: 'USD', label: 'USD (Dólares)' },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Input label="Contacto" name="contacto" defaultValue={prov?.contacto ?? ''} />
        <Input label="País" name="pais" defaultValue={prov?.pais ?? 'Argentina'} required />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Input label="Email" name="email" type="email" defaultValue={prov?.email ?? ''} />
        <Input label="Teléfono" name="telefono" defaultValue={prov?.telefono ?? ''} />
      </div>
      <Input label="Condiciones de pago" name="condiciones_pago" defaultValue={prov?.condiciones_pago ?? ''} placeholder="Ej: 30 días, 50% adelanto" />
      <Textarea label="Notas" name="notas" defaultValue={prov?.notas ?? ''} />

      {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {prov ? 'Guardar' : 'Crear proveedor'}
        </Button>
      </div>
    </form>
  )
}

export function ProveedoresClient({ proveedores }: { proveedores: Proveedor[] }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editProv, setEditProv] = useState<Proveedor | undefined>()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Quick action: ?nuevo=1 abre modal automáticamente
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') {
      setEditProv(undefined)
      setModalOpen(true)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('nuevo')
      router.replace(`?${params.toString()}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nacionales = proveedores.filter((p) => p.tipo === 'NACIONAL')
  const importacion = proveedores.filter((p) => p.tipo === 'IMPORTACION')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">Proveedores</h1>
          <p className="text-sm text-fg-muted mt-0.5">{proveedores.length} registros · {nacionales.length} nacionales · {importacion.length} importación</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(true)} title="Importar proveedores desde Excel">
            <Upload className="w-4 h-4" />
            Importar
          </Button>
          <Button onClick={() => { setEditProv(undefined); setModalOpen(true) }} title="Crear nuevo proveedor">
            <Plus className="w-4 h-4" />
            Nuevo proveedor
          </Button>
        </div>
      </div>

      {['NACIONAL', 'IMPORTACION'].map((tipo) => {
        const lista = tipo === 'NACIONAL' ? nacionales : importacion
        return (
          <div key={tipo}>
            <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-3 flex items-center gap-2">
              {tipo === 'NACIONAL' ? <Truck className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
              {tipo === 'NACIONAL' ? 'Nacionales' : 'Importación'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lista.length === 0 ? (
                <div className="col-span-3 bg-surface border border-border rounded-xl p-6 text-center text-fg-soft text-sm">
                  No hay proveedores de este tipo
                </div>
              ) : (
                lista.map((p) => (
                  <div key={p.id} className="bg-surface border border-border rounded-xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <p className="font-semibold text-fg">{p.nombre}</p>
                      <Badge variant={p.moneda === 'USD' ? 'success' : 'default'}>{p.moneda}</Badge>
                    </div>
                    <div className="space-y-1.5 text-sm mb-4">
                      {p.pais !== 'Argentina' && <p className="text-fg-muted">🌍 {p.pais}</p>}
                      {p.contacto && <p className="text-fg-muted">{p.contacto}</p>}
                      {p.condiciones_pago && <p className="text-fg-muted text-xs">{p.condiciones_pago}</p>}
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      {p.email && <a href={`mailto:${p.email}`} className="p-1.5 rounded hover:bg-surface-2 text-fg-soft hover:text-fg-muted transition-colors"><Mail className="w-3.5 h-3.5" /></a>}
                      {p.telefono && <a href={`tel:${p.telefono}`} className="p-1.5 rounded hover:bg-surface-2 text-fg-soft hover:text-fg-muted transition-colors"><Phone className="w-3.5 h-3.5" /></a>}
                    </div>
                    <Button size="sm" variant="ghost" className="w-full" onClick={() => { setEditProv(p); setModalOpen(true) }}>
                      <Pencil className="w-3.5 h-3.5" />
                      Editar
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}

      <Modal open={modalOpen} onOpenChange={setModalOpen} title={editProv ? 'Editar proveedor' : 'Nuevo proveedor'} className="max-w-xl">
        <ProveedorForm prov={editProv} onClose={() => setModalOpen(false)} />
      </Modal>

      <ExcelImport
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar proveedores"
        description="Subí un Excel con la lista de proveedores"
        templateName="proveedores"
        templateColumns={[
          { key: 'nombre', label: 'nombre', required: true, example: 'Distribuidora SA' },
          { key: 'tipo', label: 'tipo', example: 'NACIONAL' },
          { key: 'contacto', label: 'contacto', example: 'Juan Pérez' },
          { key: 'email', label: 'email', example: 'ventas@dist.com' },
          { key: 'telefono', label: 'telefono', example: '11 1234-5678' },
          { key: 'pais', label: 'pais', example: 'Argentina' },
          { key: 'moneda', label: 'moneda', example: 'ARS' },
          { key: 'condiciones_pago', label: 'condiciones_pago', example: '30 días' },
        ]}
        onImport={async (rows) => {
          const r = await importProveedoresExcel(rows as unknown as Parameters<typeof importProveedoresExcel>[0])
          return r
        }}
      />
    </div>
  )
}
