-- ALL_PENDING.sql — concatena 006-011 en orden seguro para Supabase SQL Editor
-- Generado 2026-05-05T07:43:27Z
-- Pega completo en https://supabase.com/dashboard → tu proyecto → SQL Editor → Run
-- Idempotente: usa CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS


-- ════════════════════════════════════════════════════════════════
-- ▶ 006_tasks.sql
-- ════════════════════════════════════════════════════════════════
-- 006_tasks.sql — task lifecycle tracking + deliverables
-- Cada solicitud que entra por /api/task/dispatch o WhatsApp delegation
-- queda persistida con su status, agente asignado, deliverables prometidos
-- y comprobantes (image URLs, email IDs).

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL,           -- 'web' | 'whatsapp'
  user_email      TEXT,
  message         TEXT NOT NULL,
  brief           TEXT,
  agent_assigned  TEXT,
  supervisor      TEXT,
  needs_visual    BOOLEAN DEFAULT false,
  status          TEXT DEFAULT 'pending',  -- pending | classifying | working | reviewing | delivered | failed
  promised        JSONB DEFAULT '[]'::jsonb,   -- [{type:'image'|'doc'|'email', desc:'...'}]
  delivered       JSONB DEFAULT '[]'::jsonb,   -- [{type, url|content, ts}]
  email_subject   TEXT,
  email_id        TEXT,
  image_url       TEXT,
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent  ON tasks(agent_assigned);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_access_tasks" ON tasks USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════
-- ▶ 007_telemetry.sql
-- ════════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════════
-- ▶ 008_unicorn.sql
-- ════════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════════
-- ▶ 009_growth.sql
-- ════════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════════
-- ▶ 010_revenue.sql
-- ════════════════════════════════════════════════════════════════
-- 010_revenue.sql — Autonomous Revenue Engine
-- Pipeline de 7 fases: ideación → consejo → producción → QC → publish → tracking → P&L

-- 1. PRODUCTS — el activo digital generado
CREATE TABLE IF NOT EXISTS revenue_products (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kind          TEXT NOT NULL,            -- 'ebook' | 'course' | 'template' | 'audio'
  niche         TEXT,
  topic         TEXT,
  title         TEXT,
  subtitle      TEXT,
  description   TEXT,
  outline       JSONB,                    -- estructura de capítulos
  content_md    TEXT,                     -- markdown completo (ebook)
  cover_url     TEXT,
  promo_video_url TEXT,
  landing_url   TEXT,
  files         JSONB DEFAULT '[]'::jsonb, -- [{name, url, format}]
  price_usd     NUMERIC(10,2) DEFAULT 19,
  status        TEXT DEFAULT 'ideation',  -- ideation | proposed | approved | rejected
                                          -- producing | qc | publishing | live | paused
  council_score NUMERIC(3,1),             -- 0-10 viabilidad
  platforms     JSONB DEFAULT '[]'::jsonb,-- [{platform, listing_url, product_id}]
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_by    TEXT DEFAULT 'mariana',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  published_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rp_status ON revenue_products(status);
CREATE INDEX IF NOT EXISTS idx_rp_kind   ON revenue_products(kind);

-- 2. COUNCIL VOTES — voto del Consejo (Diana/Roberto/Valentina/Sofia)
CREATE TABLE IF NOT EXISTS council_votes (
  id          BIGSERIAL PRIMARY KEY,
  product_id  UUID REFERENCES revenue_products(id) ON DELETE CASCADE,
  voter       TEXT NOT NULL,              -- agent slug
  vote        TEXT NOT NULL,              -- 'approve' | 'reject' | 'abstain'
  score       NUMERIC(3,1),                -- 0-10
  reason      TEXT,
  ts          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cv_product ON council_votes(product_id);

-- 3. CAMPAIGNS — push pagado o orgánico
CREATE TABLE IF NOT EXISTS revenue_campaigns (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id  UUID REFERENCES revenue_products(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,              -- 'meta_ads' | 'google_ads' | 'organic_ig' | 'organic_x' | 'newsletter'
  creative    JSONB DEFAULT '{}'::jsonb,   -- {hook, body, cta, image_url, video_url}
  budget_usd  NUMERIC(10,2) DEFAULT 0,
  spend_usd   NUMERIC(10,2) DEFAULT 0,
  status      TEXT DEFAULT 'draft',       -- draft | scheduled | running | paused | finished
  scheduled_at TIMESTAMPTZ,
  external_id TEXT,                       -- ID en Meta/Google
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. METRICS DAILY — Lucas las pulla cada día
CREATE TABLE IF NOT EXISTS revenue_metrics_daily (
  id          BIGSERIAL PRIMARY KEY,
  product_id  UUID REFERENCES revenue_products(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  impressions INT DEFAULT 0,
  clicks      INT DEFAULT 0,
  conversions INT DEFAULT 0,
  sales_n     INT DEFAULT 0,
  revenue_usd NUMERIC(10,2) DEFAULT 0,
  ad_spend_usd NUMERIC(10,2) DEFAULT 0,
  source      TEXT,                       -- 'stripe' | 'gumroad' | 'manual'
  raw         JSONB DEFAULT '{}'::jsonb,
  UNIQUE (product_id, date, source)
);
CREATE INDEX IF NOT EXISTS idx_rmd_date ON revenue_metrics_daily(date DESC);

-- 5. EVENTS LOG (timeline del producto)
CREATE TABLE IF NOT EXISTS revenue_events (
  id          BIGSERIAL PRIMARY KEY,
  product_id  UUID REFERENCES revenue_products(id) ON DELETE CASCADE,
  ts          TIMESTAMPTZ DEFAULT NOW(),
  agent       TEXT,
  phase       TEXT,
  event       TEXT,
  details     JSONB
);
CREATE INDEX IF NOT EXISTS idx_re_product ON revenue_events(product_id);

ALTER TABLE revenue_products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE council_votes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_metrics_daily  ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_events         ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_rp"  ON revenue_products       USING (true) WITH CHECK (true);
CREATE POLICY "service_full_cv"  ON council_votes          USING (true) WITH CHECK (true);
CREATE POLICY "service_full_rc"  ON revenue_campaigns      USING (true) WITH CHECK (true);
CREATE POLICY "service_full_rmd" ON revenue_metrics_daily  USING (true) WITH CHECK (true);
CREATE POLICY "service_full_re"  ON revenue_events         USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════
-- ▶ 011_funnel.sql
-- ════════════════════════════════════════════════════════════════
-- 011_funnel.sql — Multi-product funnel + subscriptions + blog + email drip
-- Sobre revenue_products extiende para soportar funnels completos por nicho.

ALTER TABLE revenue_products
  ADD COLUMN IF NOT EXISTS funnel_id UUID,
  ADD COLUMN IF NOT EXISTS funnel_role TEXT,        -- 'lead_magnet' | 'tripwire' | 'core' | 'upsell' | 'subscription'
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS recurring_interval TEXT; -- null | 'month' | 'year'

CREATE INDEX IF NOT EXISTS idx_rp_funnel ON revenue_products(funnel_id);

-- 1. FUNNELS — agrupa N productos del mismo nicho
CREATE TABLE IF NOT EXISTS funnels (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  niche       TEXT NOT NULL,
  audience    TEXT,
  positioning TEXT,
  status      TEXT DEFAULT 'building',  -- building | live | paused
  metrics     JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SUBSCRIBERS — emails capturados por lead magnets / newsletters
CREATE TABLE IF NOT EXISTS subscribers (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT NOT NULL,
  funnel_id   UUID,
  source      TEXT,                     -- 'lead_magnet' | 'widget' | 'newsletter' | 'manual'
  status      TEXT DEFAULT 'active',    -- active | unsubscribed | bounced
  tags        JSONB DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (email, funnel_id)
);
CREATE INDEX IF NOT EXISTS idx_subs_funnel ON subscribers(funnel_id);

-- 3. EMAIL DRIP — secuencia de nurture programada por funnel
CREATE TABLE IF NOT EXISTS email_drips (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id   UUID,
  step        INT NOT NULL,             -- 1, 2, 3...
  delay_hours INT DEFAULT 24,           -- desde signup
  subject     TEXT,
  html        TEXT,
  cta_url     TEXT,
  active      BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_drip_funnel ON email_drips(funnel_id, step);

CREATE TABLE IF NOT EXISTS email_drip_sent (
  id          BIGSERIAL PRIMARY KEY,
  subscriber_id UUID,
  drip_id     UUID,
  ts          TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BLOG POSTS — Alex/Diego producen artículos SEO + affiliate
CREATE TABLE IF NOT EXISTS blog_posts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id   UUID,
  slug        TEXT UNIQUE,
  title       TEXT NOT NULL,
  meta_desc   TEXT,
  cover_url   TEXT,
  body_md     TEXT,
  affiliate_links JSONB DEFAULT '[]'::jsonb,  -- [{name, url, commission_pct}]
  views       INT DEFAULT 0,
  conversions INT DEFAULT 0,
  status      TEXT DEFAULT 'draft',     -- draft | published
  published_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_funnel ON blog_posts(funnel_id);

-- 5. SUBSCRIPTIONS — productos recurrentes con Stripe sub
CREATE TABLE IF NOT EXISTS product_subscriptions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id  UUID REFERENCES revenue_products(id),
  customer_email TEXT,
  stripe_sub_id  TEXT,
  status      TEXT DEFAULT 'active',    -- active | past_due | canceled
  amount_usd  NUMERIC(10,2),
  next_renewal TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE funnels                ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_drips            ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_drip_sent        ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_subscriptions  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_funnels" ON funnels                USING (true) WITH CHECK (true);
CREATE POLICY "service_full_subs"    ON subscribers            USING (true) WITH CHECK (true);
CREATE POLICY "service_full_drip"    ON email_drips            USING (true) WITH CHECK (true);
CREATE POLICY "service_full_dripsent"ON email_drip_sent        USING (true) WITH CHECK (true);
CREATE POLICY "service_full_blog"    ON blog_posts             USING (true) WITH CHECK (true);
CREATE POLICY "service_full_psubs"   ON product_subscriptions  USING (true) WITH CHECK (true);

