-- Marca "cuenta corriente" auto-gestionable por recurrente.
--
-- Antes, qué recurrentes eran "cuenta corriente" (deuda sin fecha fija que se
-- junta y se paga cuando hay caja) vivía en una lista fija en el código
-- (lib/cuentas-corrientes.ts → CC_SERVICIOS). Ahora es un campo editable desde
-- la pantalla de recurrentes, para que se pueda tildar/destildar sin tocar código.
--
-- Semilla: dejamos en TRUE los conceptos que ya estaban en esa lista, para que
-- ninguno pierda su condición de cuenta corriente al migrar.

ALTER TABLE gastos_recurrentes
  ADD COLUMN IF NOT EXISTS es_cuenta_corriente BOOLEAN NOT NULL DEFAULT false;

UPDATE gastos_recurrentes
SET es_cuenta_corriente = true
WHERE concepto IN (
  'Abogado - Santiago Gomez',
  'Contador - Joaquin Bolivar',
  'TGI - Rioja 1440',
  'API - Rioja 1440',
  'Aguas Santafesinas - Rioja 1440',
  'Litoral Gas - Rioja 1440',
  'Monotributo - Dario Arevalo',
  'Autonomo - Dario Arevalo',
  'IIBB - Dario Arevalo',
  'Monotributo - Bruno Arevalo',
  'IIBB - Bruno Arevalo'
);
