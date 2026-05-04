-- ============================================================
-- Migración 023: Ausencias simplificadas (horas en lugar de días)
-- ============================================================
-- Cambio de modelo: las ausencias se cargan directamente al generar la nómina
-- como cantidad de horas faltadas. La tabla ausencias_registros queda como
-- historial pasivo (no afecta más el cálculo automático).

ALTER TABLE nomina_mensual ADD COLUMN IF NOT EXISTS ausencias_horas NUMERIC(6, 2) DEFAULT 0;
ALTER TABLE nomina_mensual ADD COLUMN IF NOT EXISTS ausencias_motivo TEXT;

-- Migrar datos existentes: si ausencias_dias > 0, convertir a horas (× 8)
UPDATE nomina_mensual
SET ausencias_horas = COALESCE(ausencias_dias, 0) * 8
WHERE ausencias_horas IS NULL OR ausencias_horas = 0;

NOTIFY pgrst, 'reload schema';
