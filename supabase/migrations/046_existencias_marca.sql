-- ============================================================
-- Migración 046: Existencias (stock real) por marca y mes desde Gestión Nube
-- ============================================================
-- Stock real traído de GN (endpoint inventario/obtener → available_quantity).
-- Se guarda como DATO al lado del saldo contable de inventario (cuentas
-- patrimoniales tipo INVENTARIO); NO lo reemplaza. La transición a usar ambos
-- (contable + stock) es gradual. Una fila por (mes, marca).
-- ============================================================

CREATE TABLE IF NOT EXISTS existencias_marca (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes                   VARCHAR(7)  NOT NULL,                 -- 'YYYY-MM' (snapshot del mes)
  marca                 VARCHAR(20) NOT NULL,                 -- BDI | ZATTIA | STUNNED | GENERAL
  unidades              INTEGER     NOT NULL DEFAULT 0,       -- suma de available_quantity
  valuacion             NUMERIC(15,2) NOT NULL DEFAULT 0,     -- valuación si GN la expone (0 si no)
  cuenta_gn_id          UUID REFERENCES cuentas_gn(id) ON DELETE SET NULL,
  fecha_sincronizacion  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mes, marca)
);

COMMENT ON TABLE existencias_marca IS 'Stock real por marca/mes traído de Gestión Nube (inventario/obtener). Dato complementario al saldo contable de inventario, no lo reemplaza.';

CREATE INDEX IF NOT EXISTS idx_existencias_marca_mes ON existencias_marca(mes);

-- RLS
ALTER TABLE existencias_marca ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON existencias_marca;
CREATE POLICY "authenticated_all" ON existencias_marca FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_existencias_marca_updated_at ON existencias_marca;
CREATE TRIGGER update_existencias_marca_updated_at BEFORE UPDATE ON existencias_marca
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
