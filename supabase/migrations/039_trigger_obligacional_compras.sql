-- Trigger actualizar_saldo_compra: lógica obligacional
--
-- Antes: sumaba TODOS los pagos sin distinguir acreditados, marcando PAGADO
-- toda compra con pagos programados aunque no se hubieran efectivizado.
--
-- Ahora: un pago cuenta como hecho si (a) está acreditado, O (b) es cheque/echeq
-- (la obligación con el proveedor pasó al banco al emitirlo). Los pagos CC sin
-- acreditar siguen siendo deuda viva con el proveedor → la compra queda PENDIENTE.
--
-- También: cuando el saldo vuelve a ser > 0 (ej. se desacredita un pago, se borra),
-- el estado vuelve a PENDIENTE; antes solo bajaba a PAGADO, nunca subía.

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
    AND (acreditado = true OR instrumento IN ('CHEQUE_FISICO', 'ECHEQ'));

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

-- Recalcular todas las compras existentes con la nueva lógica
WITH saldos AS (
  SELECT
    c.id,
    GREATEST(c.monto_total - COALESCE((
      SELECT SUM(monto) FROM pagos
      WHERE compra_id = c.id
        AND (acreditado = true OR instrumento IN ('CHEQUE_FISICO', 'ECHEQ'))
    ), 0), 0) AS nuevo_saldo
  FROM compras c
)
UPDATE compras c
SET
  saldo_pendiente = s.nuevo_saldo,
  estado = CASE WHEN s.nuevo_saldo <= 0 THEN 'PAGADO'::estado_gasto ELSE 'PENDIENTE'::estado_gasto END,
  updated_at = NOW()
FROM saldos s
WHERE c.id = s.id
  AND (c.saldo_pendiente != s.nuevo_saldo
       OR (s.nuevo_saldo > 0 AND c.estado = 'PAGADO')
       OR (s.nuevo_saldo <= 0 AND c.estado != 'PAGADO'));
