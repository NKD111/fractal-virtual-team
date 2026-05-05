-- 008_unicorn.sql — features de unicornio
-- Embeddable widget leads · Client portal tokens · Insights · Voice cache

-- 1. LEADS captados por el embeddable Mariana widget
CREATE TABLE IF NOT EXISTS embed_leads (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_url  TEXT,
  visitor_id  TEXT,
  name        TEXT,
  email       TEXT,
  phone       TEXT,
  conversation JSONB DEFAULT '[]'::jsonb,
  qualified   BOOLEAN DEFAULT false,
  qual_notes  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_qualified ON embed_leads(qualified);
CREATE INDEX IF NOT EXISTS idx_leads_created   ON embed_leads(created_at DESC);

-- 2. CLIENT PORTAL: tokens firmados para acceso read-only a su mini-Office
CREATE TABLE IF NOT EXISTS client_portal_tokens (
  token       TEXT PRIMARY KEY,
  client_id   UUID,
  client_name TEXT,
  scope       JSONB DEFAULT '{}'::jsonb,    -- { project_ids: [...], agent: 'mariana' }
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_used   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_portal_client ON client_portal_tokens(client_id);

-- 3. INSIGHTS: patrones detectados semanales
CREATE TABLE IF NOT EXISTS insights (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ DEFAULT NOW(),
  kind        TEXT,                  -- 'pattern' | 'risk' | 'opportunity' | 'optimization'
  title       TEXT NOT NULL,
  body        TEXT,
  metric      TEXT,
  affected    JSONB DEFAULT '[]'::jsonb,  -- [client_ids/agent_slugs]
  severity    TEXT DEFAULT 'info',    -- 'info' | 'warn' | 'high'
  acknowledged BOOLEAN DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_insights_ts       ON insights(ts DESC);
CREATE INDEX IF NOT EXISTS idx_insights_severity ON insights(severity);

-- 4. VOICE TTS CACHE: no regeneramos audio para los mismos textos
CREATE TABLE IF NOT EXISTS voice_cache (
  text_hash   TEXT PRIMARY KEY,
  agent_slug  TEXT NOT NULL,
  audio_url   TEXT NOT NULL,
  bytes       INT,
  ms          INT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE embed_leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights             ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_cache          ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_leads"     ON embed_leads          USING (true) WITH CHECK (true);
CREATE POLICY "service_full_portal"    ON client_portal_tokens USING (true) WITH CHECK (true);
CREATE POLICY "service_full_insights"  ON insights             USING (true) WITH CHECK (true);
CREATE POLICY "service_full_voice"     ON voice_cache          USING (true) WITH CHECK (true);
