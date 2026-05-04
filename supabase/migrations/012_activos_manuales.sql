-- ============================================================
-- Migración 012: Activos manuales (no bancarios)
-- ============================================================

CREATE TABLE IF NOT EXISTS activos_manuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes VARCHAR(7) NOT NULL,
  descripcion VARCHAR(255) NOT NULL,
  categoria VARCHAR(100),
  monto NUMERIC(15,2) NOT NULL DEFAULT 0,
  moneda VARCHAR(3) NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS','USD')),
  titular_id UUID REFERENCES cuentas_titulares(id) ON DELETE SET NULL,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activos_manuales_mes ON activos_manuales(mes);

ALTER TABLE activos_manuales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON activos_manuales;
CREATE POLICY "authenticated_all" ON activos_manuales FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_activos_manuales_updated_at ON activos_manuales;
CREATE TRIGGER update_activos_manuales_updated_at BEFORE UPDATE ON activos_manuales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
