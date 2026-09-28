-- ============================================================
-- Migración 090: pagos que vienen de un ADELANTO de sueldo anotado en el Monitor
-- ============================================================
-- Un cliente mayorista le transfiere directo a un empleado ANTES de que se liquide su sueldo.
-- Mientras no hay liquidación, eso vive sólo en el Monitor (tabla `compromisos_pago`, origen
-- 'empleado'): acá no se escribe nada, a propósito — liquidan el día 1 y un pago suelto sin
-- nómina a la que colgarse ensucia el ledger.
--
-- Cuando la nómina existe, el adelanto se engancha como un pago parcial de NOMINA con la fecha
-- real de la transferencia (`lib/adelantos.ts`). Esta columna dice de qué adelanto salió.
--
-- 🔑 **Lo aplicado NO se guarda en el Monitor: se cuenta acá**, sumando los pagos con este id.
-- Así, borrar la liquidación (que borra sus pagos de adelanto) devuelve el adelanto a pendiente
-- sin avisarle nada a nadie, y lo que sobró de un mes queda solo para el siguiente.
--
-- ⚠️ No es único: un adelanto que no entró entero en un sueldo sigue en el del mes siguiente, y
-- son dos pagos con el mismo id (uno por nómina).
-- ============================================================

alter table pagos add column if not exists adelanto_id uuid;

comment on column pagos.adelanto_id is
  'El operacion_id del compromiso del Monitor (origen empleado) del que salió este pago de nómina. NULL = no vino de un adelanto.';

create index if not exists idx_pagos_adelanto on pagos (adelanto_id) where adelanto_id is not null;
