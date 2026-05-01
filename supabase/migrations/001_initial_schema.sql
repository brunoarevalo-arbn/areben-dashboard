-- ============================================================
-- AREBEN DASHBOARD - Schema inicial
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Tipos enumerados
CREATE TYPE marca AS ENUM ('BDI', 'ZATTIA', 'STUNNED', 'GENERAL');
CREATE TYPE tipo_empleado AS ENUM ('BLANCO', 'NEGRO');
CREATE TYPE estado_gasto AS ENUM ('PENDIENTE', 'PAGADO', 'VENCIDO');
CREATE TYPE estado_nomina AS ENUM ('PENDIENTE', 'PAGADO');
CREATE TYPE metodo_pago AS ENUM ('EFECTIVO', 'TRANSFERENCIA');
CREATE TYPE tipo_aporte AS ENUM ('PORCENTAJE', 'MONTO_FIJO');
CREATE TYPE tipo_proveedor AS ENUM ('NACIONAL', 'IMPORTACION');
CREATE TYPE moneda AS ENUM ('ARS', 'USD');

-- ============================================================
-- FINANZAS
-- ============================================================

CREATE TABLE saldos_mensuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes VARCHAR(7) NOT NULL UNIQUE, -- YYYY-MM
  saldo_pesos NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  caja_pesos NUMERIC(15,2) NOT NULL DEFAULT 0,
  caja_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  cuentas_corrientes NUMERIC(15,2) NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE gastos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria VARCHAR(100) NOT NULL,
  concepto VARCHAR(255) NOT NULL,
  monto NUMERIC(15,2) NOT NULL,
  negocio marca NOT NULL DEFAULT 'GENERAL',
  mes VARCHAR(7) NOT NULL, -- YYYY-MM
  estado estado_gasto NOT NULL DEFAULT 'PENDIENTE',
  fecha_pago DATE,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gastos_mes ON gastos(mes);
CREATE INDEX idx_gastos_negocio ON gastos(negocio);
CREATE INDEX idx_gastos_estado ON gastos(estado);

CREATE TABLE retiros_socios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio VARCHAR(100) NOT NULL,
  fecha DATE NOT NULL,
  monto_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  monto_pesos NUMERIC(15,2) NOT NULL DEFAULT 0,
  tipo_cambio NUMERIC(10,2) NOT NULL DEFAULT 1,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_retiros_socio ON retiros_socios(socio);
CREATE INDEX idx_retiros_fecha ON retiros_socios(fecha);

CREATE TABLE afip_facturacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes VARCHAR(7) NOT NULL,
  motivo VARCHAR(255) NOT NULL,
  monto NUMERIC(15,2) NOT NULL,
  responsable VARCHAR(100) NOT NULL,
  estado estado_gasto NOT NULL DEFAULT 'PENDIENTE',
  fecha_vencimiento DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bienes_uso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  tipo VARCHAR(100) NOT NULL,
  fecha_compra DATE NOT NULL,
  precio NUMERIC(15,2) NOT NULL,
  vida_util_anos INTEGER NOT NULL DEFAULT 5,
  valor_residual NUMERIC(15,2) NOT NULL DEFAULT 0,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RR.HH.
-- ============================================================

CREATE TABLE empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  dni VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(255),
  telefono VARCHAR(50),
  tipo_empleado tipo_empleado NOT NULL,
  sueldo_basico NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_hora NUMERIC(10,2) NOT NULL DEFAULT 0,
  cbu VARCHAR(50),
  banco VARCHAR(100),
  metodo_pago metodo_pago,
  fecha_ingreso DATE NOT NULL,
  fecha_egreso DATE,
  fecha_nacimiento DATE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_empleados_activo ON empleados(activo);
CREATE INDEX idx_empleados_tipo ON empleados(tipo_empleado);

CREATE TABLE nomina_mensual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  mes VARCHAR(7) NOT NULL, -- YYYY-MM
  sueldo_basico NUMERIC(15,2) NOT NULL DEFAULT 0,
  horas_trabajadas NUMERIC(6,2) NOT NULL DEFAULT 0,
  valor_hora NUMERIC(10,2) NOT NULL DEFAULT 0,
  horas_extras NUMERIC(6,2) NOT NULL DEFAULT 0,
  comida NUMERIC(15,2) NOT NULL DEFAULT 0,
  aguinaldo NUMERIC(15,2) NOT NULL DEFAULT 0,
  aportes_empleado NUMERIC(15,2) NOT NULL DEFAULT 0,
  aportes_patronales NUMERIC(15,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  neto NUMERIC(15,2) NOT NULL DEFAULT 0,
  costo_empresa NUMERIC(15,2) NOT NULL DEFAULT 0,
  estado estado_nomina NOT NULL DEFAULT 'PENDIENTE',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empleado_id, mes)
);

CREATE INDEX idx_nomina_mes ON nomina_mensual(mes);
CREATE INDEX idx_nomina_empleado ON nomina_mensual(empleado_id);
CREATE INDEX idx_nomina_estado ON nomina_mensual(estado);

CREATE TABLE vacaciones_empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  ano INTEGER NOT NULL,
  dias_disponibles INTEGER NOT NULL DEFAULT 20,
  dias_tomados INTEGER NOT NULL DEFAULT 0,
  dias_restantes INTEGER NOT NULL DEFAULT 20,
  periodos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empleado_id, ano)
);

CREATE TABLE configuracion_aportes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL,
  tipo tipo_aporte NOT NULL DEFAULT 'PORCENTAJE',
  valor NUMERIC(10,4) NOT NULL,
  aplicable_a VARCHAR(10) NOT NULL DEFAULT 'AMBOS', -- BLANCO, NEGRO, AMBOS
  es_patronal BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aportes por defecto
INSERT INTO configuracion_aportes (nombre, tipo, valor, aplicable_a, es_patronal, activo, orden) VALUES
  ('ADESUR', 'PORCENTAJE', 3.00, 'AMBOS', FALSE, TRUE, 1),
  ('Obra Social', 'PORCENTAJE', 2.50, 'BLANCO', FALSE, TRUE, 2),
  ('Jubilación (empleado)', 'PORCENTAJE', 11.00, 'BLANCO', FALSE, TRUE, 3),
  ('Jubilación (patronal)', 'PORCENTAJE', 16.00, 'BLANCO', TRUE, TRUE, 4),
  ('Obra Social (patronal)', 'PORCENTAJE', 6.00, 'BLANCO', TRUE, TRUE, 5);

CREATE TABLE configuracion_depreciacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_bien VARCHAR(100) NOT NULL UNIQUE,
  vida_util_anos INTEGER NOT NULL DEFAULT 5,
  valor_residual_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Depreciaciones por defecto
INSERT INTO configuracion_depreciacion (tipo_bien, vida_util_anos) VALUES
  ('Computadora', 3),
  ('Mueble', 10),
  ('Equipo de oficina', 5),
  ('Vehículo', 5),
  ('Maquinaria', 10),
  ('Exhibidor', 5);

-- ============================================================
-- COMPRAS
-- ============================================================

CREATE TABLE proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  tipo tipo_proveedor NOT NULL DEFAULT 'NACIONAL',
  contacto VARCHAR(100),
  email VARCHAR(255),
  telefono VARCHAR(50),
  pais VARCHAR(100) NOT NULL DEFAULT 'Argentina',
  condiciones_pago VARCHAR(255),
  moneda moneda NOT NULL DEFAULT 'ARS',
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL,
  descripcion VARCHAR(255) NOT NULL,
  cantidad NUMERIC(10,2) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(15,2) NOT NULL,
  moneda moneda NOT NULL DEFAULT 'ARS',
  tipo_cambio NUMERIC(10,2),
  estado estado_gasto NOT NULL DEFAULT 'PENDIENTE',
  fecha_pago DATE,
  negocio marca NOT NULL DEFAULT 'GENERAL',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compras_fecha ON compras(fecha);
CREATE INDEX idx_compras_proveedor ON compras(proveedor_id);
CREATE INDEX idx_compras_negocio ON compras(negocio);

CREATE TABLE costeo_importacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  cif_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  derechos_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0,
  tasa_estadistica NUMERIC(5,2) NOT NULL DEFAULT 0.5,
  iva_importacion NUMERIC(5,2) NOT NULL DEFAULT 21,
  ganancias NUMERIC(5,2) NOT NULL DEFAULT 6,
  servicios_despachante NUMERIC(15,2) NOT NULL DEFAULT 0,
  flete_interno NUMERIC(15,2) NOT NULL DEFAULT 0,
  otros_gastos NUMERIC(15,2) NOT NULL DEFAULT 0,
  tipo_cambio NUMERIC(10,2) NOT NULL DEFAULT 1,
  costo_total_ars NUMERIC(15,2) NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE proyecciones_compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes VARCHAR(7) NOT NULL,
  marca marca NOT NULL,
  venta_mes_anterior NUMERIC(15,2) NOT NULL DEFAULT 0,
  promedio_3_meses NUMERIC(15,2) NOT NULL DEFAULT 0,
  factor_estacionalidad NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  proyeccion_monto NUMERIC(15,2) NOT NULL DEFAULT 0,
  compra_real NUMERIC(15,2),
  lead_time_dias INTEGER NOT NULL DEFAULT 30,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mes, marca)
);

-- ============================================================
-- GESTIÓN NUBE / ANÁLISIS
-- ============================================================

CREATE TABLE datos_ventas_gn (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes VARCHAR(7) NOT NULL,
  marca marca NOT NULL,
  ventas_brutas NUMERIC(15,2) NOT NULL DEFAULT 0,
  devoluciones NUMERIC(15,2) NOT NULL DEFAULT 0,
  ventas_netas NUMERIC(15,2) NOT NULL DEFAULT 0,
  cmv NUMERIC(15,2) NOT NULL DEFAULT 0,
  margen_pesos NUMERIC(15,2) NOT NULL DEFAULT 0,
  margen_porcentaje NUMERIC(7,4) NOT NULL DEFAULT 0,
  cantidad_vendida INTEGER NOT NULL DEFAULT 0,
  comisiones NUMERIC(15,2) NOT NULL DEFAULT 0,
  fecha_sincronizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sincronizado_por VARCHAR(100) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mes, marca)
);

CREATE TABLE configuracion_api (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio VARCHAR(50) NOT NULL DEFAULT 'gestion_nube',
  api_key VARCHAR(500),
  api_url VARCHAR(500),
  fecha_ultimo_test TIMESTAMPTZ,
  estado VARCHAR(20) NOT NULL DEFAULT 'NO_CONFIGURADO',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO configuracion_api (servicio, estado, notas)
VALUES ('gestion_nube', 'NO_CONFIGURADO', 'Configurar API key de Gestión Nube');

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE saldos_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE afip_facturacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE bienes_uso ENABLE ROW LEVEL SECURITY;
ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE nomina_mensual ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacaciones_empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_aportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_depreciacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE costeo_importacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyecciones_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE datos_ventas_gn ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_api ENABLE ROW LEVEL SECURITY;

-- Políticas: solo usuarios autenticados pueden acceder
CREATE POLICY "authenticated_all" ON saldos_mensuales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON gastos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON retiros_socios FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON afip_facturacion FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON bienes_uso FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON empleados FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON nomina_mensual FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON vacaciones_empleados FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON configuracion_aportes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON configuracion_depreciacion FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON proveedores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON compras FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON costeo_importacion FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON proyecciones_compras FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON datos_ventas_gn FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON configuracion_api FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Función para updated_at automático
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_gastos_updated_at BEFORE UPDATE ON gastos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_saldos_updated_at BEFORE UPDATE ON saldos_mensuales FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_empleados_updated_at BEFORE UPDATE ON empleados FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_nomina_updated_at BEFORE UPDATE ON nomina_mensual FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_vacaciones_updated_at BEFORE UPDATE ON vacaciones_empleados FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_aportes_updated_at BEFORE UPDATE ON configuracion_aportes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
