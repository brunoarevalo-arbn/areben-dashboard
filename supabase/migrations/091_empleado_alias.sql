-- ============================================================
-- Migración 091: alias bancario del empleado
-- ============================================================
-- Para los adelantos de sueldo (un cliente mayorista le transfiere directo al empleado), lo que se
-- le pasa al cliente es casi siempre el ALIAS, no el CBU (Darío, 28-sep-2026: "hoy en día el CBU
-- es algo prácticamente secundario"). El Monitor lo lee por `/api/puente/adelantos`.
-- ============================================================

alter table empleados add column if not exists alias text;

comment on column empleados.alias is
  'Alias bancario del empleado. Es lo que el Monitor le pasa al cliente que le transfiere un adelanto de sueldo.';
