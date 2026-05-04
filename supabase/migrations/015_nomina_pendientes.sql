-- ============================================================
-- Migración 015: Integración Nómina ↔ Gastos pendientes
-- ============================================================

ALTER TABLE nomina_mensual
  ADD COLUMN IF NOT EXISTS fecha_programada_pago DATE,
  ADD COLUMN IF NOT EXISTS gasto_pendiente_id UUID REFERENCES gastos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nomina_gasto_pendiente ON nomina_mensual(gasto_pendiente_id);

-- Backfill: para nóminas existentes sin fecha_programada, usar el último día del mes
UPDATE nomina_mensual
SET fecha_programada_pago = (TO_DATE(mes || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day')::DATE
WHERE fecha_programada_pago IS NULL;
