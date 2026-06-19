-- Agregar campo notas TEXT a gastos_recurrentes
--
-- Permite documentar detalles de cada gasto recurrente:
-- forma de pago, día de cobro real, si IVA incluido, si factura a la empresa,
-- tarjeta/cuenta usada, observaciones, etc.
--
-- Se va llenando a medida que aparece la info real.

ALTER TABLE gastos_recurrentes
  ADD COLUMN IF NOT EXISTS notas TEXT;
