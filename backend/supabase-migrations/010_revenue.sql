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
