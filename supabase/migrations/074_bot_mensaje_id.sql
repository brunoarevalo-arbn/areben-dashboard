-- 074 — Bot: recordar qué mensaje de WhatsApp ya se procesó
--
-- POR QUÉ: WhatsApp no tira los mensajes que no pudo entregar. Los guarda en cola y
-- los reenvía cuando el bot vuelve a responder. El bot ya se defendía de eso, pero
-- la lista de "mensajes ya vistos" vivía en la memoria de n8n: se borra al reiniciar
-- y sólo duraba una hora. O sea, estaba vacía justo en el único momento en que hace
-- falta — después de una caída, que es cuando llegan las reentregas.
--
-- Pasó de verdad el 30/07/2026. Se cayó el túnel a las 10:45. El mensaje
-- "comidas $6000" de las 11:26 no llegó, se reenvió a mano a las 11:52 y se cargó
-- bien. A las 13:00 WhatsApp reentregó el original y el bot lo cargó DE NUEVO: dos
-- gastos de $6.000 el mismo día. Se salvó porque alguien estaba mirando el teléfono
-- y mandó "deshacer" 53 segundos después. De madrugada no se hubiera enterado nadie.
--
-- Guardando el id del mensaje en la bitácora, el bot puede preguntarle a la BASE
-- —que sobrevive al apagón— si ya lo cargó, en vez de confiar en su memoria.
--
-- El índice NO es único a propósito: si una rama del bot llegara a escribir dos
-- renglones para un mismo mensaje, un choque de unicidad haría fallar el insert y
-- perderíamos la bitácora de esa rama. La defensa es la consulta previa, no la
-- restricción; acá sólo hace falta que la búsqueda sea rápida.

ALTER TABLE bot_log
  ADD COLUMN IF NOT EXISTS mensaje_id text;

COMMENT ON COLUMN bot_log.mensaje_id IS
  'Id del mensaje de WhatsApp (wamid) que originó este renglón. El bot lo consulta antes '
  'de procesar: si ya está, es una reentrega de WhatsApp después de una caída y se descarta '
  'en vez de cargar el movimiento dos veces. NULL en los renglones anteriores al 01/08/2026.';

CREATE INDEX IF NOT EXISTS idx_bot_log_mensaje_id
    ON bot_log (mensaje_id)
 WHERE mensaje_id IS NOT NULL;

-- Verificación: la columna existe y todavía no hay ninguno cargado (se llena de acá en más).
SELECT count(*) AS con_mensaje_id
  FROM bot_log
 WHERE mensaje_id IS NOT NULL;
