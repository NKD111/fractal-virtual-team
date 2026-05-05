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
