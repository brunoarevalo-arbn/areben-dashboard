-- Todo movimiento de plata nuevo tiene que traer el día.
--
-- Sin el día, `generarPeriodosPlano` mueve el saldo pero NO ajusta el interés: un aporte
-- sin fecha le rinde de menos al inversor y un retiro sin fecha le rinde de más (la plata
-- que ya se llevó sigue devengando el mes entero). Medido el 8-sep-2026 sobre el aporte de
-- US$6.007 de Javier Sequeira: con fecha rinde US$761,85 en el ciclo, sin fecha US$473,90.
-- Son US$287,95 de diferencia por un dato que falta.
--
-- Los tres caminos del código (crearMovimiento, editarMovimiento y la devolución de
-- `registrarDevolucion`) ya exigen la fecha vía `movimientoSchema`. Esto cierra la puerta
-- de atrás: cualquier carga directa contra la tabla.
--
-- La excepción es sólo para los 5 que trajo la migración 075 desde `periodos_instrumento`
-- (origen = 'migracion_069'). Se copiaron a propósito sin día porque inventarles uno
-- cambiaría meses ya cerrados. Tres siguen vivos y hay que fecharlos a mano con el dato
-- real del inversor (Sequeira +US$6.007 · Elisa +US$726,80 · Tamayo −US$6.668,97); los
-- otros dos son de instrumentos ya devueltos y cerrados.
--
-- Al 8-sep-2026: 7 movimientos en total, 2 'manual' con fecha y 5 'migracion_069' sin ella.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'movimientos_instrumento_fecha_obligatoria'
  ) THEN
    ALTER TABLE movimientos_instrumento
      ADD CONSTRAINT movimientos_instrumento_fecha_obligatoria
      CHECK (fecha IS NOT NULL OR origen = 'migracion_069');
  END IF;
END $$;

COMMENT ON COLUMN movimientos_instrumento.fecha IS
  'Día en que se movió la plata. OBLIGATORIO salvo para los históricos de migracion_069. '
  'Sin el día el movimiento mueve el saldo pero no ajusta el interés del ciclo.';
