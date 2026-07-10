-- ============================================================
-- Migración 054: Cuentas Corrientes (manuales) — deudas y créditos rotativos
-- ============================================================
-- Cuenta corriente "de verdad": una cuenta por persona/empresa con la que
-- tenemos saldo (clientes que nos deben, proveedores a los que debemos,
-- servicios, otros). A diferencia de la CC automática (que deriva de compras
-- y gastos), acá se cargan MOVIMIENTOS libres (deudas y pagos) sin necesidad
-- de una compra.
--
-- Naturaleza: 'COBRAR' (nos deben → activo corriente) o 'PAGAR' (les debemos → pasivo corriente).
-- Moneda: ARS o USD. Las cuentas USD se PESIFICAN al TC del mes en el cierre.
-- Un movimiento en pesos sobre una cuenta USD se DOLARIZA (monto_origen en $,
-- tc_aplicado, monto = equivalente en USD).
--
-- OJO: la deuda de los SOCIOS NO va acá — es grande e impagable a corto plazo
-- (activo NO corriente) → se queda en cuentas_patrimoniales.
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_cuentas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      VARCHAR(150) NOT NULL,
  tipo        VARCHAR(20)  NOT NULL DEFAULT 'OTRO'
              CHECK (tipo IN ('CLIENTE', 'PROVEEDOR', 'SERVICIO', 'OTRO')),
  naturaleza  VARCHAR(10)  NOT NULL DEFAULT 'COBRAR'
              CHECK (naturaleza IN ('COBRAR', 'PAGAR')),   -- nos deben / les debemos
  moneda      VARCHAR(3)   NOT NULL DEFAULT 'ARS'
              CHECK (moneda IN ('ARS', 'USD')),
  notas       TEXT,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  orden       INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cc_cuentas IS 'Cuentas corrientes manuales (clientes/proveedores/servicios/otros). naturaleza COBRAR=activo, PAGAR=pasivo. Moneda ARS/USD (USD pesifica al TC del mes en el cierre). Los socios NO van acá (van en cuentas_patrimoniales, activo no corriente).';

CREATE TABLE IF NOT EXISTS cc_movimientos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id     UUID NOT NULL REFERENCES cc_cuentas(id) ON DELETE CASCADE,
  fecha         DATE NOT NULL,
  mes           VARCHAR(7) NOT NULL,                 -- 'YYYY-MM' (para el cierre)
  tipo          VARCHAR(10) NOT NULL
                CHECK (tipo IN ('DEUDA', 'PAGO')),   -- DEUDA sube el saldo, PAGO lo baja
  concepto      TEXT,
  monto         NUMERIC(15,2) NOT NULL,              -- en la moneda de la cuenta (positivo)
  -- Si el movimiento se ingresó en otra moneda (ej. pesos sobre cuenta USD),
  -- se guarda el origen y el TC aplicado; monto queda ya convertido a la moneda de la cuenta.
  monto_origen  NUMERIC(15,2),
  moneda_origen VARCHAR(3) CHECK (moneda_origen IN ('ARS', 'USD')),
  tc_aplicado   NUMERIC(15,4),
  notas         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cc_movimientos IS 'Movimientos de una cuenta corriente. tipo DEUDA (+) / PAGO (−). saldo de la cuenta = Σ DEUDA − Σ PAGO (en la moneda de la cuenta). Si moneda_origen != moneda de la cuenta, monto ya viene convertido (dolarizado/pesificado) al tc_aplicado.';

CREATE INDEX IF NOT EXISTS idx_cc_mov_cuenta ON cc_movimientos (cuenta_id);
CREATE INDEX IF NOT EXISTS idx_cc_mov_mes ON cc_movimientos (mes);
CREATE INDEX IF NOT EXISTS idx_cc_cuentas_activo ON cc_cuentas (activo);

-- RLS
ALTER TABLE cc_cuentas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON cc_cuentas;
CREATE POLICY "authenticated_all" ON cc_cuentas FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE cc_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON cc_movimientos;
CREATE POLICY "authenticated_all" ON cc_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);
