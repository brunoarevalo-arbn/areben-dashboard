-- ============================================================
-- AREBEN DASHBOARD - Migración 003: RRHH Extendido
-- Ejecutar en Supabase SQL Editor DESPUÉS de 002_pagos_egresos.sql
-- ============================================================

-- 1. Empleados: horas mensuales, aguinaldo
ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS horas_mensuales INTEGER NOT NULL DEFAULT 160,
  ADD COLUMN IF NOT EXISTS corresponde_aguinaldo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS porcentaje_aguinaldo NUMERIC(5,2) NOT NULL DEFAULT 8.33;

-- 2. Nómina: porcentaje de extras y campos para recibo dual (Blanco)
ALTER TABLE nomina_mensual
  ADD COLUMN IF NOT EXISTS porcentaje_extras NUMERIC(5,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS monto_recibo_oficial NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adicional_no_registrado NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_hora_real NUMERIC(15,2) NOT NULL DEFAULT 0;

-- 3. Eventos / Incidencias / Ajustes Salariales
CREATE TABLE IF NOT EXISTS eventos_empleado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL DEFAULT 'INCIDENCIA',
  fecha DATE NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  sueldo_anterior NUMERIC(15,2),
  sueldo_nuevo NUMERIC(15,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eventos_empleado ON eventos_empleado(empleado_id);
CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos_empleado(fecha);
CREATE INDEX IF NOT EXISTS idx_eventos_tipo ON eventos_empleado(tipo);

ALTER TABLE eventos_empleado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON eventos_empleado;
CREATE POLICY "authenticated_all" ON eventos_empleado FOR ALL TO authenticated USING (true) WITH CHECK (true);
