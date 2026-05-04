-- ============================================================
-- Migración 008: Inversiones de Terceros
-- ============================================================

-- 1. Inversores
CREATE TABLE IF NOT EXISTS inversores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(150) NOT NULL UNIQUE,
  tipo VARCHAR(20) NOT NULL DEFAULT 'persona_fisica' CHECK (tipo IN ('persona_fisica','empresa')),
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Instrumentos
CREATE TABLE IF NOT EXISTS instrumentos_inversion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inversor_id UUID NOT NULL REFERENCES inversores(id) ON DELETE CASCADE,
  codigo VARCHAR(50),
  moneda VARCHAR(3) NOT NULL CHECK (moneda IN ('USD','ARS')),
  capital_inicial NUMERIC(15,2) NOT NULL CHECK (capital_inicial > 0),
  tasa_mensual NUMERIC(10,6) NOT NULL CHECK (tasa_mensual >= 0),
  capitalizable BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','cerrado','renovado')),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instrumentos_inversor ON instrumentos_inversion(inversor_id);
CREATE INDEX IF NOT EXISTS idx_instrumentos_estado ON instrumentos_inversion(estado);
CREATE INDEX IF NOT EXISTS idx_instrumentos_moneda ON instrumentos_inversion(moneda);

-- 3. Periodos
CREATE TABLE IF NOT EXISTS periodos_instrumento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrumento_id UUID NOT NULL REFERENCES instrumentos_inversion(id) ON DELETE CASCADE,
  mes VARCHAR(7) NOT NULL,
  saldo_inicio NUMERIC(15,2) NOT NULL DEFAULT 0,
  interes_devengado NUMERIC(15,2) NOT NULL DEFAULT 0,
  int_inicio_prorrateado NUMERIC(15,2) NOT NULL DEFAULT 0,
  int_fin_prorrateado NUMERIC(15,2) NOT NULL DEFAULT 0,
  movimiento NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_cierre NUMERIC(15,2) NOT NULL DEFAULT 0,
  cerrado BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_cierre TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(instrumento_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_periodos_instrumento ON periodos_instrumento(instrumento_id);
CREATE INDEX IF NOT EXISTS idx_periodos_mes ON periodos_instrumento(mes);

-- 4. RLS
ALTER TABLE inversores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON inversores;
CREATE POLICY "authenticated_all" ON inversores FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE instrumentos_inversion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON instrumentos_inversion;
CREATE POLICY "authenticated_all" ON instrumentos_inversion FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE periodos_instrumento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON periodos_instrumento;
CREATE POLICY "authenticated_all" ON periodos_instrumento FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Triggers updated_at
DROP TRIGGER IF EXISTS update_inversores_updated_at ON inversores;
CREATE TRIGGER update_inversores_updated_at BEFORE UPDATE ON inversores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_instrumentos_updated_at ON instrumentos_inversion;
CREATE TRIGGER update_instrumentos_updated_at BEFORE UPDATE ON instrumentos_inversion
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_periodos_updated_at ON periodos_instrumento;
CREATE TRIGGER update_periodos_updated_at BEFORE UPDATE ON periodos_instrumento
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6. Seed
INSERT INTO inversores (nombre, tipo, notas) VALUES
  ('Fernando Blesio', 'persona_fisica', 'Inversor USD - capitalizable'),
  ('Javier Sequeira', 'persona_fisica', 'Inversor ARS - no capitalizable')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO instrumentos_inversion (inversor_id, codigo, moneda, capital_inicial, tasa_mensual, capitalizable, fecha_inicio)
SELECT id, 'INV-FB-001', 'USD', 10506.25, 0.025, TRUE, '2025-02-13'
FROM inversores WHERE nombre = 'Fernando Blesio'
ON CONFLICT DO NOTHING;

INSERT INTO instrumentos_inversion (inversor_id, codigo, moneda, capital_inicial, tasa_mensual, capitalizable, fecha_inicio)
SELECT id, 'INV-JS-001', 'ARS', 1500000.00, 0.04, FALSE, '2025-06-08'
FROM inversores WHERE nombre = 'Javier Sequeira'
ON CONFLICT DO NOTHING;
