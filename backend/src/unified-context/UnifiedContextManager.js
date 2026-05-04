// backend/src/unified-context/UnifiedContextManager.js
// Fase 7: identifies users across channels (whatsapp, web), loads full context,
// processes messages through agents, and broadcasts events to connected clients.

const { supabase } = require('../core/supabase');
const { getAgent } = require('../core/orchestrator');

class UnifiedContextManager {
  constructor() {
    this.activeContexts = new Map(); // userId → cached context (TTL 30 min)
  }

  // ── Identify or create a user by channel + identifier ──────────────────────
  async identifyUser({ channel, identifier }) {
    if (!identifier) throw new Error('identifyUser: identifier required');
    let user = null;
    try {
      if (channel === 'whatsapp') {
        const phone = String(identifier).replace('whatsapp:', '');
        const { data } = await supabase
          .from('users')
          .select('*')
          .or(`whatsapp.eq.${phone},phone.eq.${phone}`)
          .limit(1)
          .maybeSingle();
        user = data;
      } else if (channel === 'web') {
        // web: identifier is either users.id (UUID) or users.web_session (free string)
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(identifier));
        const q = supabase.from('users').select('*');
        const { data } = isUuid
          ? await q.eq('id', identifier).limit(1).maybeSingle()
          : await q.eq('web_session', identifier).limit(1).maybeSingle();
        user = data;
      } else if (channel === 'email') {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('email', identifier)
          .limit(1)
          .maybeSingle();
        user = data;
      }
    } catch (_) { user = null; }

    if (!user) {
      const insertPayload = {
        name: 'Usuario',
        first_seen_at: new Date().toISOString(),
        first_channel: channel
      };
      if (channel === 'whatsapp') {
        const phone = String(identifier).replace('whatsapp:', '');
        insertPayload.whatsapp = phone;
        insertPayload.phone = phone;
      } else if (channel === 'web') {
        insertPayload.web_session = String(identifier);
      } else if (channel === 'email') {
        insertPayload.email = String(identifier);
      }
      const { data, error } = await supabase.from('users').insert(insertPayload).select().single();
      if (error) throw new Error(`createUser failed: ${error.message}`);
      user = data;
    }

    // Touch last_active_at (best-effort)
    try {
      await supabase.from('users').update({ last_active_at: new Date().toISOString() }).eq('id', user.id);
    } catch (_) {}

    return user;
  }

  // ── Get full context for a user (recent conversations + projects + promises) ─
  async getFullContext(userId) {
    if (this.activeContexts.has(userId)) return this.activeContexts.get(userId);

    let userRow = null, conversations = [], activeProjects = [], pendingPromises = [];
    try {
      const { data } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
      userRow = data;
    } catch (_) {}

    try {
      const { data } = await supabase.from('conversations')
        .select('id, channel, last_message_at, summary')
        .order('last_message_at', { ascending: false }).limit(20);
      conversations = data || [];
    } catch (_) {}

    try {
      const { data } = await supabase.from('projects')
        .select('id, name, status, deadline, client_id')
        .not('status', 'in', '("completed","cancelled")');
      activeProjects = data || [];
    } catch (_) {}

    try {
      const { data } = await supabase.from('pending_promises')
        .select('id, promise_text, execute_at, status')
        .eq('status', 'pending');
      pendingPromises = data || [];
    } catch (_) {}

    const ctx = {
      user: userRow,
      conversations,
      activeProjects,
      pendingPromises,
      loadedAt: new Date().toISOString()
    };
    this.activeContexts.set(userId, ctx);
    setTimeout(() => this.activeContexts.delete(userId), 30 * 60 * 1000);
    return ctx;
  }

  // ── Process a message through an agent, broadcast events ───────────────────
  async processMessage({ channel, identifier, message, agentName = 'mariana' }) {
    if (!message) throw new Error('message required');
    const user = await this.identifyUser({ channel, identifier });
    const context = await this.getFullContext(user.id);

    // Build Mariana-compatible call: she expects ({from, text, channel})
    const agent = getAgent(agentName);
    if (!agent) throw new Error(`Agent ${agentName} not found`);

    const fromId = channel === 'whatsapp' ? user.whatsapp : `web_${user.id}`;
    let responseText = '';
    try {
      const result = await agent.processMessage({
        from: fromId,
        text: message,
        channel,
        clientName: user.name || null
      });
      responseText = (typeof result === 'string') ? result : (result?.response || result?.text || '');
    } catch (err) {
      console.error('[UCM] agent.processMessage error:', err.message);
      responseText = 'Disculpa, hubo un problema procesando tu mensaje.';
    }

    // Persist messages with the new schema columns (user_id, source_channel, agent_name)
    try {
      await supabase.from('messages').insert([
        { user_id: user.id, role: 'user', content: message, source_channel: channel, created_at: new Date().toISOString() },
        { user_id: user.id, role: 'assistant', content: responseText, source_channel: channel, agent_name: agentName, created_at: new Date().toISOString() }
      ]);
    } catch (err) {
      // Schema-cache miss is non-fatal
      console.warn('[UCM] message persist warn:', err.message);
    }

    // Broadcast to connected web clients
    this.broadcastEvent({
      type: 'message_processed',
      user_id: user.id,
      agent: agentName,
      source_channel: channel,
      preview: String(responseText).substring(0, 200)
    });

    return {
      ok: true,
      text: responseText,
      response: responseText,
      user_id: user.id,
      agent: agentName,
      source_channel: channel
    };
  }

  // ── Broadcast helpers ─────────────────────────────────────────────────────
  broadcastEvent(event) {
    try {
      if (global.io) global.io.emit('agent_event', { ...event, timestamp: new Date().toISOString() });
    } catch (_) {}
  }

  async syncAgentAction({ userId, agentName, action, data = {} }) {
    try {
      if (global.io) {
        global.io.emit('agent_action', { user_id: userId, agent: agentName, action, data, timestamp: new Date().toISOString() });
      }
    } catch (_) {}
  }

  // Inter-agent visible chat: emit so frontend can render bubbles
  emitInterAgentChat({ from, to, message }) {
    try {
      if (global.io) {
        global.io.emit('inter_agent_chat', { from, to, message, timestamp: new Date().toISOString() });
      }
    } catch (_) {}
  }
}

let _instance = null;
function getUCM() {
  if (!_instance) _instance = new UnifiedContextManager();
  return _instance;
}

module.exports = { UnifiedContextManager, getUCM };
