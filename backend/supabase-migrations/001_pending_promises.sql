-- Fractal Virtual Team v4.2 — Tabla pending_promises
-- Ejecutar en Supabase SQL Editor: https://supabase.com/dashboard/project/djkxkangrpriescgyyel/sql

CREATE TABLE IF NOT EXISTS pending_promises (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id      TEXT NOT NULL DEFAULT 'mariana',
  user_phone    TEXT,
  user_channel  TEXT DEFAULT 'whatsapp',
  socket_id     TEXT,
  promise_text  TEXT NOT NULL,
  original_message TEXT,
  action_type   TEXT NOT NULL, -- 'ask_agent' | 'timed_update' | 'follow_up'
  action_target TEXT,          -- 'diego' | 'carlos' | null
  execute_at    TIMESTAMPTZ NOT NULL,
  status        TEXT DEFAULT 'pending', -- 'pending' | 'executed' | 'failed'
  result        TEXT,
  executed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_pending_promises_status      ON pending_promises(status);
CREATE INDEX IF NOT EXISTS idx_pending_promises_phone       ON pending_promises(user_phone);
CREATE INDEX IF NOT EXISTS idx_pending_promises_execute_at  ON pending_promises(execute_at);
CREATE INDEX IF NOT EXISTS idx_pending_promises_due
  ON pending_promises(user_phone, status, execute_at)
  WHERE status = 'pending';

-- RLS: solo el service role puede escribir
ALTER TABLE pending_promises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_access" ON pending_promises
  USING (true) WITH CHECK (true);
