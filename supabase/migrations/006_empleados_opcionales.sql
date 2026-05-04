-- ============================================================
-- Migración 006: Hacer DNI y fecha_ingreso opcionales en empleados
-- ============================================================

ALTER TABLE empleados ALTER COLUMN dni DROP NOT NULL;
ALTER TABLE empleados ALTER COLUMN fecha_ingreso DROP NOT NULL;
