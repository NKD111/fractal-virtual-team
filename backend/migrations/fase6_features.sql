-- FASE 6: Features Code Completo - 6 nuevas tablas
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS project_briefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  generated_by UUID REFERENCES agents(id) ON DELETE SET NULL,
  client_name TEXT,
  project_type TEXT,
  objective TEXT,
  target_audience TEXT,
  key_messages JSONB,
  deliverables JSONB,
  timeline TEXT,
  references_links JSONB,
  special_requirements TEXT,
  tone TEXT,
  missing_info JSONB,
  status TEXT DEFAULT 'draft',
  approved_by TEXT,
  revision_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_brief_id UUID REFERENCES project_briefs(id) ON DELETE SET NULL,
  generated_by UUID REFERENCES agents(id) ON DELETE SET NULL,
  service_type TEXT,
  deliverables JSONB,
  estimated_hours JSONB,
  complexity TEXT,
  revision_rounds INT DEFAULT 2,
  final_price DECIMAL(10,2),
  currency TEXT DEFAULT 'MXN',
  status TEXT DEFAULT 'pending_review',
  sent_at TIMESTAMP,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  items JSONB,
  completion_percent INT DEFAULT 0,
  qc_approved BOOLEAN DEFAULT FALSE,
  qc_notes TEXT,
  qc_checked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_health_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  payment_score INT,
  communication_score INT,
  satisfaction_score INT,
  revision_score INT,
  loyalty_score INT,
  overall_score DECIMAL(4,2),
  risk_level TEXT,
  notes TEXT,
  recommendation TEXT,
  calculated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_kpis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE UNIQUE,
  monthly_revenue DECIMAL(10,2),
  monthly_target DECIMAL(10,2),
  revenue_vs_target DECIMAL(5,2),
  active_projects INT,
  completed_this_month INT,
  delayed_projects INT,
  active_clients INT,
  new_clients_month INT,
  churned_clients INT,
  avg_client_health DECIMAL(4,2),
  total_messages_handled INT,
  avg_response_time_ms INT,
  escalations_to_neiky INT,
  oracle_queries_today INT,
  oracle_cost_today DECIMAL(10,4),
  generated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  revision_number INT,
  requested_by TEXT,
  description TEXT,
  is_within_rounds BOOLEAN,
  extra_cost DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_briefs_client ON project_briefs(client_id);
CREATE INDEX IF NOT EXISTS idx_briefs_project ON project_briefs(project_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_health_client ON client_health_scores(client_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_kpis_date ON business_kpis(date DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_project ON project_revisions(project_id);
CREATE INDEX IF NOT EXISTS idx_checklists_project ON delivery_checklists(project_id);
