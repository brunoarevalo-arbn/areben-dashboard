-- ============================================================
-- Migración 065: AFIP/Facturación deja de ser una foto y pasa a ser un proceso
-- ============================================================
-- Las ventas minoristas NO se facturan en Gestión Nube: se facturan todas juntas
-- a fin de mes desde el facturador de AFIP. Por eso `facturacion_mes.facturado`,
-- que salía de GN, daba $0 en 518 de 519 ventas de julio-2026 y el "pendiente"
-- no era un pendiente sino "GN no sabe qué facturaste".
--
-- El flujo real es: se calcula lo cobrado → se CIERRA el cálculo (se congela) →
-- se van cargando las facturas emitidas y el saldo baja. La factura es de Areben,
-- no de la marca: un solo saldo por mes para las dos cuentas GN.
--
-- Además el cobrado pasa a salir de los COBROS (`payments[]` de GN, con su propia
-- fecha y su propia cuenta) y no del total de la venta. Eso resuelve solo las
-- ventas cobradas en dos cuentas y permite imputar por mes de cobro.
-- ============================================================

-- ─── facturacion_mes: ahora es solo el desglose de lo cobrado ───
-- `facturado` / `pendiente` / `cantidad_sin_facturar` se derivan de facturas_emitidas
-- y no se guardan (mismo criterio que lib/gastos-estado.ts).
ALTER TABLE facturacion_mes DROP COLUMN IF EXISTS facturado;
ALTER TABLE facturacion_mes DROP COLUMN IF EXISTS pendiente;
ALTER TABLE facturacion_mes DROP COLUMN IF EXISTS cantidad_sin_facturar;

COMMENT ON TABLE facturacion_mes IS 'Cobrado por cuenta de cobro Areben, cuenta GN de origen y MES DE COBRO. Sale de payments[] de GN (include_payments=1), no del total de la venta.';
COMMENT ON COLUMN facturacion_mes.cobrado IS 'Suma de payments[].amount con date_payment dentro del mes.';
COMMENT ON COLUMN facturacion_mes.cantidad IS 'Cantidad de COBROS (no de ventas): una venta puede pagarse en varias cuentas.';

-- ─── El estado del mes: abierto mientras se calcula, cerrado para facturar ───
CREATE TABLE IF NOT EXISTS facturacion_periodo (
  mes               VARCHAR(7) PRIMARY KEY,        -- 'YYYY-MM'
  estado            VARCHAR(10) NOT NULL DEFAULT 'abierto',  -- 'abierto' | 'cerrado'
  cobrado_congelado NUMERIC(15,2),                 -- foto del cobrado al cerrar
  cerrado_por       TEXT,                          -- email, como saldos_cuentas.revisado_por
  cerrado_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT facturacion_periodo_estado_chk CHECK (estado IN ('abierto', 'cerrado'))
);

COMMENT ON TABLE facturacion_periodo IS 'Estado del mes de facturación. Cerrado = el cobrado quedó congelado y se está facturando contra ese número; sincronizar no lo mueve.';
COMMENT ON COLUMN facturacion_periodo.cobrado_congelado IS 'Total cobrado en cuentas Areben al momento de cerrar. NULL mientras el mes está abierto.';

-- ─── Las facturas emitidas: la lista contra la que baja el saldo ───
CREATE TABLE IF NOT EXISTS facturas_emitidas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes          VARCHAR(7)   NOT NULL,              -- 'YYYY-MM' al que descuenta
  numero       VARCHAR(60),                        -- nro de comprobante (libre)
  fecha        DATE,
  monto        NUMERIC(15,2) NOT NULL,
  notas        TEXT,
  origen       VARCHAR(10)  NOT NULL DEFAULT 'manual',  -- 'manual' | 'gn'
  cuenta_gn    VARCHAR(50),                        -- solo informativo, para las de origen 'gn'
  venta_gn_id  BIGINT,                             -- id de la venta en GN (solo origen 'gn')
  cargado_por  TEXT,                               -- email
  cargado_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT facturas_emitidas_origen_chk CHECK (origen IN ('manual', 'gn'))
);

COMMENT ON TABLE facturas_emitidas IS 'Facturas emitidas contra el cobrado del mes. Las de origen ''gn'' son las que Gestión Nube sí tiene cargadas (mayoristas con CAE) y se sincronizan solas: están para no facturarlas dos veces.';

-- Una venta de GN no puede entrar dos veces en el mismo mes por más que se resincronice.
-- Va por (venta_gn_id, mes) y no por venta sola: una venta cobrada en dos meses aporta a los
-- dos, cada uno por su parte.
-- El índice NO va parcial (`WHERE venta_gn_id IS NOT NULL`): Postgres no puede usar un índice
-- parcial para resolver un `ON CONFLICT`, y el upsert del sync fallaba entero y en silencio.
-- Sin el WHERE funciona igual, porque en un índice único los NULL no chocan entre sí —
-- las facturas cargadas a mano (venta_gn_id NULL) conviven sin problema.
DROP INDEX IF EXISTS idx_facturas_emitidas_venta_gn;
CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_emitidas_venta_gn
  ON facturas_emitidas(venta_gn_id, mes);
CREATE INDEX IF NOT EXISTS idx_facturas_emitidas_mes ON facturas_emitidas(mes);

-- ─── El detalle técnico al pie de la pantalla, para seguimiento ───
-- Lo que el sync encuentra y conviene mirar a mano, sin inventar una tabla por caso.
CREATE TABLE IF NOT EXISTS facturacion_detalle (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes         VARCHAR(7)  NOT NULL,
  tipo        VARCHAR(40) NOT NULL,   -- 'compra_pendiente_facturada' | 'cuenta_sin_clasificar'
  referencia  VARCHAR(120) NOT NULL,  -- nº de venta, o nombre de la cuenta de cobro
  detalle     TEXT,
  monto       NUMERIC(15,2),
  cantidad    INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mes, tipo, referencia)
);

COMMENT ON TABLE facturacion_detalle IS 'Detalle técnico del mes de facturación: ventas en Compra Pendiente que sí están facturadas, y cuentas de cobro que aparecen en GN pero no están en el catálogo. Lo reescribe cada sincronización.';

CREATE INDEX IF NOT EXISTS idx_facturacion_detalle_mes ON facturacion_detalle(mes);

-- ─── RLS: mismo patrón que el resto del repo ───
ALTER TABLE facturacion_detalle ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON facturacion_detalle;
CREATE POLICY "authenticated_all" ON facturacion_detalle FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE facturacion_periodo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON facturacion_periodo;
CREATE POLICY "authenticated_all" ON facturacion_periodo FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE facturas_emitidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON facturas_emitidas;
CREATE POLICY "authenticated_all" ON facturas_emitidas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Triggers updated_at ───
DROP TRIGGER IF EXISTS update_facturacion_periodo_updated_at ON facturacion_periodo;
CREATE TRIGGER update_facturacion_periodo_updated_at BEFORE UPDATE ON facturacion_periodo
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_facturas_emitidas_updated_at ON facturas_emitidas;
CREATE TRIGGER update_facturas_emitidas_updated_at BEFORE UPDATE ON facturas_emitidas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── El catálogo de cuentas de cobro estaba incompleto ───
-- Caja gerencia (las cuentas particulares de los socios, por fuera de Areben) aparece en GN
-- con DOS nombres y hay que tener los dos: los cobros van contra la cuenta "Transferencia CG"
-- y la venta se etiqueta "Transferencia CG (SI TRANSFIEREN MAL)". Faltaba la segunda, así que
-- caía como no-facturable sin que nadie lo decidiera (junio-2026: 242 ventas, $9.643.796).
-- Las dos son 'propia': no se facturan.
INSERT INTO cuentas_cobro_gn (nombre, tipo, notas)
VALUES
  ('Transferencia CG', 'propia', 'Caja gerencia — cuentas particulares de los socios, fuera de Areben'),
  ('Transferencia CG (SI TRANSFIEREN MAL)', 'propia', 'Caja gerencia — el mismo destino, etiquetado así en la venta')
ON CONFLICT (nombre) DO NOTHING;

NOTIFY pgrst, 'reload schema';
