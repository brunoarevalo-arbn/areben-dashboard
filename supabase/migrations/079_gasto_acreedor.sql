-- Migración 079: a quién se le debe cada gasto (cuenta corriente de acreedores)
--
-- Problema: con algunos proveedores de servicios la relación no es "una factura, un
-- vencimiento, un pago", sino una cuenta corriente: se les devenga un abono mensual más
-- trabajos sueltos, y se les manda plata cuando hay, sin fecha estipulada. Lo que importa
-- es que el saldo dé cero, no que cada gasto tenga su fecha.
--
-- Hoy cada gasto vive suelto y cada pago se aplica a un gasto puntual, así que no hay forma
-- de ver cuánto se le debe a UNA persona en total. El caso testigo: el abogado tiene el abono
-- mensual y, aparte, los honorarios de un litigio; Bruno lleva la cuenta a mano y no le cierra.
--
-- Solución: un vínculo opcional al acreedor, reutilizando el maestro `proveedores` (el mismo
-- que usan las compras) en vez de crear una tabla nueva. La cuenta corriente pasa a ser una
-- LECTURA de lo que ya está cargado — gastos por un lado, `pagos` por el otro — y no un
-- registro paralelo.
--
-- ⚠️ Por qué NO va en `cc_cuentas` / `cc_movimientos`: ese módulo es para deudas que NO tienen
-- un gasto detrás. Si el abogado se cargara ahí, la deuda se contaría dos veces en el cierre
-- (el gasto pendiente ya aporta el pasivo, y la CC manual aportaría el mismo importe de nuevo).
--
-- Esta migración NO toca el cierre de mes: el pasivo lo siguen aportando los gastos pendientes
-- exactamente como hoy. La pantalla nueva solo agrupa y muestra.

-- ── 1. La columna en gastos ──────────────────────────────────────────────────
alter table gastos add column if not exists proveedor_id uuid references proveedores(id) on delete set null;

comment on column gastos.proveedor_id is
  'Acreedor del gasto (maestro `proveedores`). NULL = gasto sin cuenta corriente, que es el caso normal.';

-- Índice parcial: la enorme mayoría de los gastos tiene NULL y no hace falta indexarlos.
create index if not exists idx_gastos_proveedor on gastos(proveedor_id) where proveedor_id is not null;

-- ── 2. La misma columna en los recurrentes ───────────────────────────────────
-- El abono mensual del abogado nace de un recurrente. Sin esto habría que etiquetar a mano el
-- gasto de cada mes; con esto, el gasto que se genera hereda el acreedor de su plantilla.
alter table gastos_recurrentes add column if not exists proveedor_id uuid references proveedores(id) on delete set null;

comment on column gastos_recurrentes.proveedor_id is
  'Acreedor que hereda cada gasto generado desde este recurrente. NULL = sin cuenta corriente.';

-- ── 3. Alta de los dos acreedores reales ─────────────────────────────────────
-- Son proveedores de SERVICIOS: no se les compra mercadería, así que van sin marcas.
insert into proveedores (nombre, tipo, pais, moneda, activo, notas)
select 'Santiago Gómez (abogado)', 'NACIONAL', 'Argentina', 'ARS', true,
       'Acreedor de servicios: abono mensual + honorarios por litigio. Se le paga a cuenta, sin fecha fija.'
where not exists (select 1 from proveedores where nombre = 'Santiago Gómez (abogado)');

insert into proveedores (nombre, tipo, pais, moneda, activo, notas)
select 'Joaquín Bolívar (contador)', 'NACIONAL', 'Argentina', 'ARS', true,
       'Acreedor de servicios: honorarios mensuales. Se cancelan con varias transferencias sueltas.'
where not exists (select 1 from proveedores where nombre = 'Joaquín Bolívar (contador)');

-- ── 4. Backfill de lo que ya está cargado ────────────────────────────────────
-- Por concepto EXACTO, no por `like`: existe también "Honorarios abogado contraparte - litigio
-- laboral", que es el abogado DE ENFRENTE y no tiene nada que ver con esta cuenta corriente.
update gastos g
   set proveedor_id = p.id
  from proveedores p
 where p.nombre = 'Santiago Gómez (abogado)'
   and g.proveedor_id is null
   and g.concepto in (
     'Abogado - Santiago Gomez',
     'Honorarios abogado Santiago Gómez - litigio laboral'
   );

update gastos g
   set proveedor_id = p.id
  from proveedores p
 where p.nombre = 'Joaquín Bolívar (contador)'
   and g.proveedor_id is null
   and g.concepto = 'Contador - Joaquin Bolivar';

update gastos_recurrentes r
   set proveedor_id = p.id
  from proveedores p
 where p.nombre = 'Santiago Gómez (abogado)'
   and r.proveedor_id is null
   and r.concepto = 'Abogado - Santiago Gomez';

update gastos_recurrentes r
   set proveedor_id = p.id
  from proveedores p
 where p.nombre = 'Joaquín Bolívar (contador)'
   and r.proveedor_id is null
   and r.concepto = 'Contador - Joaquin Bolivar';
