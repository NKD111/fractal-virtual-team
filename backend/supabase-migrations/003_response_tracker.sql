-- Fractal Virtual Team v4.2 — Sistema de Seguimiento Inteligente
-- Tabla: pending_user_responses
-- Ejecutar en: https://supabase.com/dashboard/project/djkxkangrpriescgyyel/sql

CREATE TABLE IF NOT EXISTS pending_user_responses (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id             TEXT NOT NULL DEFAULT 'mariana',
  user_id              TEXT DEFAULT 'neiky_unified',

  -- La pregunta original
  original_message     TEXT NOT NULL,
  asked_at             TIMESTAMPTZ DEFAULT NOW(),

  -- Tipo de pregunta para priorizar
  question_type        TEXT,
  -- 'pricing_approval' | 'client_decision' | 'info_request' | 'status_update' | 'casual'
  urgency_level        INT DEFAULT 2,
  -- 1 (casual) .. 5 (crítico)

  -- Contexto flexible
  context              JSONB DEFAULT '{}',
  -- { client_name, project_name, what, topic, etc }

  -- Referencias opcionales
  related_project_id   UUID,
  related_client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Sistema de reminders
  status               TEXT DEFAULT 'awaiting_response',
  -- awaiting_response | answered | cancelled | escalated
  reminder_count       INT DEFAULT 0,
  last_reminder_at     TIMESTAMPTZ,
  next_reminder_at     TIMESTAMPTZ,
  max_reminders        INT DEFAULT 3,

  -- Resolución
  answered_at          TIMESTAMPTZ,
  was_escalated        BOOLEAN DEFAULT FALSE,

  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pending_responses
  ON pending_user_responses(status, next_reminder_at)
  WHERE status = 'awaiting_response';

CREATE INDEX IF NOT EXISTS idx_pending_by_agent
  ON pending_user_responses(agent_id, status);

CREATE INDEX IF NOT EXISTS idx_pending_by_urgency
  ON pending_user_responses(urgency_level, status)
  WHERE status = 'awaiting_response';

-- RLS
ALTER TABLE pending_user_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full" ON pending_user_responses USING (true) WITH CHECK (true);
