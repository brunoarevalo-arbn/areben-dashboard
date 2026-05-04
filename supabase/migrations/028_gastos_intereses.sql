-- ============================================================
-- Migración 028: Intereses por financiación en gastos con cuotas
-- ============================================================
-- Cuando un gasto se paga con tarjeta en cuotas y tiene financiación,
-- se calcula el interés y se genera un GASTO SECUNDARIO con categoría
-- "Gasto Financiero" linkeado al gasto principal.
-- Las cuotas mensuales = (monto_principal + interes) / cuotas_total
-- pero se llevan en filas separadas (cada gasto tiene sus propias cuotas).

ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS tiene_intereses BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS interes_tipo VARCHAR(15)
    CHECK (interes_tipo IS NULL OR interes_tipo IN ('MONTO', 'PORCENTAJE')),
  ADD COLUMN IF NOT EXISTS interes_valor NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS interes_monto NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS gasto_intereses_id UUID REFERENCES gastos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gasto_padre_id UUID REFERENCES gastos(id) ON DELETE CASCADE;

COMMENT ON COLUMN gastos.tiene_intereses IS 'Si el gasto se paga con financiación (cuotas con interés)';
COMMENT ON COLUMN gastos.interes_tipo IS 'MONTO ($X total) o PORCENTAJE (% sobre el monto principal)';
COMMENT ON COLUMN gastos.interes_valor IS 'El monto fijo o el porcentaje según interes_tipo';
COMMENT ON COLUMN gastos.interes_monto IS 'Snapshot del interés calculado en pesos';
COMMENT ON COLUMN gastos.gasto_intereses_id IS 'FK al gasto secundario auto-generado de "Gasto Financiero" (en el gasto principal)';
COMMENT ON COLUMN gastos.gasto_padre_id IS 'FK al gasto principal del que proviene este gasto de intereses';

CREATE INDEX IF NOT EXISTS idx_gastos_padre ON gastos(gasto_padre_id) WHERE gasto_padre_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
