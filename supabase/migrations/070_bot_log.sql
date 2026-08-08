-- Migración 070: bitácora del bot de WhatsApp + CUIT de proveedores
--
-- 1) bot_log: una fila por CADA mensaje que procesa el bot, con qué entendió,
--    qué hizo y en qué terminó. Sirve para dos cosas:
--      - auditoría mensual: qué se cargó, desde qué mensaje y con qué criterio.
--      - detectar movimientos a medias: si la ejecución muere después de escribir,
--        la fila queda en PROCESANDO y salta en la revisión.
--
-- 2) proveedores.cuit: permite cruzar los cheques emitidos con su proveedor por CUIT
--    (el beneficiario del cheque es una persona física y no coincide con el nombre
--    del proveedor: "SUPPO, MARCOS DAMIAN" vs "SUMA Accesorios de Celulares").

create table if not exists bot_log (
  id              uuid primary key default gen_random_uuid(),
  creado_at       timestamptz not null default now(),

  -- de dónde vino
  ejecucion       text,          -- nro de ejecución de n8n (para rastrear el detalle técnico)
  remitente       text,          -- número de WhatsApp
  persona         text,          -- Bruno / Dario
  tipo_entrada    text,          -- texto | documento | imagen
  mensaje         text,          -- el texto original (o el epígrafe del adjunto)

  -- qué entendió y qué decidió
  interpretacion  jsonb,         -- salida cruda de la IA
  accion          text,          -- gasto | retiro | compra | tarjeta | emitir | preguntar | undo | ...
  ruta            text,          -- interpret | commit | cancel | edit | pdf | ...

  -- en qué terminó
  estado          text not null default 'PROCESANDO',  -- PROCESANDO | CONFIRMAR | OK | CANCELADO
  tabla_destino   text,          -- gastos | retiros_socios | compras | pagos | cuotas_tarjeta
  registro_id     uuid,          -- id de la fila creada
  monto           numeric(15,2),
  respuesta       text           -- lo que contestó el bot
);

comment on table  bot_log is 'Bitácora del bot de WhatsApp: un renglón por mensaje procesado.';
comment on column bot_log.estado is
  'PROCESANDO = entró y todavía no cerró (si queda así, la carga se cortó a mitad). '
  'CONFIRMAR = esperando el Sí del usuario. OK = registrado. CANCELADO = descartado por el usuario.';

create index if not exists idx_bot_log_creado on bot_log (creado_at desc);
create index if not exists idx_bot_log_estado on bot_log (estado);
create index if not exists idx_bot_log_registro on bot_log (registro_id);

alter table proveedores add column if not exists cuit text;
comment on column proveedores.cuit is 'CUIT del proveedor. Se usa para vincular cheques emitidos por su beneficiario.';
create index if not exists idx_proveedores_cuit on proveedores (cuit);
