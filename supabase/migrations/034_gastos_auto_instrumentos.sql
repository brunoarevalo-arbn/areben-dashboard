-- ============================================================
-- Migración 034: Auto-generación de gastos desde cierre de períodos
--   + tipificación de instrumentos (inversión privada vs crédito bancario)
-- ============================================================
-- Habilita el flujo: cerrar un período de un instrumento de inversión
-- crea automáticamente un gasto financiero (en ARS, convertido al TC
-- del mes si el instrumento es USD), con prorrateo heredado de la
-- configuración global, vinculado al período como referencia auditable.
-- ============================================================

-- 1. Extender gastos con FKs y campos de auditoría de auto-generación
ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS subcategoria_id UUID REFERENCES gastos_subcategorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instrumento_id UUID REFERENCES instrumentos_inversion(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS periodo_instrumento_id UUID REFERENCES periodos_instrumento(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_generado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS generado_desde VARCHAR(50),
  ADD COLUMN IF NOT EXISTS monto_origen NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS moneda_origen VARCHAR(3),
  ADD COLUMN IF NOT EXISTS tipo_cambio_aplicado NUMERIC(15,4);

COMMENT ON COLUMN gastos.subcategoria_id        IS 'FK opcional a gastos_subcategorias. Para gastos auto-generados es obligatorio en la app.';
COMMENT ON COLUMN gastos.instrumento_id         IS 'Si el gasto proviene de un cierre de inversión: FK al instrumento.';
COMMENT ON COLUMN gastos.periodo_instrumento_id IS 'Si el gasto proviene de un cierre de inversión: FK al período. UNIQUE para evitar duplicados.';
COMMENT ON COLUMN gastos.auto_generado          IS 'TRUE si el gasto fue creado automáticamente por el sistema (no manualmente por el usuario).';
COMMENT ON COLUMN gastos.generado_desde         IS 'Origen lógico del auto-generado: INVERSION_CIERRE, APORTES_PATRONALES, GASTO_INTERESES, etc.';
COMMENT ON COLUMN gastos.monto_origen           IS 'Monto en la moneda original (antes de convertir a ARS). NULL si ya estaba en ARS.';
COMMENT ON COLUMN gastos.moneda_origen          IS 'Moneda original (USD / ARS). NULL si ya estaba en la moneda final.';
COMMENT ON COLUMN gastos.tipo_cambio_aplicado   IS 'TC usado para convertir de moneda_origen a moneda final. NULL si no hubo conversión.';

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_gastos_auto_generado
  ON gastos(auto_generado) WHERE auto_generado = TRUE;

CREATE INDEX IF NOT EXISTS idx_gastos_instrumento
  ON gastos(instrumento_id) WHERE instrumento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gastos_subcategoria
  ON gastos(subcategoria_id) WHERE subcategoria_id IS NOT NULL;

-- Partial UNIQUE: garantiza que ningún período tenga más de un gasto auto-generado.
-- Es la red de seguridad por si la lógica de la app falla.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gastos_periodo_instrumento_unique
  ON gastos(periodo_instrumento_id)
  WHERE periodo_instrumento_id IS NOT NULL;

-- 3. Tipificar instrumentos_inversion
ALTER TABLE instrumentos_inversion
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(30) NOT NULL DEFAULT 'INVERSION_PRIVADA'
    CHECK (tipo IN ('INVERSION_PRIVADA', 'CREDITO_BANCARIO')),
  ADD COLUMN IF NOT EXISTS acreedor_nombre VARCHAR(200),
  ADD COLUMN IF NOT EXISTS acreedor_contacto VARCHAR(200);

COMMENT ON COLUMN instrumentos_inversion.tipo               IS 'Distingue inversor privado (terceros que aportan capital) vs crédito bancario (banco que presta capital).';
COMMENT ON COLUMN instrumentos_inversion.acreedor_nombre    IS 'Nombre del banco/acreedor si tipo=CREDITO_BANCARIO. Para INVERSION_PRIVADA se toma del inversor relacionado.';
COMMENT ON COLUMN instrumentos_inversion.acreedor_contacto  IS 'Datos de contacto del acreedor (ejecutivo, email, teléfono).';

CREATE INDEX IF NOT EXISTS idx_instrumentos_tipo ON instrumentos_inversion(tipo);

NOTIFY pgrst, 'reload schema';
