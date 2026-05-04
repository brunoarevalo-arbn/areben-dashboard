-- ============================================================
-- Migración 024: Acuerdo en negro fijo por empleado
-- ============================================================
-- Para empleados BLANCO con un acuerdo de horas adicionales fijas en negro
-- (ej: turno blanco + 3 hs/día). Esas horas son parte del salario fijo
-- mensual y SUMAN al aguinaldo. Las horas extras reales son aparte.

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS horas_acuerdo_negro NUMERIC(6, 2) DEFAULT 0;

COMMENT ON COLUMN empleados.horas_acuerdo_negro IS
  'Horas mensuales fijas en negro acordadas con el empleado. Suman al aguinaldo. NO son horas extras.';

NOTIFY pgrst, 'reload schema';
