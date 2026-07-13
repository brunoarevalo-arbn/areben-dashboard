-- Versionado de las tablas de PRÉSTAMOS BANCARIOS y PLANES DE PAGO AFIP.
-- Estas tablas se habían creado a mano directamente en la base de producción, sin
-- archivo de migración. Este script las versiona (refleja el schema real) para que la
-- base sea reproducible desde cero.
--
-- Idempotente (CREATE ... IF NOT EXISTS): en producción ya existen → no-op; en una
-- base nueva las crea. NO cambia datos ni comportamiento.

-- ─── Préstamos bancarios ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prestamos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(200) NOT NULL,
  acreedor VARCHAR(200) NOT NULL,
  titular_formal VARCHAR(200),
  moneda VARCHAR(3) NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS', 'USD')),
  fecha_inicio DATE NOT NULL,
  capital_original NUMERIC(15,2) NOT NULL,
  total_intereses NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_a_pagar NUMERIC(15,2) NOT NULL,
  cantidad_cuotas INTEGER NOT NULL CHECK (cantidad_cuotas > 0),
  dia_pago INTEGER NOT NULL DEFAULT 1 CHECK (dia_pago >= 1 AND dia_pago <= 31),
  cuenta_pago_id UUID REFERENCES cuentas_bancarias(id) ON DELETE SET NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'CANCELADO', 'CADUCO')),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prestamo_cuotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestamo_id UUID NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  cuota_numero INTEGER NOT NULL CHECK (cuota_numero > 0),
  total_cuotas INTEGER NOT NULL,
  capital NUMERIC(15,2) NOT NULL,
  interes NUMERIC(15,2) NOT NULL DEFAULT 0,
  monto_total NUMERIC(15,2) NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  pagada BOOLEAN NOT NULL DEFAULT false,
  fecha_pago DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (prestamo_id, cuota_numero)
);
CREATE INDEX IF NOT EXISTS idx_prestamo_cuotas_prestamo ON prestamo_cuotas(prestamo_id);
CREATE INDEX IF NOT EXISTS idx_prestamo_cuotas_pagada ON prestamo_cuotas(pagada) WHERE (pagada = false);
CREATE INDEX IF NOT EXISTS idx_prestamo_cuotas_venc ON prestamo_cuotas(fecha_vencimiento);

-- ─── Planes de pago AFIP ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planes_afip (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(200) NOT NULL,
  numero_plan VARCHAR(50),
  fecha_inicio DATE NOT NULL,
  monto_deuda_original NUMERIC(15,2) NOT NULL,
  pago_contado NUMERIC(15,2) NOT NULL DEFAULT 0,
  capital_financiado NUMERIC(15,2) NOT NULL,
  cantidad_cuotas INTEGER NOT NULL CHECK (cantidad_cuotas > 0),
  monto_cuota NUMERIC(15,2) NOT NULL,
  total_a_pagar NUMERIC(15,2) NOT NULL,
  intereses NUMERIC(15,2) NOT NULL DEFAULT 0,
  dia_debito INTEGER NOT NULL DEFAULT 15 CHECK (dia_debito >= 1 AND dia_debito <= 31),
  cuenta_debito_id UUID REFERENCES cuentas_bancarias(id) ON DELETE SET NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'CANCELADO', 'CADUCO', 'TERMINADO')),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_afip_cuotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_afip_id UUID NOT NULL REFERENCES planes_afip(id) ON DELETE CASCADE,
  cuota_numero INTEGER NOT NULL CHECK (cuota_numero > 0),
  total_cuotas INTEGER NOT NULL,
  capital NUMERIC(15,2) NOT NULL,
  interes NUMERIC(15,2) NOT NULL DEFAULT 0,
  monto_total NUMERIC(15,2) NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  pagada BOOLEAN NOT NULL DEFAULT false,
  fecha_pago DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_afip_id, cuota_numero)
);
CREATE INDEX IF NOT EXISTS idx_plan_afip_cuotas_plan ON plan_afip_cuotas(plan_afip_id);
CREATE INDEX IF NOT EXISTS idx_plan_afip_cuotas_pagada ON plan_afip_cuotas(pagada) WHERE (pagada = false);
CREATE INDEX IF NOT EXISTS idx_plan_afip_cuotas_venc ON plan_afip_cuotas(fecha_vencimiento);
