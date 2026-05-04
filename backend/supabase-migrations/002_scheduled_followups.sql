-- Fractal Virtual Team v4.2 — Tablas para sistema proactivo de Mariana
-- Ejecutar en: https://supabase.com/dashboard/project/djkxkangrpriescgyyel/sql
-- EJECUTAR TAMBIÉN: 001_pending_promises.sql si no se ha ejecutado aún

-- ─── scheduled_followups ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_followups (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type               TEXT NOT NULL,
  -- awaiting_user_info | payment_due | delivery_reminder | quote_silence
  -- inactive_project | client_no_response | morning_checkin | evening_checkin
  -- custom_alert
  context            JSONB DEFAULT '{}',
  -- Flexible: { client_name, project_name, amount, deadline, original_message, etc }
  source             TEXT DEFAULT 'auto',
  -- 'auto' (detectado por Mariana) | 'manual' (creado por Neiky) | 'system' (cron)
  priority           INT DEFAULT 2,
  -- 1=crítico, 2=normal, 3=informativo
  execute_at         TIMESTAMPTZ NOT NULL,
  status             TEXT DEFAULT 'pending',
  -- pending | executed | cancelled | snoozed
  related_client_id  UUID REFERENCES clients(id) ON DELETE SET NULL,
  message_sent       TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  executed_at        TIMESTAMPTZ,
  snoozed_until      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_followups_pending
  ON scheduled_followups(status, execute_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_followups_client
  ON scheduled_followups(related_client_id)
  WHERE related_client_id IS NOT NULL;

-- ─── proactive_log ────────────────────────────────────────────────────────────
-- Registro de todos los mensajes proactivos enviados (para respetar límites diarios)
CREATE TABLE IF NOT EXISTS proactive_log (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type         TEXT NOT NULL,
  channel      TEXT DEFAULT 'whatsapp',
  recipient    TEXT DEFAULT 'neiky',
  message      TEXT,
  sent_at      TIMESTAMPTZ DEFAULT NOW(),
  followup_id  UUID REFERENCES scheduled_followups(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_proactive_log_today
  ON proactive_log(recipient, sent_at);

-- RLS
ALTER TABLE scheduled_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE proactive_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full" ON scheduled_followups USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON proactive_log USING (true) WITH CHECK (true);
