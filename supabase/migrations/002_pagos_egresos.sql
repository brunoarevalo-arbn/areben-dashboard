-- ============================================================
-- AREBEN DASHBOARD - Migración 002: Pagos y Egresos
-- Ejecutar en Supabase SQL Editor DESPUÉS de 001_initial_schema.sql
-- ============================================================

-- 1. Agregar columnas de montos a compras (si no existen)
ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS monto_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_neto NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS porcentaje_facturacion NUMERIC(5,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS saldo_pendiente NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Inicializar saldo_pendiente para compras ya existentes
UPDATE compras
SET saldo_pendiente = monto_total
WHERE saldo_pendiente = 0 AND monto_total > 0 AND estado != 'PAGADO';

-- 2. Tabla de pagos polimórfica
CREATE TABLE IF NOT EXISTS pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id UUID REFERENCES compras(id) ON DELETE RESTRICT,
  tipo_origen VARCHAR(50) NOT NULL DEFAULT 'COMPRA',
  monto NUMERIC(15,2) NOT NULL CHECK (monto > 0),
  moneda moneda NOT NULL DEFAULT 'ARS',
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE,
  condicion_pago VARCHAR(50) NOT NULL,
  instrumento VARCHAR(50) NOT NULL,
  numero_cheque VARCHAR(50),
  banco_emisor VARCHAR(100),
  numero_cuota INTEGER,
  total_cuotas INTEGER,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_compra ON pagos(compra_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha_emision ON pagos(fecha_emision);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha_vencimiento ON pagos(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_pagos_tipo_origen ON pagos(tipo_origen);

ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON pagos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Función trigger: recalcula saldo_pendiente y marca estado PAGADO
CREATE OR REPLACE FUNCTION actualizar_saldo_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_compra_id UUID;
  v_monto_total NUMERIC(15,2);
  v_pagado NUMERIC(15,2);
  v_saldo NUMERIC(15,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_compra_id := OLD.compra_id;
  ELSE
    v_compra_id := NEW.compra_id;
  END IF;

  IF v_compra_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT monto_total INTO v_monto_total FROM compras WHERE id = v_compra_id;
  SELECT COALESCE(SUM(monto), 0) INTO v_pagado FROM pagos WHERE compra_id = v_compra_id;

  v_saldo := GREATEST(v_monto_total - v_pagado, 0);

  UPDATE compras
  SET
    saldo_pendiente = v_saldo,
    estado = CASE
      WHEN v_saldo <= 0 THEN 'PAGADO'::estado_gasto
      ELSE estado
    END,
    updated_at = NOW()
  WHERE id = v_compra_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

-- Agregar updated_at a compras si no existe (para el trigger)
ALTER TABLE compras ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS trg_actualizar_saldo_compra ON pagos;
CREATE TRIGGER trg_actualizar_saldo_compra
  AFTER INSERT OR UPDATE OR DELETE ON pagos
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_compra();

CREATE TRIGGER update_compras_updated_at
  BEFORE UPDATE ON compras
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
