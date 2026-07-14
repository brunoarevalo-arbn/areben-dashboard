-- ============================================================================
-- Migración 059: rename acreditado→debitado en el ledger de EGRESOS (pagos)
-- ============================================================================
-- Semántica: `pagos` es el ledger de EGRESOS (pagos que HACE la empresa: cheques
-- emitidos, transferencias salientes, etc.). Cuando un pago se efectiviza SALE
-- plata de la cuenta → para nosotros es un DÉBITO, no un crédito. Los nombres
-- viejos (acreditado / fecha_acreditacion) estaban semánticamente mal.
--
-- Renombra las columnas, los índices asociados, actualiza los COMMENT y recrea
-- la función del trigger obligacional (mig 039), cuyo cuerpo plpgsql NO se
-- reescribe solo al renombrar la columna.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'pagos' AND column_name = 'acreditado') THEN
    ALTER TABLE pagos RENAME COLUMN acreditado TO debitado;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'pagos' AND column_name = 'fecha_acreditacion') THEN
    ALTER TABLE pagos RENAME COLUMN fecha_acreditacion TO fecha_debito;
  END IF;
END $$;

COMMENT ON COLUMN pagos.debitado IS
  'Ledger de EGRESOS: true = el pago se efectivizó y SALIÓ plata de la cuenta (débito). false = programado/pendiente (cheque a vencer, cta cte no efectivizada).';
COMMENT ON COLUMN pagos.fecha_debito IS
  'Fecha en que el pago debitó (salió de la cuenta). NULL mientras esté pendiente de débito.';

ALTER INDEX IF EXISTS idx_pagos_acreditado RENAME TO idx_pagos_debitado;
ALTER INDEX IF EXISTS idx_pagos_fecha_acreditacion RENAME TO idx_pagos_fecha_debito;

-- Recrear la función del trigger obligacional (mig 039): el cuerpo plpgsql NO se
-- reescribe al renombrar la columna, así que hay que redefinirla con 'debitado'.
CREATE OR REPLACE FUNCTION actualizar_saldo_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_compra_id UUID;
  v_monto_total NUMERIC(15,2);
  v_pagado NUMERIC(15,2);
  v_saldo NUMERIC(15,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_compra_id := OLD.compra_id;
  ELSE
    v_compra_id := NEW.compra_id;
  END IF;

  IF v_compra_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT monto_total INTO v_monto_total FROM compras WHERE id = v_compra_id;

  SELECT COALESCE(SUM(monto), 0) INTO v_pagado
  FROM pagos
  WHERE compra_id = v_compra_id
    AND (debitado = true OR instrumento IN ('CHEQUE_FISICO', 'ECHEQ'));

  v_saldo := GREATEST(v_monto_total - v_pagado, 0);

  UPDATE compras
  SET
    saldo_pendiente = v_saldo,
    estado = CASE
      WHEN v_saldo <= 0 THEN 'PAGADO'::estado_gasto
      ELSE 'PENDIENTE'::estado_gasto
    END,
    updated_at = NOW()
  WHERE id = v_compra_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
