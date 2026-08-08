-- 072 — Distinguir "cheque emitido" de "número cargado"
--
-- POR QUÉ: hasta hoy la única señal era `numero_cheque`. Si estaba vacío se asumía
-- que el cheque no se había emitido, y eso es falso: los cheques FÍSICOS se emiten
-- a mano y muchas veces el número se carga después (o nunca, si no se le sacó foto).
-- El 27/07/2026 la lista de "pendientes de emitir" del bot mostró 3 cheques de DUET
-- que ya estaban emitidos, y un cheque del Galicia (nº 100) que también lo estaba.
--
-- Son DOS cosas distintas y ahora se guardan por separado:
--   emitido = false  → todavía hay que emitirlo (tarea real: ir al banco / home banking)
--   emitido = true, numero_cheque null → ya se emitió, falta cargarle el número (tarea de datos)
--
-- Backfill con lo que se sabe hoy:
--   - tiene número            -> emitido (74 cheques)
--   - la nota dice "ya emitido" -> emitido (3 de DUET, cargados a mano el 26/07)
--   - el resto                -> pendiente de emisión (1: e-cheque de SUMA, vence 01/08)

ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS emitido boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pagos.emitido IS
  'Cheque ya emitido (entregado/enviado). Independiente de numero_cheque: un cheque físico '
  'puede estar emitido sin que se haya cargado el número. Solo aplica a instrumento '
  'ECHEQ / CHEQUE_FISICO; en el resto queda en false y se ignora.';

-- Backfill
UPDATE pagos
   SET emitido = true
 WHERE instrumento IN ('ECHEQ', 'CHEQUE_FISICO')
   AND (
        (numero_cheque IS NOT NULL AND numero_cheque <> '')
     OR notas ILIKE '%ya emitid%'
   );

-- Índice chico: la consulta "qué me falta emitir" filtra por esto.
CREATE INDEX IF NOT EXISTS idx_pagos_pendientes_emision
    ON pagos (fecha_vencimiento)
 WHERE instrumento IN ('ECHEQ', 'CHEQUE_FISICO') AND emitido = false;

-- NO hace falta tocar la vista v_cheques_pendientes: el bot lee `emitido` de la tabla
-- `pagos` directamente y cruza por id. Si algún día la app la necesita en la vista,
-- se agrega `p.emitido` a su SELECT.

-- Verificación: así tiene que quedar el reparto.
SELECT
  count(*) FILTER (WHERE emitido)                                  AS emitidos,
  count(*) FILTER (WHERE NOT emitido)                              AS pendientes_de_emitir,
  count(*) FILTER (WHERE emitido AND coalesce(numero_cheque,'')='') AS emitidos_sin_numero
FROM pagos
WHERE instrumento IN ('ECHEQ', 'CHEQUE_FISICO');
