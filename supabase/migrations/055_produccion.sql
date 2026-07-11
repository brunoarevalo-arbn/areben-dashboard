-- ============================================================
-- Migración 055: Producción (adelantos de producción como activo)
-- ============================================================
-- Modelo de 3 etapas (activo en todo el recorrido, hasta la venta):
--   1) Producción en proceso: compras de insumos/mano de obra en negocio 'PRODUCCION'
--      (proveedor real, pagadas por el flujo normal). Suman a un activo que compensa
--      la deuda que generan → el patrimonio no se distorsiona.
--   2) Stock terminado: al terminar la tanda se marca `fecha_pasaje` y se registra la
--      compra a proveedor Zattia/Stunned (negocio de la marca) → pasa al inventario.
--   3) CMV: al vender, el inventario baja como costo (ya lo lleva el sistema).
--
-- 'PRODUCCION' es un valor NUEVO de marca (NO se renombra 'GENERAL', que lo usan los
-- gastos generales). Se identifica una compra de producción por negocio='PRODUCCION'
-- (y su categoria_produccion). 'en proceso' = fecha_pasaje IS NULL.
-- ============================================================

-- Nota: ADD VALUE no puede USARSE en la misma transacción que lo agrega; por eso el
-- índice de abajo NO referencia el literal 'PRODUCCION' (usa categoria_produccion).
ALTER TYPE marca ADD VALUE IF NOT EXISTS 'PRODUCCION';

DO $$ BEGIN
  CREATE TYPE categoria_produccion AS ENUM ('MANO_DE_OBRA', 'INSUMO', 'AVIO', 'OTRO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS categoria_produccion categoria_produccion,   -- NULL salvo producción
  ADD COLUMN IF NOT EXISTS fecha_pasaje DATE;                            -- NULL = en proceso; con fecha = pasada a stock

COMMENT ON COLUMN compras.categoria_produccion IS 'Origen del gasto de producción: mano de obra / insumo / avío / otro. NULL si no es producción.';
COMMENT ON COLUMN compras.fecha_pasaje IS 'Producción: fecha en que la compra pasó de "en proceso" a stock terminado. NULL = todavía en producción.';

CREATE INDEX IF NOT EXISTS idx_compras_produccion
  ON compras(fecha_pasaje)
  WHERE categoria_produccion IS NOT NULL;
