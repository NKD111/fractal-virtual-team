-- 013_hardening.sql — hardening del sistema (Plan v6 Sprint 2h)
-- Pega en Supabase Dashboard → SQL Editor → Run
-- Idempotente: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS

-- ─── 1. webhooks_log — tabla canónica de todos los webhooks entrantes ──────────
-- Asegurar que existe con el schema completo que usa webhook.js
CREATE TABLE IF NOT EXISTS webhooks_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source      TEXT NOT NULL,           -- 'twilio_whatsapp' | 'meta_whatsapp' | 'stripe' | 'gmail'
  event_type  TEXT,                    -- 'message' | 'status' | 'payment_intent' etc.
  payload     JSONB,                   -- body raw del webhook
  processed   BOOLEAN DEFAULT false,   -- true cuando fue procesado exitosamente
  error       TEXT,                    -- mensaje de error si processed=true pero hubo fallo
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Agregar columna error si ya existe la tabla pero sin esa columna
ALTER TABLE webhooks_log ADD COLUMN IF NOT EXISTS error TEXT;

CREATE INDEX IF NOT EXISTS idx_wl_source    ON webhooks_log(source);
CREATE INDEX IF NOT EXISTS idx_wl_processed ON webhooks_log(processed);
CREATE INDEX IF NOT EXISTS idx_wl_created   ON webhooks_log(created_at DESC);

ALTER TABLE webhooks_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_full_wl" ON webhooks_log USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. cron_heartbeat — monitoreo de crons en producción ─────────────────────
-- Cada cron registra su última ejecución aquí. /api/health lo consulta
-- para detectar crons silenciosamente muertos.
CREATE TABLE IF NOT EXISTS cron_heartbeat (
  cron_name   TEXT PRIMARY KEY,        -- 'morning_briefing' | 'cost_report' | etc.
  last_run    TIMESTAMPTZ NOT NULL,    -- última ejecución
  last_status TEXT DEFAULT 'ok',       -- 'ok' | 'error'
  last_error  TEXT,                    -- error message si aplica
  run_count   INT DEFAULT 0,           -- contador de ejecuciones
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cron_heartbeat ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_full_ch" ON cron_heartbeat USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. Asegurar columna 'error' en tasks (ya existe según 006 pero confirmar) ──
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS error TEXT;

-- ─── 4. Índice en creative_jobs para búsqueda por ID parcial ─────────────────
-- _cmdAprueboJob y _cmdAjustarJob usan ilike('id', 'XXXXXXXX%')
-- UUID tiene índice en btree pero no en LIKE con prefijo — este índice lo acelera
CREATE INDEX IF NOT EXISTS idx_cj_id_prefix ON creative_jobs(id text_pattern_ops);
