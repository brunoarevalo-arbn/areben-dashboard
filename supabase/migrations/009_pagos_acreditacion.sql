-- ============================================================
-- Migración 009: Acreditación de cheques
-- ============================================================

ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS acreditado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_acreditacion DATE;

CREATE INDEX IF NOT EXISTS idx_pagos_acreditado ON pagos(acreditado);
