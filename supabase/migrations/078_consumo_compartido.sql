-- Migración 078: atar las filas que salieron de UN MISMO consumo
--
-- YA APLICADA en producción (por el SQL Editor, alrededor del 18-ago-2026): las tres
-- columnas y sus índices existen. El archivo llegó tarde al repo — nació como 077 y se
-- renumeró a 078 porque la 077 quedó tomada por las horas extras. Es idempotente
-- (`if not exists`), así que volver a correrla no hace nada.
--
-- Problema: un solo consumo con tarjeta puede repartirse en varias filas (ej. un pago
-- de $74.135,14 con Mercado Pago = un retiro de Darío + uno de Bruno). Cada fila tiene
-- que quedar a nombre de su socio, pero el resumen del banco muestra UNA sola línea.
-- Hasta ahora el vínculo vivía en el texto de `notas`: nadie lo podía usar para agrupar,
-- y si alguien editaba la nota se perdía sin dejar rastro.
--
-- Solución: un identificador compartido. Todas las filas nacidas del mismo consumo
-- llevan el mismo `consumo_id` (y sus cuotas también). Permite:
--   - mostrarlas agrupadas en la app ("consumo de $74.135,14, 2 partes")
--   - avisar antes de borrar una parte y dejar la otra huérfana
--   - conciliar como lo lista el banco: una línea por consumo, desplegable en partes
--
-- NULL = fila suelta, que es el caso normal. Solo se llena cuando hubo un pago
-- compartido de verdad (hoy: consumos con tarjeta repartidos en varias filas).
--
-- No hace falta backfill: al aplicarla existe un solo caso, el del 18-ago-2026.
--
-- Nota: el bot puede escribir esta columna ANTES de que la migración esté aplicada sin
-- romper nada — `bot_insert_json` (migración 071) inserta solo las claves que existan
-- como columna y descarta el resto en silencio.

alter table gastos          add column if not exists consumo_id uuid;
alter table retiros_socios  add column if not exists consumo_id uuid;
alter table cuotas_tarjeta  add column if not exists consumo_id uuid;

comment on column gastos.consumo_id is
  'Agrupa las filas nacidas de un mismo pago/consumo compartido. NULL = fila suelta.';
comment on column retiros_socios.consumo_id is
  'Agrupa las filas nacidas de un mismo pago/consumo compartido. NULL = fila suelta.';
comment on column cuotas_tarjeta.consumo_id is
  'Mismo consumo_id que el movimiento que la originó. NULL = cuota de un consumo simple.';

-- Índices parciales: la enorme mayoría de las filas tiene NULL y no hace falta indexarlas.
create index if not exists idx_gastos_consumo    on gastos(consumo_id)         where consumo_id is not null;
create index if not exists idx_retiros_consumo   on retiros_socios(consumo_id) where consumo_id is not null;
create index if not exists idx_cuotas_consumo    on cuotas_tarjeta(consumo_id) where consumo_id is not null;
