-- ============================================================
-- Migración 049: origen (cuenta GN) en facturacion_mes
-- ============================================================
-- Una misma cuenta de cobro (ej. "Debito") puede existir en las dos cuentas GN
-- (BDI y ZATTIA) como flujos separados. Agregamos `cuenta_gn` (alias de la cuenta
-- GN de origen) y desglosamos por (mes, cuenta, cuenta_gn). Se recrea la tabla
-- (los datos se re-sincronizan desde GN).
-- ============================================================

DROP TABLE IF EXISTS facturacion_mes;

CREATE TABLE facturacion_mes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes                   VARCHAR(7)  NOT NULL,
  cuenta                VARCHAR(150) NOT NULL,   -- account_display (cuenta de cobro Areben)
  cuenta_gn             VARCHAR(50)  NOT NULL,   -- origen: alias de la cuenta GN (BDI / ZATTIA)
  cobrado               NUMERIC(15,2) NOT NULL DEFAULT 0,
  facturado             NUMERIC(15,2) NOT NULL DEFAULT 0,
  pendiente             NUMERIC(15,2) NOT NULL DEFAULT 0,
  cantidad              INTEGER     NOT NULL DEFAULT 0,
  cantidad_sin_facturar INTEGER     NOT NULL DEFAULT 0,
  fecha_sincronizacion  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mes, cuenta, cuenta_gn)
);

COMMENT ON TABLE facturacion_mes IS 'Pendiente de facturar por cuenta de cobro Areben, cuenta GN de origen y mes. pendiente = cobrado − facturado.';

CREATE INDEX IF NOT EXISTS idx_facturacion_mes_mes ON facturacion_mes(mes);

ALTER TABLE facturacion_mes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON facturacion_mes;
CREATE POLICY "authenticated_all" ON facturacion_mes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_facturacion_mes_updated_at ON facturacion_mes;
CREATE TRIGGER update_facturacion_mes_updated_at BEFORE UPDATE ON facturacion_mes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
