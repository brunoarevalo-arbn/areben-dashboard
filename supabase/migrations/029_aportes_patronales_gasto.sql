-- ============================================================
-- Migración 029: Aportes patronales como gasto pendiente vinculado
-- ============================================================
-- Cuando se genera una nómina BLANCA, los aportes patronales (cargas sociales)
-- se materializan como un gasto pendiente categoría "Cargas Sociales", con
-- vencimiento el día 15 del mes siguiente. Aparece en /finanzas/pendientes y
-- /finanzas/cierre-mes como un pasivo separado del sueldo.

ALTER TABLE nomina_mensual
  ADD COLUMN IF NOT EXISTS gasto_aportes_patronales_id UUID
    REFERENCES gastos(id) ON DELETE SET NULL;

COMMENT ON COLUMN nomina_mensual.gasto_aportes_patronales_id IS
  'FK al gasto auto-generado de "Cargas Sociales" (aportes patronales del mes para este empleado).';

CREATE INDEX IF NOT EXISTS idx_nomina_gasto_aportes ON nomina_mensual(gasto_aportes_patronales_id) WHERE gasto_aportes_patronales_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
