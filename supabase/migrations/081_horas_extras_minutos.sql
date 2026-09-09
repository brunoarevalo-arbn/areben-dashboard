-- Migración 081: horas extras con minutos, no sólo horas enteras.
--
-- Lo pidió Bruno: alguien que se quedó veinte minutos no tenía cómo cargarlos. El link del
-- empleado exigía 0,25 h (quince minutos) como mínimo y el campo era "cuántas horas".
--
-- Adentro se sigue guardando en HORAS DECIMALES: es lo que hablan `valor_hora`,
-- `nomina_mensual.horas_extras` y el motor de `lib/calc/nomina.ts`. Cambiar la unidad del dato
-- sería tocar la nómina entera. Lo que cambia acá es el PISO y la PRECISIÓN.
--
-- ⚠️ La precisión no es un detalle: 20 minutos son 0,3333… horas. Con `numeric(6,2)` cada carga
-- se guardaba como 0,33 y tres de esas sumaban 0,99 h — la pantalla decía "59 min" por una hora
-- trabajada. Con 4 decimales el minuto entra y vuelve a salir entero.

-- ── 1. Precisión: 4 decimales donde vive una cantidad de horas ───────────────
-- Se ensancha, no se corta: `numeric(8,4)` mantiene los 4 dígitos enteros de `numeric(6,2)`.
alter table horas_extras_registros alter column cantidad type numeric(8,4);

-- 🔴 `nomina_mensual.horas_extras` NO se puede tocar de frente: Postgres contesta
-- "cannot alter type of a column used by a view or rule" porque `v_nominas_con_empleado`
-- (migración 021) la expone. Se la baja, se cambia el tipo y se la vuelve a crear tal cual
-- estaba. Todo dentro de la misma transacción del script de migraciones, así que no hay un
-- instante en que la vista no exista.
drop view if exists v_nominas_con_empleado;

alter table nomina_mensual alter column horas_extras type numeric(8,4);

-- ⚠️ Las columnas van UNA POR UNA y no `n.*` a propósito. La 021 la creó con `n.*`, pero un
-- `*` se expande AL CREARLA: desde entonces `nomina_mensual` sumó 13 columnas (ausencias, bono,
-- descuento_otro…) que la vista viva NO tiene. Recrearla con `*` le agregaría esas 13 de
-- arrastre, y esta migración vino a cambiar un tipo, no la forma de una vista de otro.
create view v_nominas_con_empleado as
select
  n.id, n.empleado_id, n.mes, n.sueldo_basico, n.horas_trabajadas, n.valor_hora,
  n.horas_extras, n.comida, n.aguinaldo, n.aportes_empleado, n.aportes_patronales,
  n.subtotal, n.neto, n.costo_empresa, n.estado, n.notas, n.created_at, n.updated_at,
  n.porcentaje_extras, n.monto_recibo_oficial, n.adicional_no_registrado, n.valor_hora_real,
  n.aguinaldo_provisionado, n.asistencia_completa, n.presentismo_monto,
  n.aguinaldo_pagado_de_caja, n.fecha_programada_pago, n.gasto_pendiente_id,
  e.nombre        as empleado_nombre,
  e.apellido      as empleado_apellido,
  e.dni           as empleado_dni,
  e.tipo_empleado as empleado_tipo
from nomina_mensual n
left join empleados e on e.id = n.empleado_id;

-- Los mismos permisos que le puso la 021 (la lee el home por PostgREST). El resto de los
-- privilegios que tenía los repone solo el `alter default privileges` de Supabase.
grant select on v_nominas_con_empleado to anon, authenticated, service_role;

-- ── 2. El piso baja de 15 minutos a 1 ───────────────────────────────────────
-- Misma firma que la migración 077: `create or replace` conserva los GRANT a `anon`.
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

  -- El piso es "que redondee a por lo menos un minuto", la misma cuenta que `horasAMinutos`
  -- en lib/horas.ts. Escrito como un rango de horas quedaría un 0,0166… que nadie puede leer.
  if p_cantidad is null or round(p_cantidad * 60) < 1 or p_cantidad > 12 then
    raise exception 'El tiempo tiene que estar entre 1 minuto y 12 horas.';
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
    -- En minutos: con 20 minutos cargados, "0.33 hs" no le dice nada a nadie.
    raise exception 'Ese día ya tenés % minutos cargados. No se puede pasar de 12 horas en un mismo día.',
      round(v_del_dia * 60);
  end if;

  insert into horas_extras_registros (empleado_id, fecha, cantidad, porcentaje, notas, estado, origen)
  values (v_emp_id, p_fecha, p_cantidad, 30, nullif(btrim(coalesce(p_notas, '')), ''), 'PENDIENTE', 'EMPLEADO')
  returning id into v_id;

  return v_id;
end;
$$;

comment on function horas_cargar_por_token is
  'Carga una hora extra desde el link personal. Nace PENDIENTE: no se paga hasta que alguien la '
  'apruebe. Mínimo 1 minuto (mig 081), máximo 12 horas por día.';

-- Idempotente: `create or replace` los conserva, pero re-correr la migración sobre una base
-- donde la función se recreó a mano no puede dejarla sin permisos.
revoke execute on function horas_cargar_por_token(text, date, numeric, text) from public;
grant  execute on function horas_cargar_por_token(text, date, numeric, text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';
