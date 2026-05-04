-- ============================================================
-- Migración 013: Cuentas patrimoniales (plan de cuentas)
-- ============================================================

CREATE TABLE IF NOT EXISTS cuentas_patrimoniales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50),
  nombre VARCHAR(150) NOT NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN (
    'INVERSION', 'PROVISION', 'CTA_CTE_MARCA',
    'PASIVO_ROTATIVO', 'IMPOSITIVO', 'OTRO_ACTIVO', 'OTRO_PASIVO'
  )),
  categoria VARCHAR(50),
  marca VARCHAR(20),
  moneda VARCHAR(3) NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS','USD')),
  signo_pn INTEGER NOT NULL DEFAULT 1 CHECK (signo_pn IN (-1, 1)),
  saldo_inicial NUMERIC(15,2) NOT NULL DEFAULT 0,
  mes_inicial VARCHAR(7),
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cuentas_patrim_tipo ON cuentas_patrimoniales(tipo);
CREATE INDEX IF NOT EXISTS idx_cuentas_patrim_activo ON cuentas_patrimoniales(activo);

CREATE TABLE IF NOT EXISTS saldos_cuentas_patrim (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id UUID NOT NULL REFERENCES cuentas_patrimoniales(id) ON DELETE CASCADE,
  mes VARCHAR(7) NOT NULL,
  saldo_inicio NUMERIC(15,2) NOT NULL DEFAULT 0,
  movimiento NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_cierre NUMERIC(15,2) NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cuenta_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_saldos_patrim_mes ON saldos_cuentas_patrim(mes);

ALTER TABLE cuentas_patrimoniales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON cuentas_patrimoniales;
CREATE POLICY "authenticated_all" ON cuentas_patrimoniales FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE saldos_cuentas_patrim ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON saldos_cuentas_patrim;
CREATE POLICY "authenticated_all" ON saldos_cuentas_patrim FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_cuentas_patrim_updated_at ON cuentas_patrimoniales;
CREATE TRIGGER update_cuentas_patrim_updated_at BEFORE UPDATE ON cuentas_patrimoniales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_saldos_patrim_updated_at ON saldos_cuentas_patrim;
CREATE TRIGGER update_saldos_patrim_updated_at BEFORE UPDATE ON saldos_cuentas_patrim
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
