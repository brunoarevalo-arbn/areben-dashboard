-- ============================================================
-- Migración 045: Cuentas de Gestión Nube (multi-cuenta)
-- ============================================================
-- Areben tiene DOS cuentas de Gestión Nube:
--   - BDI          → marca BDI
--   - ZATTIA       → marcas ZATTIA y STUNNED (STUNNED se separa por `provider`
--                    del producto: si el proveedor es STUNNED → marca STUNNED,
--                    si no → ZATTIA).
-- Los SECRETS (tokens Bearer) NO viven acá: van en env vars por alias
-- (GN_TOKEN_BDI, GN_TOKEN_ZATTIA), porque RLS es authenticated_all y no
-- queremos exponer credenciales a cualquier usuario logueado. Esta tabla solo
-- guarda metadatos: alias, marcas que cubre, estado del último test.
-- ============================================================

CREATE TABLE IF NOT EXISTS cuentas_gn (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias              VARCHAR(50)  NOT NULL UNIQUE,          -- coincide con env GN_TOKEN_<ALIAS>
  nombre             VARCHAR(150),
  marcas             TEXT[]       NOT NULL DEFAULT '{}',    -- marcas que cubre esta cuenta
  activo             BOOLEAN      NOT NULL DEFAULT TRUE,
  estado             VARCHAR(20)  NOT NULL DEFAULT 'NO_CONFIGURADO', -- NO_CONFIGURADO | OK | ERROR
  fecha_ultimo_test  TIMESTAMPTZ,
  notas              TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cuentas_gn IS 'Cuentas de Gestión Nube. Token en env var GN_TOKEN_<alias> (no en la DB). marcas[] define qué marcas cubre; la cuenta ZATTIA cubre ZATTIA y STUNNED (STUNNED se separa por provider).';

-- Seed de las dos cuentas conocidas
INSERT INTO cuentas_gn (alias, nombre, marcas) VALUES
  ('BDI',    'BDI',              ARRAY['BDI']),
  ('ZATTIA', 'ZATTIA + STUNNED', ARRAY['ZATTIA','STUNNED'])
ON CONFLICT (alias) DO NOTHING;

-- RLS
ALTER TABLE cuentas_gn ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON cuentas_gn;
CREATE POLICY "authenticated_all" ON cuentas_gn FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_cuentas_gn_updated_at ON cuentas_gn;
CREATE TRIGGER update_cuentas_gn_updated_at BEFORE UPDATE ON cuentas_gn
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
