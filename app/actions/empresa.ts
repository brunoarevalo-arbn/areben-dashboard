'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const empresaSchema = z.object({
  razon_social: z.string().min(1, 'La razón social es obligatoria'),
  nombre_fantasia: z.string().optional().nullable(),
  cuit: z.string().optional().nullable(),
  condicion_iva: z.string().optional().nullable(),
  domicilio_calle: z.string().optional().nullable(),
  domicilio_ciudad: z.string().optional().nullable(),
  domicilio_provincia: z.string().optional().nullable(),
  domicilio_cp: z.string().optional().nullable(),
  domicilio_pais: z.string().optional().nullable(),
  email: z.string().email('Email inválido').optional().or(z.literal('')).nullable(),
  telefono: z.string().optional().nullable(),
  sitio_web: z.string().optional().nullable(),
})

function emptyToNull(v: FormDataEntryValue | null): string | null {
  if (v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export async function updateConfiguracionEmpresa(_prev: string | null, fd: FormData): Promise<string | null> {
  await requireUser()
  const raw = {
    razon_social: emptyToNull(fd.get('razon_social')) ?? '',
    nombre_fantasia: emptyToNull(fd.get('nombre_fantasia')),
    cuit: emptyToNull(fd.get('cuit')),
    condicion_iva: emptyToNull(fd.get('condicion_iva')),
    domicilio_calle: emptyToNull(fd.get('domicilio_calle')),
    domicilio_ciudad: emptyToNull(fd.get('domicilio_ciudad')),
    domicilio_provincia: emptyToNull(fd.get('domicilio_provincia')),
    domicilio_cp: emptyToNull(fd.get('domicilio_cp')),
    domicilio_pais: emptyToNull(fd.get('domicilio_pais')),
    email: emptyToNull(fd.get('email')),
    telefono: emptyToNull(fd.get('telefono')),
    sitio_web: emptyToNull(fd.get('sitio_web')),
  }
  const result = empresaSchema.safeParse(raw)
  if (!result.success) return result.error.issues[0].message

  const supabase = await createClient()
  const { error } = await supabase
    .from('configuracion_empresa')
    .update(result.data)
    .eq('id', 1)
  if (error) return error.message

  revalidatePath('/settings/empresa')
  return null
}
