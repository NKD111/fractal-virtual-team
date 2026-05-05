-- 009_growth.sql — Deal Room + Case Study + Self-improve + Public API + Integrations

-- 1. DEAL ROOMS — propuestas con link público, chat, e-sign
CREATE TABLE IF NOT EXISTS deal_rooms (
  token         TEXT PRIMARY KEY,
  task_id       TEXT,
  client_name   TEXT NOT NULL,
  client_email  TEXT,
  proposal_html TEXT NOT NULL,
  total_usd     NUMERIC(10,2),
  status        TEXT DEFAULT 'sent',  -- sent | viewed | accepted | rejected | expired
  signed_name   TEXT,
  signed_at     TIMESTAMPTZ,
  views         INT DEFAULT 0,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deal_status ON deal_rooms(status);

-- 2. CASE STUDIES — auto-generated PDFs from delivered tasks
CREATE TABLE IF NOT EXISTS case_studies (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id     TEXT,
  client      TEXT,
  agent       TEXT,
  title       TEXT,
  pdf_url     TEXT,
  preview_url TEXT,
  metrics     JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PROMPT EVOLUTIONS — captura wins + losses para refinar baseContext
CREATE TABLE IF NOT EXISTS prompt_evolutions (
  id          BIGSERIAL PRIMARY KEY,
  agent       TEXT NOT NULL,
  task_id     TEXT,
  outcome     TEXT,                   -- 'win' | 'loss' | 'neutral'
  signal      TEXT,                   -- qué dio la señal: 'qc_high' | 'fast_reply' | 'rejected' | 'edited'
  excerpt     TEXT,                   -- el output exitoso/fallido (recortado)
  feedback    TEXT,                   -- feedback del usuario si lo hubo
  applied     BOOLEAN DEFAULT false,
  ts          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prompt_agent ON prompt_evolutions(agent);
CREATE INDEX IF NOT EXISTS idx_prompt_applied ON prompt_evolutions(applied);

CREATE TABLE IF NOT EXISTS agent_baseline (
  slug          TEXT PRIMARY KEY,
  base_addendum TEXT,                 -- texto que se añade al system prompt
  version       INT DEFAULT 1,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PUBLIC API — keys, webhooks, usage
CREATE TABLE IF NOT EXISTS api_keys (
  key_hash      TEXT PRIMARY KEY,     -- sha256 de la key
  prefix        TEXT NOT NULL,         -- primeros 8 chars para identificar
  owner_email   TEXT,
  owner_name    TEXT,
  scopes        JSONB DEFAULT '["read"]'::jsonb,
  rate_limit    INT DEFAULT 60,        -- req/min
  active        BOOLEAN DEFAULT true,
  last_used     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_usage (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ DEFAULT NOW(),
  key_hash    TEXT,
  endpoint    TEXT,
  method      TEXT,
  status      INT,
  duration_ms INT
);
CREATE INDEX IF NOT EXISTS idx_apiusage_key ON api_usage(key_hash);
CREATE INDEX IF NOT EXISTS idx_apiusage_ts  ON api_usage(ts DESC);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key_hash    TEXT,
  url         TEXT NOT NULL,
  events      JSONB DEFAULT '["*"]'::jsonb,  -- task.created, task.delivered, etc
  secret      TEXT,                            -- HMAC para firmar
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. INTEGRATIONS — almacenes de tokens OAuth (Google, Stripe, Figma)
CREATE TABLE IF NOT EXISTS integration_tokens (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider    TEXT NOT NULL,          -- 'google' | 'stripe' | 'figma'
  account     TEXT,                   -- email u otro ID
  access      TEXT,
  refresh     TEXT,
  expires_at  TIMESTAMPTZ,
  scopes      JSONB,
  meta        JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_int_provider ON integration_tokens(provider);

-- RLS
ALTER TABLE deal_rooms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_studies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_evolutions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_baseline         ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys               ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage              ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_tokens     ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_deals"     ON deal_rooms             USING (true) WITH CHECK (true);
CREATE POLICY "service_full_cases"     ON case_studies           USING (true) WITH CHECK (true);
CREATE POLICY "service_full_evol"      ON prompt_evolutions      USING (true) WITH CHECK (true);
CREATE POLICY "service_full_baseline"  ON agent_baseline         USING (true) WITH CHECK (true);
CREATE POLICY "service_full_apikeys"   ON api_keys               USING (true) WITH CHECK (true);
CREATE POLICY "service_full_apiusage"  ON api_usage              USING (true) WITH CHECK (true);
CREATE POLICY "service_full_webhooks"  ON webhook_subscriptions  USING (true) WITH CHECK (true);
CREATE POLICY "service_full_integ"     ON integration_tokens     USING (true) WITH CHECK (true);
