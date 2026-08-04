-- ============================================================
-- Migración 064: Historial de cambios de la ficha del empleado
-- ============================================================
-- Hasta ahora `eventos_empleado` sólo guardaba sueldo_anterior/sueldo_nuevo, y sólo lo
-- escribían el ajuste salarial y el puente desde la nómina: editar la ficha pisaba
-- sueldo, horas y valor hora sin dejar rastro.
-- Se extiende el evento para registrar también las horas mensuales, el valor hora y
-- quién hizo el cambio. `tipo` es VARCHAR(50) sin CHECK, así que el tipo nuevo
-- 'CAMBIO_HORAS' entra sin tocar constraints.
--
-- `registrado_por` sigue la convención de la 063 (saldos_cuentas.revisado_por): el email
-- del usuario, en TEXT, que se renderiza con nombreRevisor() de lib/saldos-revision.ts.

ALTER TABLE eventos_empleado
  ADD COLUMN IF NOT EXISTS horas_anterior      INTEGER,
  ADD COLUMN IF NOT EXISTS horas_nuevo         INTEGER,
  ADD COLUMN IF NOT EXISTS valor_hora_anterior NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS valor_hora_nuevo    NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS registrado_por      TEXT,
  ADD COLUMN IF NOT EXISTS origen              VARCHAR(20);

COMMENT ON COLUMN eventos_empleado.horas_anterior      IS 'horas_mensuales de la ficha antes del cambio. NULL en eventos que no tocan la ficha.';
COMMENT ON COLUMN eventos_empleado.horas_nuevo         IS 'horas_mensuales de la ficha después del cambio.';
COMMENT ON COLUMN eventos_empleado.valor_hora_anterior IS 'valor_hora (derivado de sueldo/horas) antes del cambio. Congelado como evidencia.';
COMMENT ON COLUMN eventos_empleado.valor_hora_nuevo    IS 'valor_hora después del cambio. Si coincide con el anterior, se sumaron horas manteniendo el valor hora.';
COMMENT ON COLUMN eventos_empleado.registrado_por      IS 'Email de quien hizo el cambio. NULL en eventos anteriores a la 064.';
COMMENT ON COLUMN eventos_empleado.origen              IS 'De dónde salió el evento: FICHA (edición del empleado) | AJUSTE (modal de ajuste salarial) | NOMINA (actualizar sueldo desde la liquidación) | MANUAL (cargado a mano). NULL = histórico previo a la 064.';

-- Los eventos ya cargados a mano no tienen origen; se marcan como MANUAL para que la UI
-- pueda distinguir los automáticos (que no conviene dejar borrar) de los manuales.
UPDATE eventos_empleado SET origen = 'MANUAL' WHERE origen IS NULL;

CREATE INDEX IF NOT EXISTS idx_eventos_origen ON eventos_empleado(origen);

NOTIFY pgrst, 'reload schema';
