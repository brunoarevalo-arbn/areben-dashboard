-- ============================================================
-- Migración 014: Cuentas de inventario (compensación dinámica)
-- ============================================================

-- Permitir el nuevo tipo INVENTARIO en cuentas patrimoniales
ALTER TABLE cuentas_patrimoniales DROP CONSTRAINT IF EXISTS cuentas_patrimoniales_tipo_check;
ALTER TABLE cuentas_patrimoniales ADD CONSTRAINT cuentas_patrimoniales_tipo_check
  CHECK (tipo IN (
    'INVENTARIO',
    'INVERSION', 'PROVISION', 'CTA_CTE_MARCA',
    'PASIVO_ROTATIVO', 'IMPOSITIVO', 'OTRO_ACTIVO', 'OTRO_PASIVO'
  ));

-- Auto-crear las 3 cuentas de inventario por marca si no existen
INSERT INTO cuentas_patrimoniales (codigo, nombre, tipo, categoria, marca, moneda, signo_pn, saldo_inicial, orden, activo)
VALUES
  ('INV-BDI', 'Inventario BDI', 'INVENTARIO', 'inventario', 'BDI', 'ARS', 1, 0, 1, TRUE),
  ('INV-ZTT', 'Inventario ZATTIA', 'INVENTARIO', 'inventario', 'ZATTIA', 'ARS', 1, 0, 2, TRUE),
  ('INV-STN', 'Inventario STUNNED', 'INVENTARIO', 'inventario', 'STUNNED', 'ARS', 1, 0, 3, TRUE)
ON CONFLICT DO NOTHING;
