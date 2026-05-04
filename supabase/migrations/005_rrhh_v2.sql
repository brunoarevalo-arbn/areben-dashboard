-- ============================================================
-- AREBEN DASHBOARD - Migración 005: RRHH Round 2
-- ============================================================

-- 1. Empleados: comidas y presentismo (acuerdo)
ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS monto_comidas NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS presentismo_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

-- 2. Registro de horas extras por empleado y fecha
CREATE TABLE IF NOT EXISTS horas_extras_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  cantidad NUMERIC(6,2) NOT NULL CHECK (cantidad > 0),
  porcentaje NUMERIC(5,2) NOT NULL DEFAULT 50,
  notas TEXT,
  incluido_en_nomina_id UUID REFERENCES nomina_mensual(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_horas_extras_empleado ON horas_extras_registros(empleado_id);
CREATE INDEX IF NOT EXISTS idx_horas_extras_fecha ON horas_extras_registros(fecha);

ALTER TABLE horas_extras_registros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON horas_extras_registros;
CREATE POLICY "authenticated_all" ON horas_extras_registros FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Nómina: provisión aguinaldo + presentismo + asistencia
ALTER TABLE nomina_mensual
  ADD COLUMN IF NOT EXISTS aguinaldo_provisionado NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS asistencia_completa BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS presentismo_monto NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aguinaldo_pagado_de_caja NUMERIC(15,2) NOT NULL DEFAULT 0;

-- 4. Backfill valor_hora para empleados que tienen 0 (incluye negros viejos)
UPDATE empleados
SET valor_hora = ROUND(sueldo_basico / NULLIF(horas_mensuales, 0), 2)
WHERE valor_hora = 0 AND sueldo_basico > 0 AND horas_mensuales > 0;
