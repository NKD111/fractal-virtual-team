-- 012_creative_jobs.sql — tabla para jobs de generación de imágenes y arte
-- Pega en Supabase Dashboard → SQL Editor → Run
-- Idempotente: usa CREATE TABLE IF NOT EXISTS

-- 1. CREATIVE JOBS — cada arte generado para un cliente
CREATE TABLE IF NOT EXISTS creative_jobs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client      VARCHAR(100) NOT NULL,          -- 'FIF' | 'Central Interactiva' | etc
  project_id  UUID,                           -- referencia a projects (opcional)
  status      VARCHAR(50) DEFAULT 'queued',   -- queued | processing | completed | failed | pending_approval | approved | rework
  brief       TEXT NOT NULL,                  -- descripción del arte en lenguaje natural
  prompt      TEXT,                           -- prompt técnico enviado a Higgsfield
  image_url   TEXT,                           -- URL de la imagen generada
  model_used  VARCHAR(100),                   -- 'higgsfield_gpt_image_2' | 'manual'
  typo_spec   JSONB,                          -- spec tipográfico Gotham generado por Carlos
  error_message TEXT,
  approved_by TEXT,                           -- 'NKD_WA' | 'NKD_web'
  approved_at TIMESTAMPTZ,
  revision_notes TEXT,                        -- notas de ajuste de Neiky
  cost_usd    DECIMAL(10,6) DEFAULT 0,
  source      VARCHAR(50) DEFAULT 'whatsapp', -- 'whatsapp' | 'api' | 'cron'
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cj_status  ON creative_jobs(status);
CREATE INDEX IF NOT EXISTS idx_cj_client  ON creative_jobs(client);
CREATE INDEX IF NOT EXISTS idx_cj_created ON creative_jobs(created_at DESC);

ALTER TABLE creative_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_cj" ON creative_jobs USING (true) WITH CHECK (true);

-- 2. AI COST EVENTS — tracking granular de costos por llamada a API
-- (complementa cost_log que ya existe; este tiene naming del plan v6)
CREATE TABLE IF NOT EXISTS ai_cost_events (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider      VARCHAR(50) NOT NULL,          -- 'anthropic' | 'higgsfield' | 'openai' | 'twilio'
  model         VARCHAR(100),                  -- 'claude-haiku-4-5' | 'gpt_image_2' | etc
  operation     VARCHAR(100) NOT NULL,         -- 'chat' | 'image_gen' | 'wa_send'
  project_id    UUID,
  client        VARCHAR(100),
  input_tokens  INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  cost_usd      DECIMAL(10,6) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ace_date     ON ai_cost_events(created_at DESC, provider);
CREATE INDEX IF NOT EXISTS idx_ace_client   ON ai_cost_events(client);
CREATE INDEX IF NOT EXISTS idx_ace_provider ON ai_cost_events(provider);

ALTER TABLE ai_cost_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_ace" ON ai_cost_events USING (true) WITH CHECK (true);

-- 3. Asegurar columnas requeridas en projects (si no existen)
-- client_name es el campo que causa el 27/27 failures
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_whatsapp TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_mxn DECIMAL(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
