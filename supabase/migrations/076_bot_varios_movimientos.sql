-- Migración 076: varios movimientos de un mismo mensaje, en UNA sola transacción
--
-- Problema: el bot de WhatsApp pasó a aceptar mensajes con varias líneas
-- ("Adelanto Dario 10000 + Adelanto Bruno 20000 + gasto Yeza 20000"), y cada línea
-- es una fila distinta. Con una llamada por línea, si la tercera falla quedan las dos
-- primeras cargadas: media carga que nadie ve hasta que no cierra el mes.
--
-- Es el mismo criterio de la 071 (compra + sus pagos, gasto/retiro + sus cuotas),
-- estirado a N movimientos: en plpgsql, si algo falla se revierte TODO.
--
-- Entrada: p_movs = [ { "tipo": "gasto"|"retiro", "fila": {...}, "cuotas": [...] }, ... ]
-- Salida:  [ { "tabla": "...", "id": "..." }, ... ] en el MISMO orden.
--          El bot guarda esa lista para que "deshacer" borre las N, no la última.
--
-- Reusa bot_insert_json de la 071: se insertan solo las claves que existan como
-- columna, así la función no se desactualiza cuando la app agrega campos.

create or replace function bot_crear_movimientos(p_movs jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_mov    jsonb;
  v_cuota  jsonb;
  v_id     uuid;
  v_tabla  text;
  v_origen text;
  v_out    jsonb := '[]'::jsonb;
begin
  if p_movs is null or jsonb_typeof(p_movs) <> 'array' or jsonb_array_length(p_movs) = 0 then
    raise exception 'bot_crear_movimientos: no vino ningún movimiento';
  end if;

  for v_mov in select * from jsonb_array_elements(p_movs)
  loop
    if v_mov->>'tipo' = 'gasto' then
      v_tabla := 'gastos';          v_origen := 'GASTO';
    elsif v_mov->>'tipo' = 'retiro' then
      v_tabla := 'retiros_socios';  v_origen := 'MANUAL';
    else
      raise exception 'bot_crear_movimientos: tipo inválido %', v_mov->>'tipo';
    end if;

    v_id := bot_insert_json(v_tabla, v_mov->'fila');

    -- Si el pago fue con tarjeta, cada movimiento se lleva SU parte de las cuotas.
    -- Sumadas dan el consumo real, que es lo que mira la conciliación del resumen.
    for v_cuota in select * from jsonb_array_elements(coalesce(v_mov->'cuotas', '[]'::jsonb))
    loop
      perform bot_insert_json(
        'cuotas_tarjeta',
        v_cuota || jsonb_build_object('origen_id', v_id, 'origen_tipo', v_origen)
      );
    end loop;

    v_out := v_out || jsonb_build_array(jsonb_build_object('tabla', v_tabla, 'id', v_id));
  end loop;

  return v_out;
end;
$$;

comment on function bot_crear_movimientos is
  'Crea N gastos/retiros (con sus cuotas de tarjeta) en una sola transacción. Devuelve [{tabla,id}] en orden. Uso del bot de WhatsApp.';
