-- ============================================================
-- Migración 058: Cuenta particular = cuenta patrimonial linkeada a un socio
-- ============================================================
-- Los retiros de socios son adelantos (activo: el socio debe esa plata). Al cerrar el
-- mes, los retiros dolarizados de cada socio se acumulan en su "cuenta particular"
-- (una cuenta_patrimonial con socio_id). El saldo se sintetiza en el cierre:
--   saldo_cierre = saldo_inicial(arranque, a mes_inicial) + Σ retiros dolarizados del socio
-- Así el retiro es PN-neutro (caja↓ + cuenta particular↑) y deja de sumarse al resultado.
-- ============================================================

ALTER TABLE cuentas_patrimoniales
  ADD COLUMN IF NOT EXISTS socio_id UUID REFERENCES socios(id);

COMMENT ON COLUMN cuentas_patrimoniales.socio_id IS 'Si está seteado, es la cuenta particular del socio: su saldo se sintetiza como arranque (saldo_inicial) + retiros dolarizados acumulados. No se carga a mano.';

CREATE INDEX IF NOT EXISTS idx_cuentas_patrim_socio ON cuentas_patrimoniales(socio_id) WHERE socio_id IS NOT NULL;
