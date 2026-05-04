-- ============================================================================
-- Migración 030: fecha_vencimiento en cuotas_tarjeta + retroactivo
-- ============================================================================
-- Hasta ahora cuotas_tarjeta sólo tenía mes_vencimiento (YYYY-MM). Para poder
-- liquidar el resumen de un mes con una sola transacción del banco, necesitamos
-- una fecha exacta (DATE) por cuota. Se calcula con el dia_vencimiento de la
-- tarjeta acotado al último día del mes objetivo.
-- ============================================================================

ALTER TABLE cuotas_tarjeta
  ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;

-- Backfill: mes_vencimiento + tarjeta.dia_vencimiento (acotado al último día)
WITH tarj AS (
  SELECT id, dia_vencimiento FROM tarjetas_credito
)
UPDATE cuotas_tarjeta ct
SET fecha_vencimiento = (
  -- mes_vencimiento es 'YYYY-MM' → primer día del mes
  -- + dia_vencimiento - 1 días, acotado por LEAST al último día del mes
  LEAST(
    (ct.mes_vencimiento || '-01')::date
      + (LEAST(t.dia_vencimiento, 28) - 1) * INTERVAL '1 day',
    -- Último día del mes
    ((ct.mes_vencimiento || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day')::date
  )::date
)
FROM tarj t
WHERE ct.tarjeta_id = t.id
  AND ct.fecha_vencimiento IS NULL;

-- Para tarjetas con dia_vencimiento > 28 (29-31), recalcular usando el día real
UPDATE cuotas_tarjeta ct
SET fecha_vencimiento = (
  LEAST(
    (ct.mes_vencimiento || '-01')::date + (t.dia_vencimiento - 1) * INTERVAL '1 day',
    ((ct.mes_vencimiento || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day')::date
  )::date
)
FROM tarjetas_credito t
WHERE ct.tarjeta_id = t.id
  AND t.dia_vencimiento > 28;

-- Índice para consultas por fecha (próximas a vencer / liquidar resumen del mes)
CREATE INDEX IF NOT EXISTS idx_cuotas_fecha_venc ON cuotas_tarjeta(fecha_vencimiento);
