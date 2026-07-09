-- ============================================================
-- Migración 044: Estado "listo" por sector y mes
-- ============================================================
-- Marca manual de completitud: registra que un sector (ej. saldos impositivos)
-- ya se cargó/actualizó para un mes dado, con quién y cuándo. Genérica y
-- extensible: una fila por (mes, sector). El catálogo de sectores vive en
-- lib/sectores.ts (no en la DB), igual que la navegación del sidebar.
-- ============================================================

CREATE TABLE IF NOT EXISTS estado_sector_mes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes          VARCHAR(7)  NOT NULL,                      -- 'YYYY-MM'
  sector       VARCHAR(50) NOT NULL,                      -- key del catálogo (ej. 'saldos-impositivos')
  listo        BOOLEAN     NOT NULL DEFAULT TRUE,
  marcado_por  VARCHAR(100),                              -- email de quien marcó (patrón datos_ventas_gn)
  marcado_at   TIMESTAMPTZ,
  notas        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mes, sector)
);

COMMENT ON TABLE estado_sector_mes IS 'Marca manual de "listo" por sector y mes. Una fila por (mes, sector); listo=true significa que ese sector ya se completó ese mes. marcado_por/marcado_at registran autoría.';

CREATE INDEX IF NOT EXISTS idx_estado_sector_mes_mes ON estado_sector_mes(mes);

-- RLS
ALTER TABLE estado_sector_mes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON estado_sector_mes;
CREATE POLICY "authenticated_all" ON estado_sector_mes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_estado_sector_mes_updated_at ON estado_sector_mes;
CREATE TRIGGER update_estado_sector_mes_updated_at BEFORE UPDATE ON estado_sector_mes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
