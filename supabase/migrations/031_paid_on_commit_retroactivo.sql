-- ============================================================================
-- Migración 031: paid-on-commit retroactivo para gastos existentes
-- ============================================================================
-- Modelo: cuando un gasto se paga con un instrumento que desplaza el
-- compromiso (TARJETA, CHEQUE_FISICO, ECHEQ, CUENTA_CORRIENTE), contra el
-- proveedor el gasto está saldado al momento de la operación. El compromiso
-- real es la cuota de tarjeta / el cheque / el saldo en cuenta corriente.
--
-- Esta migración crea retroactivamente los pagos en el ledger por el total
-- de gastos PENDIENTES con esos instrumentos que aún no tienen ningún pago,
-- y los marca como PAGADO. No afecta tesorería: los pagos quedan acreditado=false
-- (el dinero salió o saldrá cuando se acredite el cheque o se pague la cuota).
-- ============================================================================

-- 1. Crear los pagos faltantes en el ledger
INSERT INTO pagos (
  tipo_origen, origen_id, monto, moneda,
  fecha_emision, instrumento, cuenta_id,
  condicion_pago, acreditado, fecha_acreditacion, notas
)
SELECT
  'GASTO',
  g.id,
  g.monto,
  COALESCE(g.moneda::moneda, 'ARS'::moneda),
  COALESCE(g.fecha_pago, g.fecha),
  g.medio_pago,
  g.cuenta_id,
  'CONTADO',
  FALSE,
  NULL,
  'Auto-saldo retroactivo (mig 031): compromiso desplazado al instrumento'
FROM gastos g
WHERE g.medio_pago IN ('TARJETA', 'CHEQUE_FISICO', 'ECHEQ', 'CUENTA_CORRIENTE')
  AND g.estado = 'PENDIENTE'
  AND NOT EXISTS (
    SELECT 1 FROM pagos p
    WHERE p.tipo_origen = 'GASTO' AND p.origen_id = g.id
  );

-- 2. Marcar los gastos como PAGADO (no hay trigger DB para gasto+pagos, solo en JS)
UPDATE gastos g
SET estado = 'PAGADO',
    fecha_pago = COALESCE(g.fecha_pago, CURRENT_DATE)
WHERE g.medio_pago IN ('TARJETA', 'CHEQUE_FISICO', 'ECHEQ', 'CUENTA_CORRIENTE')
  AND g.estado = 'PENDIENTE'
  AND EXISTS (
    SELECT 1 FROM pagos p
    WHERE p.tipo_origen = 'GASTO'
      AND p.origen_id = g.id
      AND p.notas LIKE 'Auto-saldo retroactivo%'
  );
