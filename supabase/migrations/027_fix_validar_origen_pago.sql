-- ============================================================
-- Migración 027: Fix trigger validar_origen_pago — acepta compra_id como origen_id
-- ============================================================
-- El trigger original (020) exigía origen_id para todos los tipos != LIBRE,
-- pero los flujos legacy de compras setean compra_id sin origen_id.
-- Ahora: si tipo_origen=COMPRA y origen_id viene null pero compra_id está, lo copia.

CREATE OR REPLACE FUNCTION validar_origen_pago()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo_origen = 'LIBRE' THEN
    -- LIBRE no requiere origen
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
