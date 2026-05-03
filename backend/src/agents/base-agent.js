const { chat, buildMessages } = require('../core/anthropic');
const {
  getAgent, updateAgent, saveMessage, getOrCreateConversation,
  getConversationHistory, getOrCreateClient, saveMemory, logActivity, updateOfficeState
} = require('../core/supabase');
const { sendMetaMessage } = require('../core/whatsapp');

class BaseAgent {
  constructor(slug) {
    this.slug = slug;
    this.agentData = null;
    this.io = null; // Socket.io instance, injected by orchestrator
  }

  // Load agent data from DB
  async init() {
    this.agentData = await getAgent(this.slug);
    return this;
  }

  // Override in subclass — return system prompt string
  getSystemPrompt(context = {}) {
    throw new Error(`${this.slug} must implement getSystemPrompt()`);
  }

  // Main entry point: process an incoming message
  async processMessage({ from, text, channel = 'whatsapp', mediaUrl = null, clientName = null }) {
    const start = Date.now();
    if (!this.agentData) await this.init();

    try {
      // Set agent as busy
      await updateAgent(this.slug, { status: 'busy', current_task: `Respondiendo a ${from}` });
      this.emitOfficeUpdate({ animation_state: 'typing', is_speaking: true, bubble_text: '...' });

      // Get/create client and conversation
      const client = await getOrCreateClient(from, clientName, channel);
      const conv = await getOrCreateConversation(client.id, this.agentData.id, channel, from);

      // Get conversation history
      const history = await getConversationHistory(conv.id, 15);

      // Save incoming message
      await saveMessage(conv.id, 'user', text, { media_url: mediaUrl });

      // Build context for system prompt
      const context = { client, conv, history, channel };
      const systemPrompt = this.getSystemPrompt(context);

      // Build messages for Claude
      const messages = buildMessages(
        history.filter(m => m.role !== 'system'),
        text
      );

      // Call Claude
      const response = await chat({ system: systemPrompt, messages });

      // Save response
      await saveMessage(conv.id, 'assistant', response.content, {
        tokens_used: response.inputTokens + response.outputTokens,
        model_used: response.model,
        processing_time_ms: response.durationMs
      });

      // Send reply via WhatsApp
      if (channel === 'whatsapp' && from !== 'internal') {
        await sendMetaMessage(from, response.content);
      }

      // Reset agent status
      await updateAgent(this.slug, { status: 'active', current_task: null });
      this.emitOfficeUpdate({ animation_state: 'idle', is_speaking: false, bubble_text: null });

      // Log activity
      const duration = Date.now() - start;
      await logActivity(this.agentData.id, 'message_processed', {
        from, channel, tokens: response.inputTokens + response.outputTokens
      }, true, duration);

      // Emit message event to frontend
      this.emit('agent:message', {
        agent: this.slug,
        client: client.name,
        message: response.content,
        channel
      });

      return { success: true, response: response.content, conversationId: conv.id };

    } catch (err) {
      console.error(`[${this.slug}] Error:`, err.message);
      await updateAgent(this.slug, { status: 'active', current_task: null });
      await logActivity(this.agentData?.id, 'message_error', { error: err.message }, false);
      throw err;
    }
  }

  // Save something to agent's long-term memory
  async remember(content, memoryType = 'episodic', importance = 0.5) {
    if (!this.agentData) await this.init();
    await saveMemory(this.agentData.id, content, memoryType, importance);
  }

  // Request help from another agent (inter-agent communication)
  async delegateTo(targetSlug, message, taskId = null) {
    if (!this.agentData) await this.init();
    const { supabase } = require('../core/supabase');
    const targetAgent = await getAgent(targetSlug);
    if (!targetAgent) throw new Error(`Agent ${targetSlug} not found`);

    const { data, error } = await supabase.from('agent_interactions').insert({
      from_agent_id: this.agentData.id,
      to_agent_id: targetAgent.id,
      interaction_type: 'delegation',
      task_id: taskId,
      message,
      status: 'pending'
    }).select().single();

    if (error) throw error;

    // Show speech bubble
    this.emitOfficeUpdate({
      is_speaking: true,
      speaking_to: targetAgent.id,
      bubble_text: `👉 ${targetSlug}: ${message.substring(0, 60)}...`,
      bubble_expires_at: new Date(Date.now() + 5000).toISOString()
    });

    this.emit('agent:interaction', { from: this.slug, to: targetSlug, message });
    return data;
  }

  // Emit to frontend via Socket.io
  emit(event, data) {
    if (this.io) this.io.emit(event, data);
  }

  emitOfficeUpdate(fields) {
    if (this.agentData) {
      updateOfficeState(this.agentData.id, fields).catch(() => {});
      this.emit('office:update', { agentSlug: this.slug, ...fields });
    }
  }

  setIo(io) {
    this.io = io;
    return this;
  }
}

module.exports = BaseAgent;
