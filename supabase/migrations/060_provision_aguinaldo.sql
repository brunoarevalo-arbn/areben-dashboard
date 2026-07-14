-- ============================================================
-- Migración 060: Provisión de aguinaldo (caja de aguinaldo)
-- ============================================================
-- Cada mes la nómina provisiona aguinaldo (aguinaldo_provisionado). Antes moría
-- en la fila de nómina. Ahora:
--  (a) genera un gasto DEVENGADO (categoría "Provisión Aguinaldo") → figura en Gastos
--      como costo del mes, sin salida de caja.
--  (b) se acumula como pasivo "Provisión aguinaldo" (cuenta patrimonial PROVISION,
--      signo_pn=-1), sintetizado en el cierre desde nomina_mensual.
-- Arranca en julio-2026 (mes_inicial 2026-06 → cuenta desde 2026-07). Mayo/junio no cambian.

-- 1. Link nómina → gasto de provisión de aguinaldo
ALTER TABLE nomina_mensual
  ADD COLUMN IF NOT EXISTS gasto_provision_aguinaldo_id UUID REFERENCES gastos(id) ON DELETE SET NULL;

-- 2. Cuenta patrimonial "Provisión aguinaldo" (pasivo devengado). Idempotente.
INSERT INTO cuentas_patrimoniales (nombre, tipo, moneda, signo_pn, saldo_inicial, mes_inicial, activo, notas)
SELECT 'Provisión aguinaldo', 'PROVISION', 'ARS', -1, 0, '2026-06', TRUE,
       'Caja de aguinaldo. Se sintetiza en el cierre: Σ (aguinaldo_provisionado − aguinaldo_pagado_de_caja) de nomina_mensual desde 2026-07.'
WHERE NOT EXISTS (
  SELECT 1 FROM cuentas_patrimoniales WHERE tipo = 'PROVISION' AND nombre ILIKE '%aguinaldo%'
);
