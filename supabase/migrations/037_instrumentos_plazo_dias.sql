-- ============================================================
-- Migración 037: Plazo del instrumento en días
-- ============================================================
-- Habilita la proyección de rendimiento a vencimiento en el PDF.
-- ============================================================

ALTER TABLE instrumentos_inversion
  ADD COLUMN IF NOT EXISTS plazo_dias INTEGER CHECK (plazo_dias IS NULL OR plazo_dias > 0);

COMMENT ON COLUMN instrumentos_inversion.plazo_dias IS 'Plazo del instrumento en días (típicamente 30/60/90/180/270/365). NULL si es a plazo indeterminado.';

NOTIFY pgrst, 'reload schema';
