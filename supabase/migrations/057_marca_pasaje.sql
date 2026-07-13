-- ============================================================
-- Migración 057: Marca de imputación al pasar producción a stock
-- ============================================================
-- Al pasar una compra de producción a stock terminado se elige la marca a cuyo
-- inventario se imputa. Ese neto entra a la "posición de mercadería" de la marca
-- (ver calcularReposicion), de modo que el pasaje sea un traslado activo→activo y
-- el PN no cambie. NULL = todavía en proceso (o pasaje revertido).
-- ============================================================

ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS marca_pasaje marca;   -- BDI/ZATTIA/STUNNED al pasar; NULL si en proceso

COMMENT ON COLUMN compras.marca_pasaje IS 'Producción: marca a cuyo inventario se imputó la compra al pasar a stock. NULL = en proceso.';
