-- Comisiones comerciales (MP / Pago Nube / banco). GN no las expone por API, así que:
--  1) se ESTIMAN con un % configurable por medio de pago (comision_medio_pago) → columna comisiones
--  2) se pueden PISAR con el número real del resumen por mes/marca → columna comisiones_override
CREATE TABLE IF NOT EXISTS comision_medio_pago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medio VARCHAR(120) NOT NULL UNIQUE,     -- payment_method de GN (MercadoPago, Pago Nube, Efectivo…)
  porcentaje NUMERIC(6,3) NOT NULL DEFAULT 0,  -- % sobre el total cobrado (con IVA)
  activo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE comision_medio_pago ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON comision_medio_pago FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Override manual (null = usar el estimado de la columna comisiones). El sync no lo toca.
ALTER TABLE datos_ventas_gn
  ADD COLUMN IF NOT EXISTS comisiones_override NUMERIC(15,2);
