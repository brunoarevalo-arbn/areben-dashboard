-- ============================================================
-- Migración 050: Tabla de hechos de ventas GN (analítica / BI)
-- ============================================================
-- Ventas de GN agregadas por dimensiones para análisis: rentabilidad por marca ×
-- canal, ventas por canal/medio/tipo, formal vs informal, estacionalidad. Serie
-- temporal (histórico). Se mantiene datos_ventas_gn (mes×marca) para el P&L actual.
-- ============================================================

CREATE TABLE IF NOT EXISTS ventas_gn_agg (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- dimensiones
  mes                   VARCHAR(7)   NOT NULL,
  cuenta_gn             VARCHAR(50)  NOT NULL,   -- origen (BDI / ZATTIA)
  marca                 VARCHAR(20)  NOT NULL,   -- BDI | ZATTIA | STUNNED
  canal                 VARCHAR(100) NOT NULL DEFAULT '',   -- channel (Tienda Nube / local / ML)
  cuenta_cobro          VARCHAR(150) NOT NULL DEFAULT '',   -- account_display
  sale_type             VARCHAR(50)  NOT NULL DEFAULT '',   -- minorista / mayorista
  -- métricas
  ventas_con_iva        NUMERIC(15,2) NOT NULL DEFAULT 0,
  ventas_netas          NUMERIC(15,2) NOT NULL DEFAULT 0,   -- neto de IVA según cuenta (÷1,21 si areben)
  cmv                   NUMERIC(15,2) NOT NULL DEFAULT 0,
  descuentos            NUMERIC(15,2) NOT NULL DEFAULT 0,
  envios                NUMERIC(15,2) NOT NULL DEFAULT 0,
  cantidad              INTEGER       NOT NULL DEFAULT 0,     -- unidades
  monto_facturado       NUMERIC(15,2) NOT NULL DEFAULT 0,     -- con IVA de las ventas facturadas
  fecha_sincronizacion  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mes, cuenta_gn, marca, canal, cuenta_cobro, sale_type)
);

COMMENT ON TABLE ventas_gn_agg IS 'Ventas de GN agregadas por mes × cuenta_gn × marca × canal × cuenta_cobro × sale_type, para analítica (rentabilidad, canales, formal/informal, estacionalidad).';

CREATE INDEX IF NOT EXISTS idx_ventas_gn_agg_mes ON ventas_gn_agg(mes);
CREATE INDEX IF NOT EXISTS idx_ventas_gn_agg_marca ON ventas_gn_agg(marca);

ALTER TABLE ventas_gn_agg ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON ventas_gn_agg;
CREATE POLICY "authenticated_all" ON ventas_gn_agg FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_ventas_gn_agg_updated_at ON ventas_gn_agg;
CREATE TRIGGER update_ventas_gn_agg_updated_at BEFORE UPDATE ON ventas_gn_agg
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
