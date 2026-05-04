-- ============================================================
-- AREBEN DASHBOARD - Migración 004: Reestructuración Finanzas
-- ============================================================

-- 1. Titulares de cuentas
CREATE TABLE IF NOT EXISTS cuentas_titulares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL UNIQUE,
  tipo VARCHAR(50) NOT NULL DEFAULT 'EMPRESA',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Cuentas bancarias / financieras
CREATE TABLE IF NOT EXISTS cuentas_bancarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id UUID NOT NULL REFERENCES cuentas_titulares(id) ON DELETE RESTRICT,
  nombre VARCHAR(100) NOT NULL,
  banco VARCHAR(100) NOT NULL,
  tipo VARCHAR(50) NOT NULL DEFAULT 'BANCO',
  permite_dual BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cuentas_titular ON cuentas_bancarias(titular_id);

-- 3. Saldos por cuenta y mes
CREATE TABLE IF NOT EXISTS saldos_cuentas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id UUID NOT NULL REFERENCES cuentas_bancarias(id) ON DELETE CASCADE,
  mes VARCHAR(7) NOT NULL,
  saldo_ars NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  cerrado BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_cierre TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cuenta_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_saldos_cuentas_mes ON saldos_cuentas(mes);

-- 4. Tipo de cambio mensual de referencia
CREATE TABLE IF NOT EXISTS tipos_cambio_mes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes VARCHAR(7) NOT NULL UNIQUE,
  tipo_cambio NUMERIC(15,4) NOT NULL,
  fuente VARCHAR(100),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Configuración prorrateo default
CREATE TABLE IF NOT EXISTS prorrateos_default (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL UNIQUE,
  porcentajes JSONB NOT NULL DEFAULT '{}'::jsonb,
  es_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO prorrateos_default (nombre, porcentajes, es_default)
VALUES ('Default 3 marcas', '{"BDI": 33.33, "ZATTIA": 33.33, "STUNNED": 33.34}'::jsonb, TRUE)
ON CONFLICT (nombre) DO NOTHING;

-- 6. Tarjetas de crédito
CREATE TABLE IF NOT EXISTS tarjetas_credito (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id UUID REFERENCES cuentas_titulares(id) ON DELETE RESTRICT,
  nombre VARCHAR(100) NOT NULL,
  banco VARCHAR(100) NOT NULL,
  tipo VARCHAR(50) NOT NULL DEFAULT 'CREDITO',
  ultimos_4 VARCHAR(4),
  dia_cierre INTEGER NOT NULL,
  dia_vencimiento INTEGER NOT NULL,
  limite_ars NUMERIC(15,2),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Gastos recurrentes (configuración)
CREATE TABLE IF NOT EXISTS gastos_recurrentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto VARCHAR(255) NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  monto_estimado NUMERIC(15,2) NOT NULL,
  iva_incluido BOOLEAN NOT NULL DEFAULT TRUE,
  porcentaje_iva NUMERIC(5,2) NOT NULL DEFAULT 21,
  medio_pago VARCHAR(50) NOT NULL DEFAULT 'TRANSFERENCIA',
  cuenta_id UUID REFERENCES cuentas_bancarias(id) ON DELETE SET NULL,
  tarjeta_id UUID REFERENCES tarjetas_credito(id) ON DELETE SET NULL,
  dia_vencimiento INTEGER,
  tipo_mes VARCHAR(20) NOT NULL DEFAULT 'CORRIENTE',
  prorrateo JSONB,
  detalles JSONB,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Extensión de tabla gastos
ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS recurrente_id UUID REFERENCES gastos_recurrentes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS iva_incluido BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS porcentaje_iva NUMERIC(5,2) NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS monto_neto NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prorrateo JSONB,
  ADD COLUMN IF NOT EXISTS medio_pago VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES cuentas_bancarias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tarjeta_id UUID REFERENCES tarjetas_credito(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS detalles JSONB,
  ADD COLUMN IF NOT EXISTS confirmado BOOLEAN NOT NULL DEFAULT TRUE;

-- 9. Cuotas de tarjeta (pasivos proyectados)
CREATE TABLE IF NOT EXISTS cuotas_tarjeta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarjeta_id UUID NOT NULL REFERENCES tarjetas_credito(id) ON DELETE CASCADE,
  origen_tipo VARCHAR(50) NOT NULL,
  origen_id UUID,
  concepto VARCHAR(255) NOT NULL,
  monto_total NUMERIC(15,2) NOT NULL,
  cuotas_total INTEGER NOT NULL DEFAULT 1,
  cuota_numero INTEGER NOT NULL DEFAULT 1,
  monto_cuota NUMERIC(15,2) NOT NULL,
  mes_cierre VARCHAR(7) NOT NULL,
  mes_vencimiento VARCHAR(7) NOT NULL,
  pagada BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_pago DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cuotas_tarjeta ON cuotas_tarjeta(tarjeta_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_mes_venc ON cuotas_tarjeta(mes_vencimiento);

-- 10. Categorías de retiros
CREATE TABLE IF NOT EXISTS categorias_retiro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL UNIQUE,
  emoji VARCHAR(10),
  color VARCHAR(20) NOT NULL DEFAULT 'slate',
  orden INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categorias_retiro (nombre, emoji, color, orden) VALUES
  ('Alquiler', '🏠', 'amber', 1),
  ('Comidas', '🍕', 'orange', 2),
  ('Transporte', '🚗', 'blue', 3),
  ('Salud', '🏥', 'red', 4),
  ('Deporte', '🎾', 'green', 5),
  ('Educación', '📚', 'indigo', 6),
  ('Ocio', '🎮', 'purple', 7),
  ('Servicios', '⚡', 'amber', 8),
  ('Indumentaria', '👕', 'pink', 9),
  ('Otros', '💸', 'slate', 99)
ON CONFLICT (nombre) DO NOTHING;

-- 11. Extensión de retiros_socios
ALTER TABLE retiros_socios
  ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES categorias_retiro(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mes VARCHAR(7),
  ADD COLUMN IF NOT EXISTS monto_usd_calculado NUMERIC(15,2);

UPDATE retiros_socios SET mes = TO_CHAR(fecha, 'YYYY-MM') WHERE mes IS NULL;

-- 12. Titular default
INSERT INTO cuentas_titulares (nombre, tipo) VALUES ('Areben SRL', 'EMPRESA')
ON CONFLICT (nombre) DO NOTHING;

-- 13. RLS
ALTER TABLE cuentas_titulares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON cuentas_titulares;
CREATE POLICY "authenticated_all" ON cuentas_titulares FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE cuentas_bancarias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON cuentas_bancarias;
CREATE POLICY "authenticated_all" ON cuentas_bancarias FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE saldos_cuentas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON saldos_cuentas;
CREATE POLICY "authenticated_all" ON saldos_cuentas FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE tipos_cambio_mes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON tipos_cambio_mes;
CREATE POLICY "authenticated_all" ON tipos_cambio_mes FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE prorrateos_default ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON prorrateos_default;
CREATE POLICY "authenticated_all" ON prorrateos_default FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE gastos_recurrentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON gastos_recurrentes;
CREATE POLICY "authenticated_all" ON gastos_recurrentes FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE tarjetas_credito ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON tarjetas_credito;
CREATE POLICY "authenticated_all" ON tarjetas_credito FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE cuotas_tarjeta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON cuotas_tarjeta;
CREATE POLICY "authenticated_all" ON cuotas_tarjeta FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE categorias_retiro ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON categorias_retiro;
CREATE POLICY "authenticated_all" ON categorias_retiro FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_saldos_cuentas_updated_at ON saldos_cuentas;
CREATE TRIGGER update_saldos_cuentas_updated_at BEFORE UPDATE ON saldos_cuentas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
