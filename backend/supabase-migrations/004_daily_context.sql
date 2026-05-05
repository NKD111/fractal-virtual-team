-- 004_daily_context.sql
-- Fase 8.5: store the daily standup synthesis. One row per day; upsert by date.

CREATE TABLE IF NOT EXISTS daily_context (
  context_date    DATE PRIMARY KEY,
  reports         JSONB NOT NULL DEFAULT '{}'::jsonb,
  oracle_summary  TEXT,
  project_count   INTEGER DEFAULT 0,
  promise_count   INTEGER DEFAULT 0,
  generated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_context_date ON daily_context (context_date DESC);
