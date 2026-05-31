-- ============================================================
-- Migración 033: Catálogo de categorías y subcategorías de gastos
-- ============================================================
-- Introduce tablas de categorías/subcategorías para clasificar gastos
-- de forma estructurada (antes era texto libre en gastos.categoria).
--
-- IMPORTANTE: NO migramos los gastos existentes. La columna
-- gastos.categoria (string) se mantiene como está; los nuevos gastos
-- auto-generados (ej. desde cierre de períodos de inversión) usarán
-- subcategoria_id que se agrega en la migración 034.
-- ============================================================

-- 1. Categorías
CREATE TABLE IF NOT EXISTS gastos_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  orden INTEGER NOT NULL DEFAULT 0,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gastos_categorias_activa ON gastos_categorias(activa);

-- 2. Subcategorías
CREATE TABLE IF NOT EXISTS gastos_subcategorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID NOT NULL REFERENCES gastos_categorias(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  descripcion TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (categoria_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_gastos_subcategorias_categoria ON gastos_subcategorias(categoria_id);
CREATE INDEX IF NOT EXISTS idx_gastos_subcategorias_slug ON gastos_subcategorias(slug);
CREATE INDEX IF NOT EXISTS idx_gastos_subcategorias_activa ON gastos_subcategorias(activa);

-- 3. Seed inicial — categorías
INSERT INTO gastos_categorias (nombre, slug, orden) VALUES
  ('Gastos Financieros', 'gastos_financieros', 1),
  ('Alquiler',           'alquiler',           2),
  ('Servicios',          'servicios',          3),
  ('Impuestos',          'impuestos',          4),
  ('Sueldos y Cargas',   'sueldos_cargas',     5),
  ('Otros',              'otros',              99)
ON CONFLICT (slug) DO NOTHING;

-- 4. Seed inicial — subcategorías de Gastos Financieros
INSERT INTO gastos_subcategorias (categoria_id, nombre, slug, descripcion, orden)
SELECT id, 'Inversores Privados', 'inversores_privados', 'Interés pagado a inversores privados (personas físicas o empresas)', 1
  FROM gastos_categorias WHERE slug = 'gastos_financieros'
ON CONFLICT (categoria_id, slug) DO NOTHING;

INSERT INTO gastos_subcategorias (categoria_id, nombre, slug, descripcion, orden)
SELECT id, 'Créditos Bancarios', 'creditos_bancarios', 'Interés pagado a bancos por créditos tomados', 2
  FROM gastos_categorias WHERE slug = 'gastos_financieros'
ON CONFLICT (categoria_id, slug) DO NOTHING;

INSERT INTO gastos_subcategorias (categoria_id, nombre, slug, descripcion, orden)
SELECT id, 'Comisiones y Seguros', 'comisiones_seguros', 'Comisiones bancarias, seguros y otros gastos financieros', 3
  FROM gastos_categorias WHERE slug = 'gastos_financieros'
ON CONFLICT (categoria_id, slug) DO NOTHING;

-- 5. RLS
ALTER TABLE gastos_categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON gastos_categorias;
CREATE POLICY "authenticated_all" ON gastos_categorias FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE gastos_subcategorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON gastos_subcategorias;
CREATE POLICY "authenticated_all" ON gastos_subcategorias FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
