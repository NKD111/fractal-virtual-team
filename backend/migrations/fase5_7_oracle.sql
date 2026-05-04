-- FASE 5.7: ORACLE - Sistema de Inteligencia Compartida
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS oracle_queries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  agent_name TEXT,
  question TEXT NOT NULL,
  context JSONB,
  query_type TEXT,
  model_used TEXT,
  estimated_cost DECIMAL(10,6),
  actual_cost DECIMAL(10,6),
  response TEXT,
  response_quality_score DECIMAL(3,2),
  was_useful BOOLEAN,
  feedback_from_agent TEXT,
  response_time_ms INT,
  tokens_used JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oracle_quotas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  daily_quick_queries INT DEFAULT 100,
  daily_standard_queries INT DEFAULT 30,
  daily_premium_queries INT DEFAULT 10,
  daily_research_queries INT DEFAULT 5,
  used_today_quick INT DEFAULT 0,
  used_today_standard INT DEFAULT 0,
  used_today_premium INT DEFAULT 0,
  used_today_research INT DEFAULT 0,
  daily_cost_accumulated DECIMAL(10,4) DEFAULT 0,
  monthly_cost_accumulated DECIMAL(10,4) DEFAULT 0,
  last_reset_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_id)
);

CREATE TABLE IF NOT EXISTS oracle_research (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic TEXT NOT NULL,
  category TEXT,
  research_depth TEXT,
  sources_consulted JSONB,
  summary TEXT,
  key_insights JSONB,
  full_content TEXT,
  requested_by UUID REFERENCES agents(id) ON DELETE SET NULL,
  shared_with UUID[],
  times_consulted INT DEFAULT 0,
  effectiveness_score DECIMAL(3,2),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oracle_distributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  insight_topic TEXT,
  insight_content TEXT,
  importance INT,
  distributed_to UUID[],
  agents_acknowledged UUID[],
  agents_applied UUID[],
  effectiveness_feedback JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oracle_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE UNIQUE,
  total_queries INT DEFAULT 0,
  queries_by_model JSONB,
  queries_by_agent JSONB,
  total_cost DECIMAL(10,4),
  cost_by_model JSONB,
  cost_optimization_savings DECIMAL(10,4),
  avg_response_time_ms INT,
  satisfaction_score DECIMAL(3,2),
  most_consulted_topics JSONB,
  most_active_agents JSONB,
  generated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_oracle_queries_agent ON oracle_queries(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oracle_queries_type ON oracle_queries(query_type);
CREATE INDEX IF NOT EXISTS idx_oracle_queries_model ON oracle_queries(model_used, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oracle_research_category ON oracle_research(category);
CREATE INDEX IF NOT EXISTS idx_oracle_research_topic ON oracle_research(topic);
CREATE INDEX IF NOT EXISTS idx_oracle_distributions_recent ON oracle_distributions(created_at DESC);

-- Function: increment quota counter atomically
CREATE OR REPLACE FUNCTION increment_quota(agent_id UUID, field_name TEXT)
RETURNS void AS $$
BEGIN
  EXECUTE format(
    'UPDATE oracle_quotas SET %I = %I + 1 WHERE agent_id = $1',
    field_name, field_name
  ) USING agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
