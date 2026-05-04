-- ============================================================
-- Migración 019: Pagos polimórfico unificado
-- ============================================================
-- Convierte la tabla pagos en el ledger único de salidas:
-- COMPRA / GASTO / NOMINA / CUOTA / LIBRE.
-- Migra pagos_parciales_nomina dentro de pagos y la elimina.

-- 1) Columnas nuevas
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS origen_id UUID,
  ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES cuentas_bancarias(id) ON DELETE SET NULL;

-- 2) Backfill origen_id desde compra_id para los pagos existentes
UPDATE pagos SET origen_id = compra_id WHERE tipo_origen = 'COMPRA' AND origen_id IS NULL;

-- 3) Restringir tipo_origen a los valores soportados
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_tipo_origen_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_tipo_origen_check
  CHECK (tipo_origen IN ('COMPRA', 'GASTO', 'NOMINA', 'CUOTA', 'LIBRE'));

-- 4) Migrar pagos_parciales_nomina a pagos (si la tabla aún existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pagos_parciales_nomina') THEN
    INSERT INTO pagos (
      tipo_origen, origen_id, monto, moneda, fecha_emision, condicion_pago, instrumento,
      cuenta_id, notas, acreditado, fecha_acreditacion
    )
    SELECT
      'NOMINA',
      nomina_id,
      monto,
      moneda::moneda,
      fecha,
      'CONTADO',
      CASE
        WHEN medio_pago = 'TRANSFERENCIA' THEN 'TRANSFERENCIA'
        WHEN medio_pago = 'EFECTIVO' THEN 'EFECTIVO'
        WHEN medio_pago = 'CTA_CORRIENTE' THEN 'CUENTA_CORRIENTE'
        WHEN medio_pago = 'CHEQUE' THEN 'CHEQUE_FISICO'
        ELSE 'TRANSFERENCIA'
      END,
      cuenta_id,
      notas,
      TRUE,
      fecha
    FROM pagos_parciales_nomina;
    DROP TABLE pagos_parciales_nomina;
  END IF;
END $$;

-- 5) Índice compuesto para queries por origen
CREATE INDEX IF NOT EXISTS idx_pagos_origen ON pagos(tipo_origen, origen_id);

NOTIFY pgrst, 'reload schema';
