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
