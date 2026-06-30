-- ============================================================
-- Migración 041: pagos parciales contra cuotas de préstamo
-- ============================================================
-- Suma 'PRESTAMO' al ledger unificado `pagos` (origen_id = prestamo_cuotas.id).
-- El saldo de cada cuota = monto_total - SUM(pagos PRESTAMO de esa cuota).
-- Cuando se completa, la app (recomputarOrigen) marca la cuota pagada=true y su
-- gasto financiero (interés) como PAGADO; si se borra un pago y deja de estar
-- completa, vuelve a PENDIENTE.

-- 1) Permitir el nuevo tipo_origen
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_tipo_origen_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_tipo_origen_check
  CHECK (tipo_origen IN ('COMPRA', 'GASTO', 'NOMINA', 'CUOTA', 'LIBRE', 'PRESTAMO'));

-- 2) Validar que el origen exista también para PRESTAMO
CREATE OR REPLACE FUNCTION validar_origen_pago()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo_origen = 'LIBRE' THEN
    RETURN NEW;
  END IF;
  -- Para COMPRA: si vino sólo compra_id, copiarlo a origen_id automáticamente.
  IF NEW.tipo_origen = 'COMPRA' AND NEW.origen_id IS NULL AND NEW.compra_id IS NOT NULL THEN
    NEW.origen_id := NEW.compra_id;
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
  IF NEW.tipo_origen = 'PRESTAMO' AND NOT EXISTS (SELECT 1 FROM prestamo_cuotas WHERE id = NEW.origen_id) THEN
    RAISE EXCEPTION 'Cuota de préstamo % no existe', NEW.origen_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
