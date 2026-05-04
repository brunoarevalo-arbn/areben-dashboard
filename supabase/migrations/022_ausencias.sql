-- ============================================================
-- Migración 022: Ausencias / Faltas con descuento de nómina
-- ============================================================
-- Replica el patrón de horas_extras_registros pero para descuentos.
-- Cuando se genera la nómina del mes, las ausencias del mes se descuentan
-- del subtotal y quedan marcadas con `incluido_en_nomina_id` para no aplicarlas dos veces.

CREATE TABLE IF NOT EXISTS ausencias_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  dias NUMERIC(4, 2) NOT NULL DEFAULT 1 CHECK (dias > 0 AND dias <= 31),
  tipo VARCHAR(30) NOT NULL DEFAULT 'FALTA'
    CHECK (tipo IN ('FALTA', 'LICENCIA_NO_PAGA', 'SIN_AVISO', 'JUSTIFICADA', 'OTRO')),
  justificada BOOLEAN NOT NULL DEFAULT false,
  monto_descuento NUMERIC(14, 2) NOT NULL CHECK (monto_descuento >= 0),
  notas TEXT,
  incluido_en_nomina_id UUID REFERENCES nomina_mensual(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ausencias_empleado ON ausencias_registros(empleado_id);
CREATE INDEX IF NOT EXISTS idx_ausencias_fecha ON ausencias_registros(fecha);
CREATE INDEX IF NOT EXISTS idx_ausencias_pendientes
  ON ausencias_registros(empleado_id, fecha)
  WHERE incluido_en_nomina_id IS NULL;

ALTER TABLE ausencias_registros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON ausencias_registros;
CREATE POLICY "authenticated_all" ON ausencias_registros FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_ausencias_updated_at ON ausencias_registros;
CREATE TRIGGER trg_ausencias_updated_at
  BEFORE UPDATE ON ausencias_registros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Total descontado por ausencias en cada nómina (para mostrar en recibo)
ALTER TABLE nomina_mensual ADD COLUMN IF NOT EXISTS ausencias_descuento NUMERIC(14, 2) DEFAULT 0;
ALTER TABLE nomina_mensual ADD COLUMN IF NOT EXISTS ausencias_dias NUMERIC(4, 2) DEFAULT 0;

NOTIFY pgrst, 'reload schema';
