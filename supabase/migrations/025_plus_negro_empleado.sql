-- ============================================================
-- Migración 025: Plus salarial fijo en negro por empleado
-- ============================================================
-- Distinto del acuerdo de horas en negro (horas_acuerdo_negro):
-- es un plus salarial fijo, mensual, que se le paga por encima del recibo oficial.
-- Puede ser un MONTO fijo o un PORCENTAJE sobre el monto del recibo oficial.
-- También suma a la base del aguinaldo.

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS plus_negro_tipo VARCHAR(15)
    CHECK (plus_negro_tipo IS NULL OR plus_negro_tipo IN ('MONTO', 'PORCENTAJE')),
  ADD COLUMN IF NOT EXISTS plus_negro_valor NUMERIC(14, 2) DEFAULT 0;

COMMENT ON COLUMN empleados.plus_negro_tipo IS
  'Tipo del plus salarial fijo en negro: MONTO ($X mensual) o PORCENTAJE (% sobre recibo oficial). NULL si no hay plus.';
COMMENT ON COLUMN empleados.plus_negro_valor IS
  'Si plus_negro_tipo=MONTO: pesos mensuales. Si PORCENTAJE: % del monto_recibo_oficial.';

NOTIFY pgrst, 'reload schema';
