import { createClient } from '@/lib/supabase/server'
import { EmpresaClient } from '@/components/settings/empresa-client'
import type { ConfiguracionEmpresa } from '@/types/database'

export default async function EmpresaPage() {
  const supabase = await createClient()
  const { data: empresa } = await supabase
    .from('configuracion_empresa')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  return <EmpresaClient empresa={(empresa as ConfiguracionEmpresa | null) ?? null} />
}
