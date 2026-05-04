-- ============================================================
-- Migración 011: Cierre de Mes (Arqueo Patrimonial)
-- ============================================================

CREATE TABLE IF NOT EXISTS cierres_mensuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes VARCHAR(7) NOT NULL UNIQUE,
  tipo_cambio NUMERIC(15,4) NOT NULL,

  -- Cajas manuales (efectivo no bancarizado)
  caja_ars NUMERIC(15,2) NOT NULL DEFAULT 0,
  caja_usd NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Snapshots (se freezean al confirmar)
  snapshot_cuentas JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_pasivos JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_retiros JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Pasivos manuales (deudas no registradas en compras/gastos)
  pasivos_manuales JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Totales calculados (snapshot)
  total_activos_ars NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_activos_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_pasivos_ars NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_pasivos_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  pn_ars NUMERIC(15,2) NOT NULL DEFAULT 0,
  pn_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_retiros_ars NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_retiros_usd NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Resultado del mes
  resultado_ars NUMERIC(15,2) NOT NULL DEFAULT 0,

  cerrado BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_cierre TIMESTAMPTZ,
  notas TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cierres_mes ON cierres_mensuales(mes);

ALTER TABLE cierres_mensuales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON cierres_mensuales;
CREATE POLICY "authenticated_all" ON cierres_mensuales FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_cierres_updated_at ON cierres_mensuales;
CREATE TRIGGER update_cierres_updated_at BEFORE UPDATE ON cierres_mensuales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
