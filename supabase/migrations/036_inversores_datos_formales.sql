-- ============================================================
-- Migración 036: Datos formales en tabla inversores
-- ============================================================
-- Agrega campos para identificar formalmente al inversor en
-- comprobantes externos (PDF para inversor, certificados, etc).
-- Todos nullable para no romper datos existentes.
-- ============================================================

ALTER TABLE inversores
  ADD COLUMN IF NOT EXISTS dni VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cuit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS domicilio_calle VARCHAR(200),
  ADD COLUMN IF NOT EXISTS domicilio_ciudad VARCHAR(100),
  ADD COLUMN IF NOT EXISTS domicilio_provincia VARCHAR(100),
  ADD COLUMN IF NOT EXISTS domicilio_cp VARCHAR(20),
  ADD COLUMN IF NOT EXISTS email VARCHAR(200),
  ADD COLUMN IF NOT EXISTS telefono VARCHAR(50);

COMMENT ON COLUMN inversores.dni IS 'DNI del inversor si es persona física. NULL si es empresa o no se cargó.';
COMMENT ON COLUMN inversores.cuit IS 'CUIT del inversor (formato XX-XXXXXXXX-X). Obligatorio en comprobantes formales.';

NOTIFY pgrst, 'reload schema';
