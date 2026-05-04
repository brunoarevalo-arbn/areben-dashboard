-- ============================================================
-- Migración 018: Retiros con tarjeta y cierre/conversión USD
-- ============================================================
-- 1) Soporte de retiros con tarjeta de crédito (genera cuotas_tarjeta).
-- 2) Cierre de retiros: timestamp de conversión ARS→USD a fin de mes.

ALTER TABLE retiros_socios
  ADD COLUMN IF NOT EXISTS medio_pago VARCHAR(30) DEFAULT 'TRANSFERENCIA',
  ADD COLUMN IF NOT EXISTS tarjeta_id UUID REFERENCES tarjetas_credito(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cuotas_total INTEGER,
  ADD COLUMN IF NOT EXISTS convertido_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tc_cierre NUMERIC(14, 4);

CREATE INDEX IF NOT EXISTS idx_retiros_socios_tarjeta ON retiros_socios(tarjeta_id);
CREATE INDEX IF NOT EXISTS idx_retiros_socios_mes ON retiros_socios(mes);

NOTIFY pgrst, 'reload schema';
