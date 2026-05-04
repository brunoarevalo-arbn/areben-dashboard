-- ============================================================================
-- Migración 032: backfill de fecha_vencimiento en pagos paid-on-commit
-- ============================================================================
-- La mig 031 creó pagos paid-on-commit sin fecha_vencimiento, así que los
-- compromisos en cheque / cuenta corriente desplazados desde gastos no
-- aparecían en /finanzas/pendientes. Para tarjeta el compromiso real es la
-- cuota (con su propia fecha_vencimiento), así que esos pagos quedan sin
-- fecha (no se muestran como compromiso aparte).
-- ============================================================================

UPDATE pagos p
SET fecha_vencimiento = COALESCE(g.fecha_pago, g.fecha)
FROM gastos g
WHERE p.tipo_origen = 'GASTO'
  AND p.origen_id = g.id
  AND p.instrumento IN ('CHEQUE_FISICO', 'ECHEQ', 'CUENTA_CORRIENTE')
  AND p.fecha_vencimiento IS NULL
  AND p.acreditado = FALSE;
