-- ============================================================
-- Migración 042: aguinaldo pagado directo (sin caja)
-- ============================================================
-- Para pagar el aguinaldo de un mes SIN provenir de la caja acumulada
-- (caso típico: SAC de junio cuando nunca se provisionó la caja).
-- Suma al neto de la nómina (genera el gasto del mes) y aparece como
-- concepto propio en el recibo, pero NO toca aguinaldo_pagado_de_caja
-- (la caja queda limpia para el modelo de provisión que arranca en julio).

ALTER TABLE nomina_mensual
  ADD COLUMN IF NOT EXISTS aguinaldo_directo NUMERIC(15,2) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
