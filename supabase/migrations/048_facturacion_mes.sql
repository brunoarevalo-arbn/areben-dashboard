-- ============================================================
-- Migración 048: Pendiente de facturar por cuenta de cobro y mes
-- ============================================================
-- Solo las ventas cobradas en cuentas 'areben' se facturan. Este snapshot mensual
-- guarda, por cuenta de cobro Areben, cuánto se vendió (cobrado, con IVA) y cuánto
-- ya está facturado (ventas con comprobante) → pendiente = cobrado − facturado.
-- Se sincroniza desde GN (ventas con account_display + bill_number/invoice_number).
-- ============================================================

CREATE TABLE IF NOT EXISTS facturacion_mes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes                   VARCHAR(7)  NOT NULL,          -- 'YYYY-MM'
  cuenta                VARCHAR(150) NOT NULL,         -- account_display (cuenta Areben)
  cobrado               NUMERIC(15,2) NOT NULL DEFAULT 0,  -- total vendido a esa cuenta (con IVA)
  facturado             NUMERIC(15,2) NOT NULL DEFAULT 0,  -- lo que ya tiene comprobante
  pendiente             NUMERIC(15,2) NOT NULL DEFAULT 0,  -- cobrado − facturado
  cantidad              INTEGER     NOT NULL DEFAULT 0,     -- ventas
  cantidad_sin_facturar INTEGER     NOT NULL DEFAULT 0,
  fecha_sincronizacion  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mes, cuenta)
);

COMMENT ON TABLE facturacion_mes IS 'Pendiente de facturar por cuenta de cobro Areben y mes. pendiente = cobrado − facturado, sincronizado desde GN (ventas con/sin comprobante).';

CREATE INDEX IF NOT EXISTS idx_facturacion_mes_mes ON facturacion_mes(mes);

-- RLS
ALTER TABLE facturacion_mes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON facturacion_mes;
CREATE POLICY "authenticated_all" ON facturacion_mes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_facturacion_mes_updated_at ON facturacion_mes;
CREATE TRIGGER update_facturacion_mes_updated_at BEFORE UPDATE ON facturacion_mes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
