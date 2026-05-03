require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: { persistSession: false },
    db: { schema: 'public' }
  }
);

// Convenience: run raw SQL (service role)
async function query(sql, params = []) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) throw error;
  return data;
}

// Get agent by slug
async function getAgent(slug) {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error) throw error;
  return data;
}

// Update agent status/mood/energy
async function updateAgent(slug, fields) {
  const { error } = await supabase
    .from('agents')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('slug', slug);
  if (error) throw error;
}

// Save a message
async function saveMessage(conversationId, role, content, metadata = {}) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, role, content, metadata })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Get or create conversation
async function getOrCreateConversation(clientId, agentId, channel, externalId) {
  let { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('client_id', clientId)
    .eq('agent_id', agentId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) {
    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({ client_id: clientId, agent_id: agentId, channel, external_id: externalId })
      .select()
      .single();
    if (error) throw error;
    data = newConv;
  }
  return data;
}

// Get recent messages from conversation
async function getConversationHistory(conversationId, limit = 20) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).reverse();
}

// Get or create client by phone
async function getOrCreateClient(phone, name = null, channel = 'whatsapp') {
  const cleanPhone = phone.replace('whatsapp:', '');
  let { data } = await supabase
    .from('clients')
    .select('*')
    .eq('whatsapp', cleanPhone)
    .single();

  if (!data) {
    const { data: newClient, error } = await supabase
      .from('clients')
      .insert({ name: name || 'Cliente', whatsapp: cleanPhone, phone: cleanPhone })
      .select()
      .single();
    if (error) throw error;
    data = newClient;
  }
  return data;
}

// Save agent memory
async function saveMemory(agentId, content, memoryType = 'episodic', importance = 0.5) {
  const { error } = await supabase
    .from('agent_memories')
    .insert({ agent_id: agentId, content, memory_type: memoryType, importance });
  if (error) console.error('Memory save error:', error.message);
}

// Log agent activity
async function logActivity(agentId, action, details = {}, success = true, durationMs = null) {
  await supabase.from('agent_logs').insert({
    agent_id: agentId,
    action,
    details,
    success,
    duration_ms: durationMs
  });
}

// Update office state
async function updateOfficeState(agentId, fields) {
  await supabase
    .from('office_state')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('agent_id', agentId);
}

module.exports = {
  supabase,
  getAgent,
  updateAgent,
  saveMessage,
  getOrCreateConversation,
  getConversationHistory,
  getOrCreateClient,
  saveMemory,
  logActivity,
  updateOfficeState
};
