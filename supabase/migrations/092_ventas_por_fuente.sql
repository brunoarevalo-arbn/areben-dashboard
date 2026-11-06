-- ============================================================
-- Migración 092: de qué sistema sale lo vendido de cada marca
-- ============================================================
-- Desde nov-2026 el dashboard lee las ventas del ERP (https://erp.arebensrl.com/api/v1), que trae
-- lo vendido en Gestión Nube y lo vendido en el ERP después del corte de cada marca, cada venta con
-- su `fuente`. La sync guarda acá el desglose por marca y mes, para mostrarlo al lado del número
-- (pedido de Bruno, «GN hasta el 14-nov · ERP desde el 15-nov»).
-- Forma: { "gn": {ventas, brutas, desde, hasta}, "erp": {...}, "sin_dato": {...} } — sólo las que hubo.
-- NULL = mes sincronizado antes de esta migración (leía sólo GN).
-- ============================================================

alter table datos_ventas_gn add column if not exists por_fuente jsonb;

comment on column datos_ventas_gn.por_fuente is
  'Desglose por sistema de origen (gn / erp / sin_dato): n° de ventas, ventas con IVA y primer/último día. Lo escribe la sync de ventas (lib/gestion-nube/por-fuente.mjs). NULL = sincronizado antes de nov-2026, sólo GN.';
