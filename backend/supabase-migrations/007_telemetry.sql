-- 007_telemetry.sql — fundación de observabilidad + autonomía
-- Ejecutar manualmente en Supabase SQL Editor.

-- 1. AUDIT LOG: cada acción del sistema queda registrada para debugging.
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ DEFAULT NOW(),
  actor       TEXT NOT NULL,        -- 'mariana' | 'system' | 'user' | 'qcbot' | etc
  action      TEXT NOT NULL,        -- 'task.create' | 'email.send' | 'agent.delegate' …
  target      TEXT,                 -- task_id | client_id | conversation_id | null
  details     JSONB DEFAULT '{}'::jsonb,
  cost_usd    NUMERIC(10,6) DEFAULT 0,
  duration_ms INT,
  ok          BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_audit_ts     ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target);

-- 2. COST LOG: cada llamada a API externa con costo (Anthropic, OpenAI, Resend, Twilio).
CREATE TABLE IF NOT EXISTS cost_log (
  id              BIGSERIAL PRIMARY KEY,
  ts              TIMESTAMPTZ DEFAULT NOW(),
  provider        TEXT NOT NULL,    -- 'anthropic' | 'openai' | 'resend' | 'twilio' | 'meta_wa'
  endpoint        TEXT,             -- 'messages.create' | 'images.generate' | 'emails.send'
  model           TEXT,             -- 'claude-haiku-4-5' | 'dall-e-3' | etc
  input_tokens    INT DEFAULT 0,
  output_tokens   INT DEFAULT 0,
  units           NUMERIC(10,4) DEFAULT 0,  -- imágenes generadas, emails enviados, etc
  cost_usd        NUMERIC(10,6) NOT NULL,
  task_id         TEXT,             -- FK lógico a tasks.id
  agent           TEXT,
  client_id       UUID,
  context         JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_cost_ts       ON cost_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_cost_provider ON cost_log(provider);
CREATE INDEX IF NOT EXISTS idx_cost_agent    ON cost_log(agent);
CREATE INDEX IF NOT EXISTS idx_cost_task     ON cost_log(task_id);

-- 3. AGENT STATE: estado en vivo de cada agente para routing inteligente.
CREATE TABLE IF NOT EXISTS agent_state (
  slug            TEXT PRIMARY KEY,
  status          TEXT DEFAULT 'idle',  -- idle | busy | thinking | offline
  current_task    TEXT,
  active_tasks    INT DEFAULT 0,
  last_activity   TIMESTAMPTZ DEFAULT NOW(),
  total_today     INT DEFAULT 0
);
INSERT INTO agent_state (slug) VALUES
  ('mariana'),('diana'),('carlos'),('diego'),('alex'),
  ('sofia'),('lucas'),('max'),('valentina'),('roberto'),('qcbot')
ON CONFLICT (slug) DO NOTHING;

-- 4. QC REVIEWS: cada output revisado por QC-Bot antes de salir.
CREATE TABLE IF NOT EXISTS qc_reviews (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ DEFAULT NOW(),
  task_id     TEXT,
  agent       TEXT,
  output_kind TEXT,                  -- 'email' | 'image' | 'doc' | 'message'
  passed      BOOLEAN NOT NULL,
  score       NUMERIC(3,1),          -- 0.0 - 10.0
  issues      JSONB DEFAULT '[]'::jsonb,
  output_preview TEXT
);
CREATE INDEX IF NOT EXISTS idx_qc_task   ON qc_reviews(task_id);
CREATE INDEX IF NOT EXISTS idx_qc_passed ON qc_reviews(passed);
CREATE INDEX IF NOT EXISTS idx_qc_ts     ON qc_reviews(ts DESC);

-- RLS para todas
ALTER TABLE audit_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_state  ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_reviews   ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_audit"  ON audit_log   USING (true) WITH CHECK (true);
CREATE POLICY "service_full_cost"   ON cost_log    USING (true) WITH CHECK (true);
CREATE POLICY "service_full_state"  ON agent_state USING (true) WITH CHECK (true);
CREATE POLICY "service_full_qc"     ON qc_reviews  USING (true) WITH CHECK (true);
