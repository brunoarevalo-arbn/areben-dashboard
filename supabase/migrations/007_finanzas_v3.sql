-- ============================================================
-- Migración 007: Finanzas v3 — moneda dual, prorrateo settings, cuotas en compras
-- ============================================================

-- 1. Gastos recurrentes: moneda dual
ALTER TABLE gastos_recurrentes
  ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) NOT NULL DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS monto_secundario NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS moneda_secundaria VARCHAR(3);

-- 2. Gastos: moneda dual también
ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) NOT NULL DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS monto_secundario NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS moneda_secundaria VARCHAR(3),
  ADD COLUMN IF NOT EXISTS cuenta_origen_pago_id UUID REFERENCES cuentas_bancarias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cuotas_total INTEGER DEFAULT 1;

-- 3. Compras: cuotas y tarjeta (ya existe tarjeta_id en gastos, agregar a compras)
ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS tarjeta_id UUID REFERENCES tarjetas_credito(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cuotas_total INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cuenta_origen_pago_id UUID REFERENCES cuentas_bancarias(id) ON DELETE SET NULL;

-- 4. Tabla configuracion_prorrateo (renombrada/separada de prorrateos_default)
-- Mantenemos prorrateos_default para presets nombrados; configuracion_prorrateo es el "valor actual" único
CREATE TABLE IF NOT EXISTS configuracion_prorrateo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marca VARCHAR(50) NOT NULL UNIQUE,
  porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO configuracion_prorrateo (marca, porcentaje, orden) VALUES
  ('BDI', 33.33, 1),
  ('ZATTIA', 33.33, 2),
  ('STUNNED', 33.34, 3)
ON CONFLICT (marca) DO NOTHING;

ALTER TABLE configuracion_prorrateo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON configuracion_prorrateo;
CREATE POLICY "authenticated_all" ON configuracion_prorrateo FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_configuracion_prorrateo_updated_at ON configuracion_prorrateo;
CREATE TRIGGER update_configuracion_prorrateo_updated_at BEFORE UPDATE ON configuracion_prorrateo
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Tipos IVA configurables
CREATE TABLE IF NOT EXISTS tipos_iva (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(50) NOT NULL UNIQUE,
  porcentaje NUMERIC(5,2) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tipos_iva (nombre, porcentaje, orden) VALUES
  ('21%', 21, 1),
  ('10.5%', 10.5, 2),
  ('27%', 27, 3),
  ('Exento', 0, 4)
ON CONFLICT (nombre) DO NOTHING;

ALTER TABLE tipos_iva ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON tipos_iva;
CREATE POLICY "authenticated_all" ON tipos_iva FOR ALL TO authenticated USING (true) WITH CHECK (true);
