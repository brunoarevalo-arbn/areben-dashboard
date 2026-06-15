-- ============================================================
-- Migración 038: Tabla socios + FK en retiros_socios
-- ============================================================
-- Modela formalmente la sociedad de Areben (Bruno + Darío, 50/50) y
-- vincula los retiros existentes a un socio_id (en vez de un string libre,
-- que era frágil — typos generaban "socios" duplicados).
--
-- Base para construir la vista "Cuenta corriente del socio".
-- ============================================================

-- 1. Tabla socios
CREATE TABLE IF NOT EXISTS socios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL UNIQUE,
  alias VARCHAR(50),                                  -- ej. "Bruno" para mensajes cortos
  porcentaje_participacion NUMERIC(5,2) NOT NULL DEFAULT 0,
  dni VARCHAR(20),
  cuit VARCHAR(20),
  email VARCHAR(200),
  telefono VARCHAR(50),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (porcentaje_participacion >= 0 AND porcentaje_participacion <= 100)
);

COMMENT ON TABLE socios IS 'Socios de Areben SRL. Cada socio tiene una cuenta corriente con la empresa cuyo saldo deudor crece con los retiros y baja con aportes/sueldos/dividendos.';

-- 2. Seed inicial — Bruno y Darío, 50/50
INSERT INTO socios (nombre, alias, porcentaje_participacion, activo) VALUES
  ('Bruno Arévalo', 'Bruno', 50.00, true),
  ('Darío Arévalo', 'Darío', 50.00, true)
ON CONFLICT (nombre) DO NOTHING;

-- 3. Agregar FK opcional a retiros_socios (nullable para no romper retiros viejos sin match)
ALTER TABLE retiros_socios
  ADD COLUMN IF NOT EXISTS socio_id UUID REFERENCES socios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_retiros_socio_id ON retiros_socios(socio_id);

COMMENT ON COLUMN retiros_socios.socio_id IS 'FK a socios. El campo `socio` (string) queda como respaldo histórico hasta que se borre en una migración futura.';

-- 4. Migrar retiros existentes: matchear por nombre exacto.
-- Variantes con acentos / casing distintos quedan sin matchear y se podrán reasignar manualmente desde la app.
UPDATE retiros_socios r
SET socio_id = s.id
FROM socios s
WHERE r.socio = s.nombre AND r.socio_id IS NULL;

-- También matchear por alias y variantes comunes sin tilde
UPDATE retiros_socios r
SET socio_id = (SELECT id FROM socios WHERE alias = 'Bruno')
WHERE r.socio_id IS NULL AND LOWER(REPLACE(r.socio, 'á', 'a')) IN ('bruno', 'bruno arevalo', 'bruno arévalo');

UPDATE retiros_socios r
SET socio_id = (SELECT id FROM socios WHERE alias = 'Darío')
WHERE r.socio_id IS NULL AND LOWER(REPLACE(REPLACE(r.socio, 'í', 'i'), 'í', 'i')) IN ('dario', 'dario arevalo', 'darío arevalo');

-- 5. RLS
ALTER TABLE socios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON socios;
CREATE POLICY "authenticated_all" ON socios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Trigger updated_at
DROP TRIGGER IF EXISTS update_socios_updated_at ON socios;
CREATE TRIGGER update_socios_updated_at BEFORE UPDATE ON socios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
