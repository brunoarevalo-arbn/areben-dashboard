-- ============================================================
-- Migración 061: Retiros programados (pendiente contra "retiro")
-- ============================================================
-- Permite programar un retiro de socio a futuro: aparece en Pendientes como su
-- propio tipo, y NO impacta la cuenta particular / cierre / PN hasta efectivizarse.
-- Los históricos quedan como PAGADO (default) → siguen contando igual que antes.

ALTER TABLE retiros_socios
  ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'PAGADO'
    CHECK (estado IN ('PROGRAMADO', 'PAGADO')),
  ADD COLUMN IF NOT EXISTS fecha_programada DATE;

CREATE INDEX IF NOT EXISTS idx_retiros_estado ON retiros_socios(estado);
