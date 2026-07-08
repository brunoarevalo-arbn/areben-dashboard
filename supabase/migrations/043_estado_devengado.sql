-- 043 — Estado DEVENGADO para gastos financieros de inversión
--
-- El interés de inversión (generado al cerrar un período) es un COSTO DEVENGADO,
-- no una salida de caja: el inversor no cobra interés mensual, la caja se mueve
-- solo cuando retira capital. Antes nacía 'PENDIENTE' y se quedaba para siempre
-- en Tesorería como "por pagar" fantasma. Ahora nace 'DEVENGADO' y las vistas de
-- caja lo excluyen, pero sigue contando como costo en el cierre de mes.
--
-- IMPORTANTE: correr en Supabase SQL Editor en 2 pasos separados.
-- Postgres NO permite usar un valor de enum recién agregado en la misma
-- transacción en que se crea. Ejecutá el PASO 1, dale Run, y recién ahí el PASO 2.

-- ── PASO 1 ── Agregar el valor al enum (correr solo, luego Run) ────────────────
ALTER TYPE estado_gasto ADD VALUE IF NOT EXISTS 'DEVENGADO';

-- ── PASO 2 ── Migrar los intereses fantasma ya existentes (correr aparte) ──────
-- Solo los PENDIENTE auto-generados por cierre de inversión. Los que ya marcaste
-- PAGADO a mano quedan intactos.
-- UPDATE gastos
--   SET estado = 'DEVENGADO'
--   WHERE generado_desde = 'INVERSION_CIERRE'
--     AND estado = 'PENDIENTE';
