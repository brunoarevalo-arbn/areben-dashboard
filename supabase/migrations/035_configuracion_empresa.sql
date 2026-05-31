-- ============================================================
-- Migración 035: Tabla configuracion_empresa (singleton)
-- ============================================================
-- Una sola fila con los datos formales de la empresa para encabezados
-- de comprobantes formales, reportes externos, etc.
-- El CHECK (id = 1) garantiza una única fila a nivel DB.
-- ============================================================

CREATE TABLE IF NOT EXISTS configuracion_empresa (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  razon_social VARCHAR(200) NOT NULL,
  nombre_fantasia VARCHAR(200),
  cuit VARCHAR(20),
  condicion_iva VARCHAR(50),
  domicilio_calle VARCHAR(200),
  domicilio_ciudad VARCHAR(100),
  domicilio_provincia VARCHAR(100),
  domicilio_cp VARCHAR(20),
  domicilio_pais VARCHAR(100) DEFAULT 'Argentina',
  email VARCHAR(200),
  telefono VARCHAR(50),
  sitio_web VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE configuracion_empresa IS 'Singleton: única fila (id=1) con datos formales de la empresa.';

-- Seed con placeholders editables
INSERT INTO configuracion_empresa (id, razon_social, nombre_fantasia, condicion_iva, domicilio_pais)
VALUES (1, 'Areben SRL', 'Areben', 'Responsable Inscripto', 'Argentina')
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE configuracion_empresa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON configuracion_empresa;
CREATE POLICY "authenticated_all" ON configuracion_empresa FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at (reutiliza función ya existente)
DROP TRIGGER IF EXISTS update_configuracion_empresa_updated_at ON configuracion_empresa;
CREATE TRIGGER update_configuracion_empresa_updated_at BEFORE UPDATE ON configuracion_empresa
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
