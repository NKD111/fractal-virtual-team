-- ═══ FASE 5.5: NEXUS + ATLAS — Sistema Dual de Monitoreo ═══
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS monitored_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT,
  importance_level INT DEFAULT 3,
  health_url TEXT,
  base_url TEXT,
  check_frequency_seconds INT DEFAULT 60,
  timeout_seconds INT DEFAULT 10,
  current_status TEXT DEFAULT 'unknown',
  last_checked_at TIMESTAMP,
  last_response_time_ms INT,
  consecutive_failures INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS synthetic_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID REFERENCES monitored_services(id) ON DELETE CASCADE,
  service_key TEXT,
  status TEXT NOT NULL,
  response_time_ms INT,
  error_message TEXT,
  details JSONB,
  tested_at TIMESTAMP DEFAULT NOW(),
  executed_by TEXT DEFAULT 'ATLAS'
);

CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  service_key TEXT,
  service_id UUID REFERENCES monitored_services(id) ON DELETE SET NULL,
  playbook_name TEXT,
  action_type TEXT,
  success BOOLEAN,
  details JSONB,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS predictive_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID REFERENCES monitored_services(id) ON DELETE CASCADE,
  service_key TEXT,
  service_name TEXT,
  degradation_rate FLOAT,
  confidence FLOAT,
  predicted_failure_in_minutes INT,
  recent_failure_rate FLOAT,
  historical_failure_rate FLOAT,
  avg_response_time_recent FLOAT,
  avg_response_time_historical FLOAT,
  sample_count INT,
  preventive_action_taken BOOLEAN DEFAULT FALSE,
  prediction_accurate BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_name TEXT NOT NULL,
  plan_name TEXT,
  monthly_cost DECIMAL(10, 2),
  currency TEXT DEFAULT 'USD',
  billing_cycle TEXT,
  next_billing_date DATE,
  credit_balance DECIMAL(10, 2),
  credit_limit DECIMAL(10, 2),
  usage_current_period DECIMAL(10, 2),
  usage_limit DECIMAL(10, 2),
  alert_at_credit_remaining DECIMAL(10, 2),
  alert_days_before_billing INT DEFAULT 7,
  alert_at_usage_percent INT DEFAULT 80,
  current_status TEXT DEFAULT 'active',
  last_checked_at TIMESTAMP,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID REFERENCES service_subscriptions(id) ON DELETE CASCADE,
  alert_type TEXT,
  severity TEXT,
  message TEXT,
  days_until_critical INT,
  amount_remaining DECIMAL(10, 2),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auto_repair_playbooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  service_key TEXT NOT NULL,
  issue_type TEXT NOT NULL DEFAULT 'generic',
  action_type TEXT NOT NULL,
  priority INT DEFAULT 1,
  config JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  times_used INT DEFAULT 0,
  times_successful INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_health_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_date DATE UNIQUE,
  total_services_monitored INT DEFAULT 0,
  services_healthy INT DEFAULT 0,
  services_degraded INT DEFAULT 0,
  services_down INT DEFAULT 0,
  errors_detected INT DEFAULT 0,
  errors_auto_repaired INT DEFAULT 0,
  predictions_made INT DEFAULT 0,
  uptime_percentage DECIMAL(5, 2),
  total_synthetic_test_cost DECIMAL(10, 6) DEFAULT 0,
  generated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_monitored_services_status ON monitored_services(current_status);
CREATE INDEX IF NOT EXISTS idx_monitored_services_key ON monitored_services(service_key);
CREATE INDEX IF NOT EXISTS idx_synthetic_tests_service ON synthetic_tests(service_id, tested_at DESC);
CREATE INDEX IF NOT EXISTS idx_synthetic_tests_key ON synthetic_tests(service_key, tested_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictive_alerts_service ON predictive_alerts(service_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_alerts_unresolved ON financial_alerts(resolved, severity);
CREATE INDEX IF NOT EXISTS idx_playbooks_service ON auto_repair_playbooks(service_key, issue_type);

-- Seed default playbooks
INSERT INTO auto_repair_playbooks (name, service_key, issue_type, action_type, priority, config) VALUES
  ('Supabase Connection Retry', 'supabase', 'connection_failure', 'retry_connection', 3, '{}'),
  ('Supabase Generic', 'supabase', 'generic', 'retry_connection', 1, '{}'),
  ('Redis Ping Retry', 'redis', 'connection_failure', 'retry_connection', 3, '{}'),
  ('Redis State Reset', 'redis', 'degradation', 'reset_state', 2, '{}'),
  ('Backend Restart Signal', 'railway_backend', 'generic', 'restart_worker', 1, '{}'),
  ('Cache Clear', 'railway_backend', 'high_memory', 'clear_cache', 2, '{}')
ON CONFLICT DO NOTHING;
