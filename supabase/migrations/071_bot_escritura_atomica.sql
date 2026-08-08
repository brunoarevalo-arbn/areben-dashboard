-- Migración 071: escritura atómica para el bot de WhatsApp
--
-- Problema: el bot escribe en DOS pasos (compra → sus pagos, gasto/retiro → sus cuotas).
-- Si el segundo falla, el primero ya quedó guardado y el movimiento queda a medias.
-- Pasó en la vida real: un retiro con tarjeta se guardó sin sus cuotas.
--
-- Solución: estas funciones hacen las dos escrituras dentro de UNA transacción.
-- En plpgsql, si algo falla se revierte TODO automáticamente: o queda completo o no
-- queda nada. El bot pasa a llamar una función en vez de encadenar dos nodos.
--
-- Diseño: en vez de listar columna por columna (que se desactualiza cuando la app
-- agrega campos), se insertan exactamente las claves que vengan en el JSON y que
-- existan como columna en la tabla. Las que no vengan toman el valor por defecto
-- de la tabla, igual que hoy. Postgres convierte los tipos solo (fechas, enums,
-- numéricos) via jsonb_populate_record.

create or replace function bot_insert_json(p_tabla text, p_datos jsonb)
returns uuid
language plpgsql
as $$
declare
  v_cols text;
  v_id   uuid;
begin
  select string_agg(quote_ident(k), ', ')
    into v_cols
    from jsonb_object_keys(p_datos) as k
   where exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name   = p_tabla
        and c.column_name  = k
   );

  if v_cols is null then
    raise exception 'bot_insert_json: ningún campo válido para la tabla %', p_tabla;
  end if;

  execute format(
    'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning id',
    p_tabla, v_cols, v_cols, p_tabla
  ) using p_datos into v_id;

  return v_id;
end;
$$;

comment on function bot_insert_json is
  'Inserta en una tabla solo las claves presentes en el JSON que existan como columna. Uso interno del bot.';


-- ── COMPRA + SUS PAGOS (contado y/o cheques) ─────────────────────────────────
create or replace function bot_crear_compra(p_compra jsonb, p_pagos jsonb default '[]'::jsonb)
returns uuid
language plpgsql
as $$
declare
  v_compra_id uuid;
  v_pago      jsonb;
begin
  v_compra_id := bot_insert_json('compras', p_compra);

  for v_pago in select * from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb))
  loop
    perform bot_insert_json(
      'pagos',
      v_pago || jsonb_build_object('compra_id', v_compra_id, 'origen_id', v_compra_id)
    );
  end loop;

  return v_compra_id;
end;
$$;

comment on function bot_crear_compra is
  'Crea una compra y sus pagos en una sola transacción. Si falla un pago, no queda la compra.';


-- ── GASTO/RETIRO CON TARJETA + SUS CUOTAS ────────────────────────────────────
-- p_tipo: 'gasto' → tabla gastos (cuotas con origen GASTO)
--         'retiro' → tabla retiros_socios (cuotas con origen MANUAL, como venía haciendo el bot)
create or replace function bot_crear_movimiento_tarjeta(p_tipo text, p_fila jsonb, p_cuotas jsonb default '[]'::jsonb)
returns uuid
language plpgsql
as $$
declare
  v_id     uuid;
  v_tabla  text;
  v_origen text;
  v_cuota  jsonb;
begin
  if p_tipo = 'gasto' then
    v_tabla := 'gastos';  v_origen := 'GASTO';
  elsif p_tipo = 'retiro' then
    v_tabla := 'retiros_socios';  v_origen := 'MANUAL';
  else
    raise exception 'bot_crear_movimiento_tarjeta: tipo inválido %', p_tipo;
  end if;

  v_id := bot_insert_json(v_tabla, p_fila);

  for v_cuota in select * from jsonb_array_elements(coalesce(p_cuotas, '[]'::jsonb))
  loop
    perform bot_insert_json(
      'cuotas_tarjeta',
      v_cuota || jsonb_build_object('origen_id', v_id, 'origen_tipo', v_origen)
    );
  end loop;

  return v_id;
end;
$$;

comment on function bot_crear_movimiento_tarjeta is
  'Crea un gasto o retiro con tarjeta junto con sus cuotas, en una sola transacción.';
