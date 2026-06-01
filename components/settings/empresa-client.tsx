'use client'

import { useActionState } from 'react'
import { updateConfiguracionEmpresa } from '@/app/actions/empresa'
import type { ConfiguracionEmpresa } from '@/types/database'
import { Input, Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Building2, Loader2, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

export function EmpresaClient({ empresa }: { empresa: ConfiguracionEmpresa | null }) {
  const [savedOnce, setSavedOnce] = useState(false)

  const [error, formAction, isPending] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const res = await updateConfiguracionEmpresa(prev, fd)
      if (!res) setSavedOnce(true)
      return res
    },
    null,
  )

  if (!empresa) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" />
          Datos de la empresa
        </h1>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-800">
          Falta aplicar la migración 035 (tabla <code className="font-mono">configuracion_empresa</code>) en Supabase.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" />
          Datos de la empresa
        </h1>
        <p className="text-sm text-fg-muted mt-1">
          Aparecen en el encabezado de los comprobantes formales (PDF para inversores y créditos).
        </p>
      </div>

      <form action={formAction} className="space-y-5 bg-surface border border-border rounded-xl p-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-fg uppercase tracking-wide">Identificación</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Razón social" name="razon_social" defaultValue={empresa.razon_social} required placeholder="Ej: Areben SRL" />
            <Input label="Nombre de fantasía" name="nombre_fantasia" defaultValue={empresa.nombre_fantasia ?? ''} placeholder="Ej: Areben" />
            <Input label="CUIT" name="cuit" defaultValue={empresa.cuit ?? ''} placeholder="XX-XXXXXXXX-X" />
            <Select
              label="Condición frente al IVA"
              name="condicion_iva"
              defaultValue={empresa.condicion_iva ?? 'Responsable Inscripto'}
              options={[
                { value: 'Responsable Inscripto', label: 'Responsable Inscripto' },
                { value: 'Monotributo', label: 'Monotributo' },
                { value: 'Exento', label: 'Exento' },
                { value: 'Consumidor Final', label: 'Consumidor Final' },
              ]}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-fg uppercase tracking-wide">Domicilio</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Calle y número" name="domicilio_calle" defaultValue={empresa.domicilio_calle ?? ''} placeholder="Ej: Av. Corrientes 1234, piso 5" />
            <Input label="Ciudad" name="domicilio_ciudad" defaultValue={empresa.domicilio_ciudad ?? ''} placeholder="Ej: Ciudad Autónoma de Buenos Aires" />
            <Input label="Provincia" name="domicilio_provincia" defaultValue={empresa.domicilio_provincia ?? ''} placeholder="Ej: CABA" />
            <Input label="Código postal" name="domicilio_cp" defaultValue={empresa.domicilio_cp ?? ''} placeholder="Ej: C1043AAZ" />
            <Input label="País" name="domicilio_pais" defaultValue={empresa.domicilio_pais ?? 'Argentina'} />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-fg uppercase tracking-wide">Contacto</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Email institucional" name="email" type="email" defaultValue={empresa.email ?? ''} placeholder="info@areben.com.ar" />
            <Input label="Teléfono" name="telefono" defaultValue={empresa.telefono ?? ''} placeholder="+54 11 1234-5678" />
            <Input label="Sitio web" name="sitio_web" defaultValue={empresa.sitio_web ?? ''} placeholder="www.areben.com.ar" />
          </div>
        </section>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}
        {savedOnce && !error && !isPending && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Cambios guardados.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Guardar cambios
          </Button>
        </div>
      </form>
    </div>
  )
}
