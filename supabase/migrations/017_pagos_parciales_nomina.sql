-- ============================================================
-- Migración 017: Pagos parciales de nómina (pagos a cuenta)
-- ============================================================
-- Permite cargar múltiples pagos parciales contra una nómina.
-- El "saldo pendiente" se calcula como: nomina.neto - SUM(pagos_parciales.monto)
-- Cuando el total pagado >= neto, la nómina se marca PAGADO automáticamente.

CREATE TABLE IF NOT EXISTS pagos_parciales_nomina (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomina_id UUID NOT NULL REFERENCES nomina_mensual(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  monto NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
  moneda VARCHAR(3) NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS', 'USD')),
  medio_pago VARCHAR(30) NOT NULL DEFAULT 'TRANSFERENCIA',
  cuenta_id UUID REFERENCES cuentas_bancarias(id) ON DELETE SET NULL,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_parciales_nomina_nomina ON pagos_parciales_nomina(nomina_id);
CREATE INDEX IF NOT EXISTS idx_pagos_parciales_nomina_fecha ON pagos_parciales_nomina(fecha);

ALTER TABLE pagos_parciales_nomina ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON pagos_parciales_nomina;
CREATE POLICY "authenticated_all" ON pagos_parciales_nomina FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
