-- Migración 082: separar QUIÉN DEBE de QUIÉN TRANSFIRIÓ
--
-- Planteado por Darío el 3-sep-2026, mirando el circuito antes de usarlo en serio:
--
--   > "la promesa es del cliente, no de quien paga. Al momento de generar en el ledger, que sí
--   >  vincule y deje anotado el nombre del cliente y la persona que transfirió, para tener un
--   >  mayor seguimiento. Si el día de mañana el acreedor comenta que no ha recibido el pago, la
--   >  vinculación es muy sencilla con ambos datos."
--
-- Tiene razón, y la 081 lo modeló mal: dejó DOS columnas para TRES datos.
--
--   `pagador_cliente_id`  el id del cliente en Gestión Nube
--   `pagador_nombre`      "a nombre de quién salió la transferencia"  ← acá estaba el problema
--
-- Con eso, **el nombre del cliente no llega nunca**: llega su id, y el dashboard no lo puede
-- resolver porque los clientes viven en Gestión Nube (por eso el nombre se copia, es el mismo
-- criterio de `acreedor_nombre`). Si la transferencia la mandó el novio, el pago quedaba con el
-- nombre del novio, el id de la clienta y ninguna forma de leer de quién era la deuda.
--
-- Y son las dos preguntas que se hacen cuando algo no cierra, no una:
--   *"¿de qué cliente era esta plata?"*  → se contesta con el nombre del cliente.
--   *"¿de quién es este movimiento del extracto?"* → se contesta con el del que transfirió.
--
-- ── Lo que cambia ────────────────────────────────────────────────────────────
--
--   `pagador_nombre`   pasa a ser SIEMPRE el nombre del CLIENTE (de quién era la deuda).
--   `pagador_titular`  NUEVA: a nombre de quién salió la transferencia, cuando NO es el cliente.
--
-- 🔑 **`pagador_titular` NULL significa "transfirió el cliente"**, que es el caso más común. No se
-- repite el nombre en las dos columnas: repetirlo obligaría a compararlas para saber si hubo un
-- tercero, y "hay un tercero" es justo lo que se quiere ver de un vistazo.
--
-- ⛔ Y va como COLUMNA, no adentro de `notas`. Es la misma regla que justificó la 081: en `notas`
-- sirve para leerlo y nada más. Acá se cruza de verdad — llega un "Juan Pérez $120.000" al
-- extracto que no le cierra a nadie, y encontrarlo es una consulta por este campo.
--
-- ── Por qué no hay backfill ──────────────────────────────────────────────────
--
-- ✅ Medido el 3-sep-2026 contra producción, antes de escribir esto: de 446 pagos en el ledger,
-- **0 tienen `pagador_nombre`** y 0 tienen `pagador_cliente_id`. El circuito está construido pero
-- todavía no registró ni un pago. Por eso `pagador_nombre` puede cambiar de significado sin
-- convivir con filas viejas que quieran decir la otra cosa: no existen. Si esta migración se
-- demoraba hasta tener movimiento, había que elegir entre migrar a mano o vivir con dos sentidos.
--
-- ⛔ Correr a mano en el SQL Editor de Supabase. Idempotente.

alter table pagos add column if not exists pagador_titular text;

comment on column pagos.pagador_nombre is
  'Nombre del CLIENTE de quién era la deuda (su id va en pagador_cliente_id, que el dashboard no puede resolver solo).';
comment on column pagos.pagador_titular is
  'A nombre de quién salió la transferencia, cuando NO es el cliente (la mujer, el socio, la razón social). NULL = transfirió el cliente.';

-- Parcial: la enorme mayoría de los pagos no tiene un tercero, y buscar por acá es justamente
-- buscar la excepción — el nombre raro del extracto.
create index if not exists idx_pagos_pagador_titular
    on pagos (pagador_titular) where pagador_titular is not null;
