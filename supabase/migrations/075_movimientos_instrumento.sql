-- 075 — Los movimientos de plata pasan a ser una lista propia.
--
-- Hasta acá, cada instrumento guardaba UN movimiento por mes, como una columna dentro
-- de la fila del período (periodos_instrumento.movimiento + fecha_movimiento, mig 069).
-- Eso dejaba tres cosas afuera:
--   1. Dos retiros en el mismo mes no entraban.
--   2. No se podía saber POR QUÉ se movió la plata.
--   3. El único camino cómodo para cargar un retiro (el lápiz de la grilla de cierre)
--      no pedía el día, y sin día el interés no se ajusta: se le pagaba de más al
--      inversor por plata que ya se había llevado.
--
-- Desde acá, la fuente de verdad es movimientos_instrumento. Las columnas
-- `movimiento` y `fecha_movimiento` de periodos_instrumento quedan como CACHE derivada
-- que regenerarPeriodosDB recalcula, para no tocar los PDFs ni las pantallas que ya
-- las leen.

-- 1. Tabla
CREATE TABLE IF NOT EXISTS movimientos_instrumento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrumento_id UUID NOT NULL REFERENCES instrumentos_inversion(id) ON DELETE CASCADE,
  fecha DATE,
  mes VARCHAR(7) NOT NULL,
  monto NUMERIC(15,2) NOT NULL,
  motivo VARCHAR(20) NOT NULL DEFAULT 'ajuste',
  nota TEXT,
  origen VARCHAR(20) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A propósito NO hay UNIQUE(instrumento_id, mes): poder cargar varios movimientos en
-- el mismo mes es justamente el motivo de esta migración.
CREATE INDEX IF NOT EXISTS idx_mov_instr_mes ON movimientos_instrumento(instrumento_id, mes);
CREATE INDEX IF NOT EXISTS idx_mov_instr_fecha ON movimientos_instrumento(instrumento_id, fecha);

-- 2. Reglas. Van con DROP + ADD para que la migración se pueda re-correr y para poder
-- sumar motivos nuevos más adelante sin pelear con un ENUM.
ALTER TABLE movimientos_instrumento DROP CONSTRAINT IF EXISTS mov_monto_no_cero;
ALTER TABLE movimientos_instrumento ADD CONSTRAINT mov_monto_no_cero CHECK (monto <> 0);

ALTER TABLE movimientos_instrumento DROP CONSTRAINT IF EXISTS mov_mes_formato;
ALTER TABLE movimientos_instrumento ADD CONSTRAINT mov_mes_formato CHECK (mes ~ '^\d{4}-\d{2}$');

ALTER TABLE movimientos_instrumento DROP CONSTRAINT IF EXISTS mov_mes_coherente;
ALTER TABLE movimientos_instrumento ADD CONSTRAINT mov_mes_coherente
  CHECK (fecha IS NULL OR mes = to_char(fecha, 'YYYY-MM'));

ALTER TABLE movimientos_instrumento DROP CONSTRAINT IF EXISTS mov_motivo_valido;
ALTER TABLE movimientos_instrumento ADD CONSTRAINT mov_motivo_valido
  CHECK (motivo IN ('retiro_parcial', 'aporte_nuevo', 'devolucion', 'ajuste'));

ALTER TABLE movimientos_instrumento DROP CONSTRAINT IF EXISTS mov_origen_valido;
ALTER TABLE movimientos_instrumento ADD CONSTRAINT mov_origen_valido
  CHECK (origen IN ('manual', 'devolucion_cierre', 'migracion_069'));

COMMENT ON COLUMN movimientos_instrumento.fecha IS
  'Día en que se movió la plata. Si está vacío, el movimiento mueve el saldo pero NO ajusta el interés (mismo criterio que la migración 069).';
COMMENT ON COLUMN movimientos_instrumento.mes IS
  'Mes al que se imputa. Redundante cuando hay fecha, imprescindible cuando no la hay.';
COMMENT ON COLUMN movimientos_instrumento.monto IS
  'Con signo: negativo sale plata del instrumento, positivo entra.';
COMMENT ON COLUMN movimientos_instrumento.origen IS
  'manual = lo cargó alguien; devolucion_cierre = lo generó "Devolver y cerrar"; migracion_069 = venía de la columna vieja del período.';

-- 3. RLS
ALTER TABLE movimientos_instrumento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON movimientos_instrumento;
CREATE POLICY "authenticated_all" ON movimientos_instrumento FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Trigger updated_at
DROP TRIGGER IF EXISTS update_movimientos_instrumento_updated_at ON movimientos_instrumento;
CREATE TRIGGER update_movimientos_instrumento_updated_at BEFORE UPDATE ON movimientos_instrumento
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Traer los movimientos que ya estaban dentro de los períodos.
--
-- Se copian TAL CUAL, sin inventarles un día. Ninguno de los que hay tiene fecha, y
-- ponerles una cambiaría el interés de meses que ya se cerraron y se publicaron como
-- gasto devengado. Sin fecha, el cálculo da exactamente lo mismo que hoy: cero deriva.
-- Después se les puede poner el día de a uno desde la pantalla, viendo el impacto.
INSERT INTO movimientos_instrumento (instrumento_id, mes, fecha, monto, motivo, nota, origen)
SELECT
  p.instrumento_id,
  p.mes,
  p.fecha_movimiento,
  p.movimiento,
  CASE WHEN p.movimiento < 0 THEN 'retiro_parcial' ELSE 'aporte_nuevo' END,
  'Movimiento que estaba cargado en el mes ' || p.mes || ', traído al pasar los movimientos a lista.',
  'migracion_069'
FROM periodos_instrumento p
WHERE COALESCE(p.movimiento, 0) <> 0
  AND NOT EXISTS (
    SELECT 1 FROM movimientos_instrumento m
    WHERE m.instrumento_id = p.instrumento_id
      AND m.mes = p.mes
      AND m.origen = 'migracion_069'
  );

-- 6. Dejar escrito que las columnas viejas ya no mandan.
COMMENT ON COLUMN periodos_instrumento.movimiento IS
  'CACHE derivada: suma de los movimientos del mes. La fuente de verdad es movimientos_instrumento. La recalcula regenerarPeriodosDB.';
COMMENT ON COLUMN periodos_instrumento.fecha_movimiento IS
  'CACHE derivada: el día, solo si el mes tiene un único movimiento con fecha (o el de la devolución). NULL si hay varios. La fuente de verdad es movimientos_instrumento.';
