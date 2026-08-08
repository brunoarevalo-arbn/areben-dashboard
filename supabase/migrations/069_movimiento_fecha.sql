-- ============================================================
-- Migración 069: el día en que se movió la plata del inversor
-- ============================================================
-- Hasta ahora un movimiento guardaba solo "en julio se retiraron 2.000", sin el día.
-- Sin el día no se puede saber cuánto tiempo esa plata estuvo trabajando, así que el
-- interés se seguía calculando sobre el capital viejo hasta la renovación.
--
-- Con la fecha, lo retirado cobra interés por los días que estuvo y deja de cobrar
-- desde que salió.
--
-- Nullable a propósito: un movimiento viejo sin fecha se calcula como hasta ahora,
-- así ningún número ya cerrado se mueve.

ALTER TABLE periodos_instrumento
  ADD COLUMN IF NOT EXISTS fecha_movimiento DATE;

COMMENT ON COLUMN periodos_instrumento.fecha_movimiento IS
  'Día en que entró o salió la plata. Si está vacío, el movimiento no ajusta el interés (comportamiento previo a la migración 069).';
