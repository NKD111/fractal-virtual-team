-- ═══ FASE 5: MEGAZORD - Sistema Nervioso Colectivo ═══
-- Run this in Supabase SQL Editor

-- Memoria colectiva del equipo
CREATE TABLE IF NOT EXISTS collective_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL, -- 'client_insight' | 'pattern' | 'lesson' | 'best_practice'
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  context JSONB,

  -- Metadata
  contributed_by UUID REFERENCES agents(id),
  client_specific UUID REFERENCES clients(id),
  project_specific UUID,

  -- Knowledge graph
  related_memories UUID[],
  tags TEXT[],

  -- Validación
  validated_by UUID[],
  effectiveness_score FLOAT DEFAULT 0,
  times_applied INT DEFAULT 0,
  times_validated_correct INT DEFAULT 0,

  -- Lifecycle
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Eventos del bus de comunicación
CREATE TABLE IF NOT EXISTS channel_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  priority INT DEFAULT 3, -- 1 (low) to 5 (critical)

  -- Origen y destino
  emitted_by UUID REFERENCES agents(id),
  intended_for UUID[],

  -- Payload
  payload JSONB NOT NULL DEFAULT '{}',
  context JSONB,

  -- Tracking
  received_by UUID[],
  acknowledged_by UUID[],

  -- Lifecycle
  emitted_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  status TEXT DEFAULT 'active' -- 'active' | 'consumed' | 'expired'
);

-- Huddles (reuniones virtuales automáticas)
CREATE TABLE IF NOT EXISTS virtual_huddles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic TEXT NOT NULL,
  trigger_reason TEXT,

  -- Participantes
  initiated_by UUID REFERENCES agents(id),
  participants UUID[],
  participants_responses JSONB,

  -- Contenido
  context JSONB,
  decision_needed TEXT,
  proposed_options JSONB,

  -- Resolución
  consensus_reached BOOLEAN DEFAULT FALSE,
  final_decision TEXT,
  decision_made_by UUID REFERENCES agents(id),

  -- Lifecycle
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  duration_seconds INT,
  status TEXT DEFAULT 'in_progress' -- 'in_progress' | 'resolved' | 'escalated'
);

-- Conflictos detectados entre agentes
CREATE TABLE IF NOT EXISTS agent_conflicts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_a UUID REFERENCES agents(id),
  agent_b UUID REFERENCES agents(id),

  conflict_type TEXT,
  agent_a_position TEXT,
  agent_b_position TEXT,

  context JSONB,
  related_project UUID,

  resolution_method TEXT,
  resolution TEXT,
  resolved_at TIMESTAMP,

  detected_at TIMESTAMP DEFAULT NOW()
);

-- Knowledge graph relationships
CREATE TABLE IF NOT EXISTS knowledge_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID REFERENCES collective_memory(id) ON DELETE CASCADE,
  target_id UUID REFERENCES collective_memory(id) ON DELETE CASCADE,
  relationship_type TEXT, -- 'related_to' | 'contradicts' | 'enhances' | 'replaces'
  strength FLOAT DEFAULT 0.5,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Auto-coordinación entre agentes
CREATE TABLE IF NOT EXISTS agent_collaborations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID,

  primary_agent UUID REFERENCES agents(id),
  collaborating_agents UUID[],

  collaboration_type TEXT DEFAULT 'parallel_work',
  status TEXT DEFAULT 'active',

  context JSONB,
  outcomes JSONB,

  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_memory_category ON collective_memory(category, is_active);
CREATE INDEX IF NOT EXISTS idx_memory_client ON collective_memory(client_specific);
CREATE INDEX IF NOT EXISTS idx_memory_tags ON collective_memory USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_events_channel ON channel_events(channel, status);
CREATE INDEX IF NOT EXISTS idx_events_emitted_at ON channel_events(emitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_huddles_active ON virtual_huddles(status, started_at);
CREATE INDEX IF NOT EXISTS idx_conflicts_unresolved ON agent_conflicts(detected_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_collaborations_active ON agent_collaborations(status, started_at DESC);
