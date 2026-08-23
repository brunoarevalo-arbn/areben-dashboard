-- Migración 077: horas extras cargadas por el propio empleado, con aprobación
--
-- Hasta hoy las horas extras las tipeaba siempre alguien de adentro (ficha del empleado
-- o líneas dentro de la liquidación). Acá se abre un link personal por empleado para que
-- cargue él mismo el día que las hace, y del otro lado queda una bandeja donde se aprueba
-- y se le pone el porcentaje.
--
-- Dos cuidados que explican el diseño:
--
-- 1) `estado` nace en 'APROBADA'. Todo lo ya cargado y todo lo que carga administración a
--    mano se sigue comportando EXACTAMENTE igual que hoy: entra solo a la liquidación.
--    Sólo lo que llega por el link nace 'PENDIENTE'.
--
-- 2) La página del empleado no tiene sesión. En vez de exponer la service-role key, escribe
--    por estas funciones `security definer` (mismo espíritu que `bot_insert_json`, mig 071),
--    con GRANT a `anon` y nada más: la única llave es el token, y lo único que se puede
--    hacer con él es PEDIR horas — sin aprobación no se paga nada.

-- ── 1. Estado y procedencia del registro ─────────────────────────────────────
alter table horas_extras_registros
  add column if not exists estado varchar(12) not null default 'APROBADA',
  add column if not exists origen varchar(10) not null default 'ADMIN',
  add column if not exists aprobado_por varchar(255),
  add column if not exists aprobado_at timestamptz,
  add column if not exists rechazo_motivo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'horas_extras_estado_check') then
    alter table horas_extras_registros add constraint horas_extras_estado_check
      check (estado in ('PENDIENTE','APROBADA','RECHAZADA'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'horas_extras_origen_check') then
    alter table horas_extras_registros add constraint horas_extras_origen_check
      check (origen in ('ADMIN','EMPLEADO'));
  end if;
end $$;

-- El default del porcentaje pasa de 50 a 30 (lo acordado con Bruno). No toca lo ya cargado.
alter table horas_extras_registros alter column porcentaje set default 30;

comment on column horas_extras_registros.estado is
  'PENDIENTE = la cargó el empleado y falta aprobarla. APROBADA = entra a la liquidación. '
  'RECHAZADA = no se paga. Sólo las APROBADA las mira la nómina.';
comment on column horas_extras_registros.origen is
  'ADMIN = la tipeó alguien de adentro (nace aprobada). EMPLEADO = llegó por el link personal.';

create index if not exists idx_horas_extras_estado on horas_extras_registros (estado, fecha);

-- ── 2. El token del link personal ────────────────────────────────────────────
alter table empleados
  add column if not exists token_horas text,
  add column if not exists token_horas_creado_at timestamptz;

comment on column empleados.token_horas is
  'Secreto del link personal de carga de horas extras (/horas/<token>). NULL = sin link. '
  'Revocar = ponerlo en NULL: el link viejo muere en el acto.';

create unique index if not exists idx_empleados_token_horas
  on empleados (token_horas) where token_horas is not null;

-- ── 3. Las tres funciones que usa la página sin sesión ───────────────────────
-- `hoy` se calcula en hora de Argentina, NO en UTC: si alguien carga a las 21:30 de un
-- martes, en UTC ya es miércoles y su propia fecha le daría "futura".

create or replace function horas_estado_por_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp   record;
  v_hoy   date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_regs  jsonb;
begin
  select id, nombre, apellido into v_emp
    from empleados
   where token_horas = p_token and activo = true;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(r order by r.fecha desc, r.created_at desc), '[]'::jsonb)
    into v_regs
    from (
      select id, fecha, cantidad, porcentaje, estado, notas, rechazo_motivo, created_at
        from horas_extras_registros
       where empleado_id = v_emp.id
         and fecha >= v_hoy - 60
    ) r;

  return jsonb_build_object(
    'nombre',    v_emp.nombre,
    'apellido',  v_emp.apellido,
    'hoy',       v_hoy,
    'registros', v_regs
  );
end;
$$;

comment on function horas_estado_por_token is
  'Todo lo que necesita la página /horas/<token>: el nombre y sus últimos 60 días de cargas. '
  'Devuelve NULL si el token no existe o el empleado está inactivo. No expone el empleado_id.';


create or replace function horas_cargar_por_token(
  p_token    text,
  p_fecha    date,
  p_cantidad numeric,
  p_notas    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp_id   uuid;
  v_hoy      date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_del_dia  numeric;
  v_id       uuid;
begin
  select id into v_emp_id from empleados where token_horas = p_token and activo = true;
  if not found then
    raise exception 'Este link ya no está activo. Pedile uno nuevo a administración.';
  end if;

  if p_cantidad is null or p_cantidad < 0.25 or p_cantidad > 12 then
    raise exception 'Las horas tienen que estar entre 0,25 y 12.';
  end if;

  if p_fecha is null or p_fecha > v_hoy then
    raise exception 'No se puede cargar una fecha que todavía no pasó.';
  end if;

  if p_fecha < v_hoy - 45 then
    raise exception 'Esa fecha ya pasó hace más de 45 días. Avisale a administración.';
  end if;

  select coalesce(sum(cantidad), 0) into v_del_dia
    from horas_extras_registros
   where empleado_id = v_emp_id and fecha = p_fecha and estado <> 'RECHAZADA';

  if v_del_dia + p_cantidad > 12 then
    raise exception 'Ese día ya tenés % hs cargadas. No se puede pasar de 12 en un mismo día.', v_del_dia;
  end if;

  insert into horas_extras_registros (empleado_id, fecha, cantidad, porcentaje, notas, estado, origen)
  values (v_emp_id, p_fecha, p_cantidad, 30, nullif(btrim(coalesce(p_notas, '')), ''), 'PENDIENTE', 'EMPLEADO')
  returning id into v_id;

  return v_id;
end;
$$;

comment on function horas_cargar_por_token is
  'Carga una hora extra desde el link personal. Nace PENDIENTE: no se paga hasta que alguien la apruebe.';


create or replace function horas_borrar_por_token(p_token text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp_id uuid;
  v_borradas int;
begin
  select id into v_emp_id from empleados where token_horas = p_token and activo = true;
  if not found then
    raise exception 'Este link ya no está activo. Pedile uno nuevo a administración.';
  end if;

  -- Sólo las propias y sólo mientras siguen en revisión: una vez aprobada o rechazada,
  -- el registro es la decisión de otro y el empleado no la puede borrar.
  delete from horas_extras_registros
   where id = p_id and empleado_id = v_emp_id and estado = 'PENDIENTE';
  get diagnostics v_borradas = row_count;

  if v_borradas = 0 then
    raise exception 'Esa carga ya no se puede borrar.';
  end if;

  return true;
end;
$$;

comment on function horas_borrar_por_token is
  'Borra una carga propia que sigue en revisión. Aprobada o rechazada, ya no.';

-- Sólo `anon` (la página sin sesión) y `authenticated`. Nadie más.
revoke execute on function horas_estado_por_token(text)                       from public;
revoke execute on function horas_cargar_por_token(text, date, numeric, text)  from public;
revoke execute on function horas_borrar_por_token(text, uuid)                 from public;

grant execute on function horas_estado_por_token(text)                        to anon, authenticated;
grant execute on function horas_cargar_por_token(text, date, numeric, text)   to anon, authenticated;
grant execute on function horas_borrar_por_token(text, uuid)                  to anon, authenticated;

NOTIFY pgrst, 'reload schema';
