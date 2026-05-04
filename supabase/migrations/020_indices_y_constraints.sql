-- ============================================================
-- Migración 020: Índices faltantes y CHECK constraints de integridad
-- ============================================================

-- 1) Índices que la auditoría detectó como faltantes
CREATE INDEX IF NOT EXISTS idx_cuotas_tarjeta_origen ON cuotas_tarjeta(origen_tipo, origen_id);
CREATE INDEX IF NOT EXISTS idx_saldos_cuentas_patrim_cuenta ON saldos_cuentas_patrim(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_pagos_acreditado ON pagos(acreditado) WHERE acreditado = false;
CREATE INDEX IF NOT EXISTS idx_pagos_fecha_acreditacion ON pagos(fecha_acreditacion);

-- Index parciales para queries de pendientes
CREATE INDEX IF NOT EXISTS idx_gastos_estado_fecha ON gastos(estado, fecha_pago) WHERE estado != 'PAGADO';
CREATE INDEX IF NOT EXISTS idx_cuotas_pagada_mes ON cuotas_tarjeta(pagada, mes_vencimiento) WHERE pagada = false;

-- 2) CHECKs de integridad mínima en gastos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gastos_monto_neto_check') THEN
    ALTER TABLE gastos ADD CONSTRAINT gastos_monto_neto_check
      CHECK (monto_neto <= monto + 0.01);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gastos_cuotas_total_check') THEN
    ALTER TABLE gastos ADD CONSTRAINT gastos_cuotas_total_check
      CHECK (cuotas_total IS NULL OR cuotas_total >= 1);
  END IF;
END $$;

-- 3) Validar que origen_id sea consistente con tipo_origen en pagos
-- Trigger que verifica integridad referencial polimórfica
CREATE OR REPLACE FUNCTION validar_origen_pago()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo_origen = 'LIBRE' THEN
    -- LIBRE no requiere origen
    RETURN NEW;
  END IF;
  IF NEW.origen_id IS NULL THEN
    RAISE EXCEPTION 'origen_id es obligatorio para tipo_origen = %', NEW.tipo_origen;
  END IF;
  IF NEW.tipo_origen = 'COMPRA' AND NOT EXISTS (SELECT 1 FROM compras WHERE id = NEW.origen_id) THEN
    RAISE EXCEPTION 'Compra % no existe', NEW.origen_id;
  END IF;
  IF NEW.tipo_origen = 'GASTO' AND NOT EXISTS (SELECT 1 FROM gastos WHERE id = NEW.origen_id) THEN
    RAISE EXCEPTION 'Gasto % no existe', NEW.origen_id;
  END IF;
  IF NEW.tipo_origen = 'NOMINA' AND NOT EXISTS (SELECT 1 FROM nomina_mensual WHERE id = NEW.origen_id) THEN
    RAISE EXCEPTION 'Nómina % no existe', NEW.origen_id;
  END IF;
  IF NEW.tipo_origen = 'CUOTA' AND NOT EXISTS (SELECT 1 FROM cuotas_tarjeta WHERE id = NEW.origen_id) THEN
    RAISE EXCEPTION 'Cuota % no existe', NEW.origen_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_origen_pago ON pagos;
CREATE TRIGGER trg_validar_origen_pago
  BEFORE INSERT OR UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION validar_origen_pago();

NOTIFY pgrst, 'reload schema';
