-- ============================================================
-- Migración 010: Tramos de tasa para instrumentos
-- ============================================================

CREATE TABLE IF NOT EXISTS tramos_tasa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrumento_id UUID NOT NULL REFERENCES instrumentos_inversion(id) ON DELETE CASCADE,
  tasa_mensual NUMERIC(10,6) NOT NULL CHECK (tasa_mensual >= 0),
  fecha_desde DATE NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(instrumento_id, fecha_desde)
);

CREATE INDEX IF NOT EXISTS idx_tramos_instrumento ON tramos_tasa(instrumento_id);
CREATE INDEX IF NOT EXISTS idx_tramos_fecha ON tramos_tasa(fecha_desde);

ALTER TABLE tramos_tasa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON tramos_tasa;
CREATE POLICY "authenticated_all" ON tramos_tasa FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tasa aplicada efectivamente al período (auditable)
ALTER TABLE periodos_instrumento
  ADD COLUMN IF NOT EXISTS tasa_aplicada NUMERIC(10,6) NOT NULL DEFAULT 0;

-- Backfill: crear tramo inicial para cada instrumento existente con su tasa actual
INSERT INTO tramos_tasa (instrumento_id, tasa_mensual, fecha_desde, notas)
SELECT id, tasa_mensual, fecha_inicio, 'Tasa inicial (backfill)'
FROM instrumentos_inversion
WHERE NOT EXISTS (
  SELECT 1 FROM tramos_tasa t WHERE t.instrumento_id = instrumentos_inversion.id
);

-- Backfill: setear tasa_aplicada en períodos existentes con la tasa del instrumento
UPDATE periodos_instrumento p
SET tasa_aplicada = i.tasa_mensual
FROM instrumentos_inversion i
WHERE p.instrumento_id = i.id AND p.tasa_aplicada = 0;
