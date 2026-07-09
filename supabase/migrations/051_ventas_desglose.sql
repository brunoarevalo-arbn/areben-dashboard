-- Desglose estilo P&L de Gestión Nube en datos_ventas_gn:
-- IVA débito fiscal (solo ventas blanco/Areben), envíos, descuentos, y el split blanco/negro.
-- Invariantes:
--   ventas_netas = ventas_brutas - iva_debito + envios - descuentos
--   ventas_netas = ventas_netas_blanco + ventas_netas_negro
ALTER TABLE datos_ventas_gn
  ADD COLUMN IF NOT EXISTS iva_debito          NUMERIC(15,2) NOT NULL DEFAULT 0,  -- 21% de las ventas blanco (facturadas/Areben)
  ADD COLUMN IF NOT EXISTS envios              NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuentos          NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ventas_netas_blanco NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ventas_netas_negro  NUMERIC(15,2) NOT NULL DEFAULT 0;
