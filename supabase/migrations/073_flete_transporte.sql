-- 073 — Fletes: marcar transportistas y vincular el flete a su compra
--
-- POR QUÉ: un flete se carga hoy como una compra suelta al transportista, con la
-- referencia a qué compra pertenece escrita a mano en la descripción
-- ("Transporte OC Keytex", "Sendbox (flete compra Lookeados)"). Funciona para no
-- perder el costo, pero el costo real de la mercadería puesta en el depósito queda
-- partido en dos registros que nada relaciona.
--
-- El 27/07/2026 el bot mandó tres fletes a `gastos` (Sendbox $99.300 y Santa Lucía
-- $45.000), porque un flete ES un servicio y esa es la regla que tiene escrita.
-- Estas dos columnas son lo que necesita para no volver a equivocarse.
--
-- 1) proveedores.es_transporte
--    Sin esto, la única forma de que el bot sepa que "Vía Cargo" es un transportista
--    sería una lista escrita adentro suyo, que se desactualiza y no se puede tocar
--    por chat. Con la columna, dar de alta un transportista nuevo desde WhatsApp
--    alcanza para que lo reconozca de ahí en más.
--
-- 2) compras.flete_de_compra_id
--    El flete SIGUE siendo su propia fila: es la deuda con el transportista, tiene
--    su propio pago y su propia factura, y un mismo cobro puede cubrir varias
--    compras de marcas distintas (24/07: un cobro de Santa Lucía = 3 fletes,
--    PRODUCCION y ZATTIA). Lo que se agrega es el vínculo, no la fusión.
--
-- El bot llena el vínculo desde ya, aunque el dashboard todavía no lo muestre: así
-- cuando se agregue la pantalla el histórico ya está cargado.

-- ── 1. Transportistas ────────────────────────────────────────────────────────
ALTER TABLE proveedores
  ADD COLUMN IF NOT EXISTS es_transporte boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN proveedores.es_transporte IS
  'El proveedor es un transportista (Santa Lucía, Sendbox, Vía Cargo...). Sus compras '
  'son fletes: el negocio/marca NO se hereda de su ficha sino de la compra que transporta, '
  'porque un mismo transportista mueve mercadería de varias marcas.';

UPDATE proveedores
   SET es_transporte = true
 WHERE nombre ILIKE '%santa luc%'
    OR nombre ILIKE '%sendbox%'
    OR nombre ILIKE '%via cargo%'
    OR nombre ILIKE '%vía cargo%';

-- ── 2. Vínculo flete → compra ────────────────────────────────────────────────
ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS flete_de_compra_id uuid
    REFERENCES compras(id) ON DELETE SET NULL;

COMMENT ON COLUMN compras.flete_de_compra_id IS
  'Si esta compra es un flete, la compra de mercadería a la que pertenece. Queda en NULL '
  'cuando el flete no corresponde a una compra puntual (envío de cheques, retiro de un '
  'paquete) o cuando no se pudo identificar sin ambigüedad. El costo puesto en depósito '
  'de una compra = su monto + la suma de los fletes que la referencian.';

CREATE INDEX IF NOT EXISTS idx_compras_flete_de
    ON compras (flete_de_compra_id)
 WHERE flete_de_compra_id IS NOT NULL;

-- NOTA: no se hace backfill del vínculo histórico. Las 22 compras de flete desde mayo
-- sólo dicen a qué compra pertenecen en texto libre ("flete compra DUET"), y varias no
-- pertenecen a ninguna (envío de cheques a NTV Textil, retiro de paquete Psychic).
-- Atarlas requiere criterio humano; se puede hacer después desde la app.

-- Verificación: así tiene que quedar.
SELECT
  (SELECT count(*) FROM proveedores WHERE es_transporte)              AS transportistas,
  (SELECT count(*) FROM compras WHERE flete_de_compra_id IS NOT NULL) AS fletes_vinculados;
