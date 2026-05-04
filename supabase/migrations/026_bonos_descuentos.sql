-- ============================================================
-- Migración 026: Bonos / Premios / Descuentos puntuales en nómina
-- ============================================================
-- Conceptos puntuales del mes — NO suman a la base del aguinaldo
-- (son one-off, no son sueldo fijo).

ALTER TABLE nomina_mensual
  ADD COLUMN IF NOT EXISTS bono_monto NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bono_concepto VARCHAR(30),
  ADD COLUMN IF NOT EXISTS bono_descripcion TEXT,
  ADD COLUMN IF NOT EXISTS descuento_otro_monto NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_otro_concepto VARCHAR(30),
  ADD COLUMN IF NOT EXISTS descuento_otro_descripcion TEXT;

COMMENT ON COLUMN nomina_mensual.bono_concepto IS
  'Tipo del bono puntual: BONO, PREMIO, COMISION, OTRO';
COMMENT ON COLUMN nomina_mensual.descuento_otro_concepto IS
  'Tipo del descuento puntual: MULTA, DEVOLUCION_ADELANTO, OTRO';

NOTIFY pgrst, 'reload schema';
