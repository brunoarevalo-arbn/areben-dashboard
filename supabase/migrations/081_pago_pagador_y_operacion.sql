-- Migración 081: quién pagó, y de qué operación salió el pago
--
-- Contexto: el mayor de cuentas (~/Bruno/areben-planteo-mayor-cuentas.md). A un cliente mayorista
-- que nos debe plata se le pide que transfiera DIRECTO a la cuenta del contador o del abogado: con
-- una transferencia se cancelan las dos deudas. Cuando eso pasa, el Monitor le avisa al dashboard
-- para que el pago quede registrado.
--
-- ── 1. El pagador ────────────────────────────────────────────────────────────
--
-- Hoy quién pagó vive en `notas` como texto libre ("Nazarena Luciani - BDI Mayorista"). Sirve para
-- LEERLO y nada más: no se puede agrupar por cliente, ni contestar "¿cuánto nos pagó éste?", ni
-- cruzarlo con su deuda en Gestión Nube. Son 63 pagos de gastos con esa nota escrita a mano.
--
-- Van DOS columnas y no una porque son dos cosas distintas:
--   `pagador_cliente_id` es el id del cliente en Gestión Nube — para agrupar y cruzar.
--   `pagador_nombre`     es a nombre de quién salió la transferencia, que muchas veces NO es el
--                        cliente (la mujer, el hermano, la razón social). Es lo que se ve en el
--                        extracto del banco, y es lo que hace falta para conciliar.
--
-- ⛔ `pagador_cliente_id` va SIN foreign key a propósito: los clientes viven en Gestión Nube, que
-- es otro sistema. Una FK a una tabla que no existe acá no se puede escribir, y copiar el padrón
-- de clientes para poder ponerla sería traer un problema mucho más grande que el que resuelve.
-- Es una referencia blanda entre sistemas: si el id no existe allá, el nombre igual queda escrito.
--
-- ✅ Ninguna fecha nueva. `fecha_emision` es cuándo transfirió el cliente y `fecha_debito` sale
-- igual por instrumento; el mes de imputación lo sigue diciendo el gasto.
--
-- ── 2. La operación ──────────────────────────────────────────────────────────
--
-- Un cobro así se parte en VARIOS pagos: la plata se imputa del concepto más viejo al más nuevo, y
-- cada renglón nace como un pago propio en el ledger (`registrarPagoRepartido`). `operacion_id` es
-- lo que dice que esos N pagos salieron de la MISMA transferencia. Mismo patrón que `consumo_id`
-- de la migración 078.
--
-- NULL = pago cargado a mano desde el dashboard, que es el caso normal y va a seguir siéndolo.

alter table pagos add column if not exists pagador_cliente_id text;
alter table pagos add column if not exists pagador_nombre     text;
alter table pagos add column if not exists operacion_id       uuid;

comment on column pagos.pagador_cliente_id is
  'Id del cliente en Gestión Nube que hizo la transferencia. SIN FK: es otro sistema. NULL = lo pagamos nosotros.';
comment on column pagos.pagador_nombre is
  'A nombre de quién salió la transferencia. Puede no ser el cliente (la mujer, la razón social).';
comment on column pagos.operacion_id is
  'Agrupa los pagos nacidos de una misma transferencia informada por el Monitor. NULL = carga manual.';

-- Índices parciales: la enorme mayoría de los pagos tiene NULL en las tres y no hace falta indexarlos.
create index if not exists idx_pagos_pagador   on pagos (pagador_cliente_id) where pagador_cliente_id is not null;
create index if not exists idx_pagos_operacion on pagos (operacion_id)       where operacion_id is not null;

-- ── 3. El candado contra el pago duplicado ───────────────────────────────────
--
-- 🔴 Esto NO es opcional. `registrarPagoRepartido` **no es transaccional**: escribe un pago por
-- renglón y, si uno falla, corta y deja aplicados los anteriores (a propósito: son pagos reales).
-- Con un llamador remoto eso se vuelve peligroso, porque un reintento —el celular sin señal, el
-- botón apretado dos veces, un timeout de red que igual llegó— duplicaría los renglones que sí
-- habían entrado. Y un pago duplicado no se ve raro: se ve como un pago.
--
-- Por eso la operación se ANOTA ANTES de escribir un solo peso, con el id como clave primaria. El
-- segundo intento choca contra la clave y no llega a la base de pagos: se le devuelve lo que pasó
-- la primera vez. Un chequeo del tipo "¿ya existe?" antes de insertar no alcanzaría — dos pedidos
-- simultáneos pasarían los dos.
--
-- `resultado` guarda los ids de los pagos creados y cómo se repartió: es la trazabilidad que el
-- Monitor archiva en el compromiso, y lo que permite contestar el reintento sin recalcular nada.
create table if not exists puente_operaciones (
  operacion_id  uuid primary key,
  recurso       text not null,
  -- Qué se pidió y qué se hizo. Sirve para reconstruir una operación que quedó a mitad de camino.
  pedido        jsonb,
  resultado     jsonb,
  -- EN_CURSO = entró y todavía no cerró. Si queda así, la escritura se cortó a mitad y hay que
  -- mirarla a mano: es el mismo criterio que `bot_log.estado` (migración 070).
  estado        text not null default 'EN_CURSO',
  error         text,
  -- Quién lo pidió, según lo afirma el Monitor. ⚠️ El dashboard no lo verifica: confía en que el
  -- Monitor validó a la persona contra el padrón antes de llamar.
  pedido_por    text,
  creado_at     timestamptz not null default now(),
  cerrado_at    timestamptz,
  constraint puente_operaciones_estado
    check (estado in ('EN_CURSO', 'OK', 'ERROR'))
);

comment on table puente_operaciones is
  'Candado de idempotencia de la puerta de servicio: una fila por operación, anotada ANTES de escribir.';

create index if not exists idx_puente_operaciones_abiertas
    on puente_operaciones (creado_at) where estado = 'EN_CURSO';

alter table puente_operaciones enable row level security;
drop policy if exists "authenticated_all" on puente_operaciones;
create policy "authenticated_all" on puente_operaciones for all to authenticated using (true) with check (true);
