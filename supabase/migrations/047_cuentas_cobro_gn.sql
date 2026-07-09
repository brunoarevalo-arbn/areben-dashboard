-- ============================================================
-- Migración 047: Catálogo de cuentas de cobro de Gestión Nube
-- ============================================================
-- Clasifica cada cuenta de cobro (account_display de GN) para saber si la venta
-- se factura (lleva IVA) o no. La bajada del negocio: depende de a qué cuenta
-- entra la plata.
--   - 'areben'   → se factura → lleva IVA débito (ventas netas = venta / 1.21)
--   - 'propia'   → cuenta de Bruno/Darío → NO se factura → sin IVA
--   - 'efectivo' → NO se factura → sin IVA
-- Solo 'areben' es facturable. El usuario lo edita desde Configuración.
-- ============================================================

CREATE TABLE IF NOT EXISTS cuentas_cobro_gn (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      VARCHAR(150) NOT NULL UNIQUE,   -- = account_display de GN
  tipo        VARCHAR(20)  NOT NULL DEFAULT 'efectivo'
              CHECK (tipo IN ('areben', 'propia', 'efectivo')),
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cuentas_cobro_gn IS 'Catálogo de cuentas de cobro (account_display de GN). tipo=areben → se factura y lleva IVA; propia/efectivo → no se factura. Editable desde Configuración.';

-- Seed con la lectura tentativa (el usuario ajusta desde la UI)
INSERT INTO cuentas_cobro_gn (nombre, tipo) VALUES
  ('Transferencia AREBEN', 'areben'),
  ('Pago Nube', 'areben'),
  ('Debito', 'areben'),
  ('Mercado Pago', 'areben'),
  ('Mercado Pago 1', 'areben'),
  ('Mercado Pago 2', 'areben'),
  ('Credito 10% OFF (Mier-Sab) - Nro 1 o 3', 'areben'),
  ('Credito - Nro 1 o 13', 'areben'),
  ('Efectivo', 'efectivo'),
  ('Efectivo - CADETE', 'efectivo'),
  ('Efectivo Cadete', 'efectivo'),
  ('Sin cobro', 'efectivo'),
  ('Cambio = $0', 'efectivo'),
  ('Transferencia CG', 'propia'),
  ('Transferencia', 'propia'),
  ('Transferencia Mayorista', 'propia'),
  ('2 Cuentas', 'propia')
ON CONFLICT (nombre) DO NOTHING;

-- RLS
ALTER TABLE cuentas_cobro_gn ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON cuentas_cobro_gn;
CREATE POLICY "authenticated_all" ON cuentas_cobro_gn FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_cuentas_cobro_gn_updated_at ON cuentas_cobro_gn;
CREATE TRIGGER update_cuentas_cobro_gn_updated_at BEFORE UPDATE ON cuentas_cobro_gn
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
