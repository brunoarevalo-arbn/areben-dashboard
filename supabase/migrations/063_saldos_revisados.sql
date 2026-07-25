-- ============================================================
-- Migración 063: marcar saldos como "revisados" (quién y cuándo)
-- ============================================================
-- Problema: un saldo cargado en $0 se ve igual que uno que nunca se miró.
-- No hay forma de saber si el cero es real o si falta revisar la cuenta.
--
-- saldos_cuentas ya tenía `cerrado` + `fecha_cierre` (nunca usados en la UI);
-- se reinterpretan como "revisado" y se agrega quién lo marcó.
-- saldos_cuentas_patrim (impositivos) no tenía nada: se le agregan los tres.

-- Tesorería (bancos + caja)
ALTER TABLE saldos_cuentas
  ADD COLUMN IF NOT EXISTS revisado_por TEXT;

-- Patrimonio → Impositivos
ALTER TABLE saldos_cuentas_patrim
  ADD COLUMN IF NOT EXISTS cerrado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE saldos_cuentas_patrim
  ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMPTZ;
ALTER TABLE saldos_cuentas_patrim
  ADD COLUMN IF NOT EXISTS revisado_por TEXT;

COMMENT ON COLUMN saldos_cuentas.revisado_por IS 'Email de quien marcó el saldo como revisado. Se limpia al editar el monto.';
COMMENT ON COLUMN saldos_cuentas_patrim.revisado_por IS 'Email de quien marcó el saldo como revisado. Se limpia al editar el monto.';
