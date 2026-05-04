// backend/src/intelligence/decision-engine.js
// Sistema 5 — Motor de Decisiones: qué decide solo vs escala
'use strict';

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const AUTONOMOUS_SITUATIONS = [
  'standard_response', 'send_reminder', 'schedule_meeting',
  'request_resources', 'acknowledge_message', 'route_to_agent',
  'status_update', 'basic_info_request', 'followup_message'
];

const PROPOSE_SITUATIONS = [
  'pricing_within_range', 'standard_project_acceptance',
  'small_discount', 'minor_timeline_adjustment', 'resource_allocation'
];

const ESCALATE_SITUATIONS = [
  'large_project', 'new_client_premium', 'major_complaint',
  'pricing_above_range', 'cancel_request', 'legal_issue',
  'partnership_opportunity', 'team_capacity_issue', 'crisis'
];

class DecisionEngine {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  classifySituationType(message, context = {}) {
    const text = message.toLowerCase();

    // Escalate triggers (high priority check)
    if (/cancel|lawsuit|legal|demanda/i.test(text)) return 'cancel_request';
    if (/nuevo.*cliente.*premium|alianza|partnership/i.test(text)) return 'partnership_opportunity';
    if (/queja.*grave|muy.*mal|terrible|pesimo/i.test(text)) return 'major_complaint';
    if (/presupuest.*grande|proyecto.*grande|\$\s*[5-9]\d{4,}/i.test(text)) return 'large_project';

    // Propose triggers
    if (/precio|cotiz|presupuest/i.test(text) && !/urgente/i.test(text)) return 'pricing_within_range';
    if (/descuento|rebaj/i.test(text)) return 'small_discount';
    if (/tiemp|deadline|fecha.*entrega/i.test(text)) return 'minor_timeline_adjustment';

    // Autonomous (default)
    if (/recordatorio|reminder/i.test(text)) return 'send_reminder';
    if (/reunión|meeting|junta/i.test(text)) return 'schedule_meeting';
    if (/status|cómo va|update/i.test(text)) return 'status_update';
    return 'standard_response';
  }

  classifyDecisionLevel(situationType) {
    if (AUTONOMOUS_SITUATIONS.includes(situationType)) return 'autonomous';
    if (PROPOSE_SITUATIONS.includes(situationType)) return 'propose';
    return 'escalate';
  }

  async makeDecision(situation, context = {}) {
    const level = this.classifyDecisionLevel(situation.type || 'standard_response');

    // Log decision
    await this._logDecision(situation, level, context);

    if (level === 'autonomous') return { level, action: 'proceed', message: null };
    if (level === 'propose') return { level, action: 'propose', proposal: await this._buildProposal(situation, context) };
    return { level, action: 'escalate', escalation: await this._buildEscalation(situation, context) };
  }

  async _buildProposal(situation, context) {
    const agentName = context.agentName || 'Mariana';
    const clientName = context.clientName || 'el cliente';

    return `Nene, situación con ${clientName}:

📊 Tipo: ${situation.type}
💬 Contexto: ${situation.description || situation.message || ''}

💡 Mi recomendación: ${await this._getAIRecommendation(situation, context)}

¿Procedo así o cambias algo?`;
  }

  async _buildEscalation(situation, context) {
    return `🚨 NECESITO TU DECISIÓN

Situación: ${situation.description || situation.message || situation.type}
Cliente: ${context.clientName || 'N/A'}

💡 Mi análisis: ${await this._getAIRecommendation(situation, context)}

❓ Necesito que decidas: ${situation.what_neiky_needs || 'cómo proceder'}`;
  }

  async _getAIRecommendation(situation, context) {
    try {
      const response = await this.claude.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Situación en agencia creativa: "${situation.description || situation.message || situation.type}"
Cliente: ${context.clientName || 'N/A'}
En 2 oraciones: ¿qué recomiendas hacer?`
        }]
      });
      return response.content[0].text.trim();
    } catch {
      return 'Revisar con Neiky para determinar mejor acción.';
    }
  }

  async _logDecision(situation, level, context) {
    try {
      await this.supabase.from('agent_decisions').insert({
        agent_id: context.agentId || null,
        decision_type: situation.type || 'standard_response',
        decision_level: level,
        situation: situation.description || situation.message || '',
        context: context,
        decision_made: `Nivel: ${level}`,
        decided_at: new Date().toISOString()
      });
    } catch (err) {
      // Non-blocking
      console.warn('[DecisionEngine] log error:', err.message);
    }
  }
}

module.exports = new DecisionEngine();
