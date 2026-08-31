-- Migración 080: a qué cuenta se le transfiere a cada acreedor
--
-- Problema: hoy el acreedor NO existe como ficha y en ningún lado hay datos bancarios suyos.
-- Cuando hay que mandarle plata al contador o al abogado, el CBU se busca en un chat o se lo
-- pide de nuevo. Peor: se le va a pedir a un cliente que debe plata que transfiera DIRECTO a
-- esa cuenta (una transferencia cancela dos deudas), y para eso el dato tiene que estar a mano
-- y ser confiable, no de memoria.
--
-- Los datos bancarios que ya existen no sirven para esto:
--   - `empleados.cbu` es del empleado y está vacío en los 11.
--   - `cuentas_bancarias` son las cuentas NUESTRAS, de donde sale la plata.
--   - los proveedores no tienen ninguna.
-- Falta la contraria: la cuenta AJENA a la que entra la plata.
--
-- Solución: una tabla propia, colgada del maestro `proveedores` (el mismo que ya usa la cuenta
-- corriente de acreedores desde la migración 079). No se agregan columnas a `proveedores`
-- porque son VARIAS cuentas por persona, no una:
--   - el contador cobra una parte en su cuenta y otra en la del estudio;
--   - el titular muchas veces NO es el acreedor (la cuenta de la esposa, la del estudio);
--   - cuando cambia un CBU, el viejo se archiva en vez de pisarse, así el mes que viene se
--     puede seguir leyendo a dónde se transfirió el mes pasado.
--
-- Una queda marcada como `sugerida`: es la que la pantalla ofrece primero y la que va a
-- proponer el Monitor. Las demás siguen disponibles para elegir a mano.
--
-- ⚠️ No mueve un peso: acá no hay montos ni saldos. Es una libreta de direcciones.

create table if not exists acreedor_cuentas (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references proveedores(id) on delete cascade,

  -- A dónde va la plata. Con el alias alcanza para transferir; el CBU es el respaldo
  -- (los alias se pueden soltar y reasignar, el CBU no).
  alias         text,
  cbu           text,
  banco         text,
  -- A nombre de quién está la cuenta. Se guarda aparte del acreedor a propósito: el home
  -- banking muestra ESTE nombre al confirmar, y si no coincide con lo que uno espera, frena.
  titular       text,

  -- La que se ofrece primero. Una sola por acreedor (ver el índice único de abajo).
  sugerida      boolean not null default false,
  -- Una cuenta que dejó de usarse se archiva, no se borra: los pagos viejos se siguen leyendo.
  activa        boolean not null default true,

  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Una cuenta sin alias NI CBU no sirve para transferir.
  constraint acreedor_cuentas_destino_no_vacio
    check (nullif(btrim(coalesce(alias, '')), '') is not null
        or nullif(btrim(coalesce(cbu,   '')), '') is not null),

  -- CBU y CVU son 22 dígitos exactos. La app guarda solo números (saca espacios y guiones);
  -- esto es la red por si algún día se escribe desde otro lado.
  constraint acreedor_cuentas_cbu_formato
    check (cbu is null or cbu ~ '^[0-9]{22}$')
);

comment on table acreedor_cuentas is
  'Cuentas bancarias AJENAS: a dónde transferirle a cada acreedor. No tiene montos.';
comment on column acreedor_cuentas.titular is
  'A nombre de quién está la cuenta. Puede no ser el acreedor (el estudio, la esposa).';
comment on column acreedor_cuentas.sugerida is
  'La que se ofrece primero. Una sola por acreedor entre las activas.';
comment on column acreedor_cuentas.activa is
  'false = archivada. No se borra para poder leer a dónde se transfirió antes.';

create index if not exists idx_acreedor_cuentas_proveedor
    on acreedor_cuentas (proveedor_id) where activa;

-- Una sola sugerida por acreedor. Las archivadas no compiten.
create unique index if not exists idx_acreedor_cuentas_sugerida
    on acreedor_cuentas (proveedor_id) where sugerida and activa;

-- El mismo CBU cargado dos veces para la misma persona es siempre un error de carga.
create unique index if not exists idx_acreedor_cuentas_cbu_unico
    on acreedor_cuentas (proveedor_id, cbu) where cbu is not null;

-- RLS: igual que el resto del sistema, cualquiera que esté logueado.
alter table acreedor_cuentas enable row level security;
drop policy if exists "authenticated_all" on acreedor_cuentas;
create policy "authenticated_all" on acreedor_cuentas for all to authenticated using (true) with check (true);

-- `updated_at` al día, con el mismo trigger que usa el resto del sistema (migración 001).
drop trigger if exists update_acreedor_cuentas_updated_at on acreedor_cuentas;
create trigger update_acreedor_cuentas_updated_at
  before update on acreedor_cuentas
  for each row execute function update_updated_at();
