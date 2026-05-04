-- ============================================================
-- Migración 016: Gasto con fecha (día)
-- ============================================================

ALTER TABLE gastos ADD COLUMN IF NOT EXISTS fecha DATE;

-- Backfill: usar día 15 del mes para gastos existentes
UPDATE gastos SET fecha = (mes || '-15')::date WHERE fecha IS NULL;

-- Default a fecha de hoy + NOT NULL
ALTER TABLE gastos ALTER COLUMN fecha SET DEFAULT CURRENT_DATE;
ALTER TABLE gastos ALTER COLUMN fecha SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
