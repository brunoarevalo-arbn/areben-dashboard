-- Costo de envíos: GN trae el envío COBRADO al cliente (ingreso) pero no el costo del correo.
-- Por defecto el costo = lo cobrado (envios) → el envío queda neteado (no infla el margen).
-- Este override permite pisarlo con el costo real del correo por mes/marca. null = usar el default (envios).
ALTER TABLE datos_ventas_gn
  ADD COLUMN IF NOT EXISTS costo_envios_override NUMERIC(15,2);
