-- ============================================================
-- Migración 021: Vistas SQL planas (eliminan as unknown as en TS)
-- ============================================================
-- Supabase JS infiere joins como T[] o T | T[] | null, lo cual obliga a usar
-- as unknown as Parameters<...> para que el cliente vea T | null. Una vista SQL
-- aplanada devuelve filas tipadas correctamente sin joins anidados.

-- 1) Cuentas bancarias con datos del titular planos
DROP VIEW IF EXISTS v_cuentas_con_titular;
CREATE VIEW v_cuentas_con_titular AS
SELECT
  c.*,
  t.nombre AS titular_nombre,
  t.tipo AS titular_tipo
FROM cuentas_bancarias c
LEFT JOIN cuentas_titulares t ON t.id = c.titular_id;

-- 2) Compras con proveedor plano (lo más usado en /compras y /finanzas/pendientes)
DROP VIEW IF EXISTS v_compras_con_proveedor;
CREATE VIEW v_compras_con_proveedor AS
SELECT
  c.*,
  p.nombre AS proveedor_nombre,
  p.tipo AS proveedor_tipo,
  p.moneda AS proveedor_moneda
FROM compras c
LEFT JOIN proveedores p ON p.id = c.proveedor_id;

-- 3) Cheques pendientes (pagos cheques no acreditados con datos de la compra/proveedor)
DROP VIEW IF EXISTS v_cheques_pendientes;
CREATE VIEW v_cheques_pendientes AS
SELECT
  pg.*,
  c.descripcion AS compra_descripcion,
  pr.nombre AS proveedor_nombre
FROM pagos pg
LEFT JOIN compras c ON c.id = pg.compra_id
LEFT JOIN proveedores pr ON pr.id = c.proveedor_id
WHERE pg.instrumento IN ('CHEQUE_FISICO', 'ECHEQ')
  AND pg.acreditado = false;

-- 4) Cuotas de tarjeta con datos de la tarjeta plano
DROP VIEW IF EXISTS v_cuotas_con_tarjeta;
CREATE VIEW v_cuotas_con_tarjeta AS
SELECT
  ct.*,
  t.nombre AS tarjeta_nombre,
  t.banco AS tarjeta_banco
FROM cuotas_tarjeta ct
LEFT JOIN tarjetas_credito t ON t.id = ct.tarjeta_id;

-- 5) Nóminas con empleado plano
DROP VIEW IF EXISTS v_nominas_con_empleado;
CREATE VIEW v_nominas_con_empleado AS
SELECT
  n.*,
  e.nombre AS empleado_nombre,
  e.apellido AS empleado_apellido,
  e.dni AS empleado_dni,
  e.tipo_empleado AS empleado_tipo
FROM nomina_mensual n
LEFT JOIN empleados e ON e.id = n.empleado_id;

-- 6) Activos manuales con titular plano
DROP VIEW IF EXISTS v_activos_manuales_full;
CREATE VIEW v_activos_manuales_full AS
SELECT
  a.*,
  t.nombre AS titular_nombre,
  t.tipo AS titular_tipo
FROM activos_manuales a
LEFT JOIN cuentas_titulares t ON t.id = a.titular_id;

-- 7) Retiros con categoría plana
DROP VIEW IF EXISTS v_retiros_full;
CREATE VIEW v_retiros_full AS
SELECT
  r.*,
  c.nombre AS categoria_nombre,
  c.emoji AS categoria_emoji,
  c.color AS categoria_color
FROM retiros_socios r
LEFT JOIN categorias_retiro c ON c.id = r.categoria_id;

-- 8) Instrumentos inversión con inversor plano
DROP VIEW IF EXISTS v_instrumentos_full;
CREATE VIEW v_instrumentos_full AS
SELECT
  i.*,
  inv.nombre AS inversor_nombre
FROM instrumentos_inversion i
LEFT JOIN inversores inv ON inv.id = i.inversor_id;

-- Habilitar lectura via PostgREST: las vistas heredan los permisos de las tablas base
-- y RLS de las tablas se respeta automáticamente.
GRANT SELECT ON v_cuentas_con_titular, v_compras_con_proveedor, v_cheques_pendientes,
  v_cuotas_con_tarjeta, v_nominas_con_empleado, v_activos_manuales_full,
  v_retiros_full, v_instrumentos_full TO authenticated;

NOTIFY pgrst, 'reload schema';
