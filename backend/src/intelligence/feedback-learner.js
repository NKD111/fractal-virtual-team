// backend/src/intelligence/feedback-learner.js
// Sistema 6 — Feedback Learner: aprende de las correcciones de Neiky
'use strict';

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

class FeedbackLearner {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Patrones que indican corrección de Neiky
    this.correctionPatterns = [
      /no.*así|eso.*mal|incorrecto|equivocad/i,
      /mejor.*deb|en.*lugar.*de|más.*bien/i,
      /te dije|ya.*acord|recuerda que/i,
      /no.*vuelv|la.*próxima|aprende/i
    ];
  }

  isCorrection(message) {
    return this.correctionPatterns.some(p => p.test(message));
  }

  async captureCorrection(originalAction, correctionText, agentId) {
    try {
      const lesson = await this._extractLesson(originalAction, correctionText);

      const { data } = await this.supabase
        .from('learning_events')
        .insert({
          agent_id: agentId || null,
          original_action: typeof originalAction === 'string'
            ? originalAction.substring(0, 500)
            : JSON.stringify(originalAction).substring(0, 500),
          correction_received: correctionText.substring(0, 500),
          lesson_learned: lesson,
          learned_at: new Date().toISOString(),
          applied_to_behavior: false
        })
        .select()
        .single();

      if (data) {
        await this._updateAgentDynamicRules(agentId, lesson);
        console.log(`[FeedbackLearner] Lección guardada para agente ${agentId}: ${lesson.substring(0, 60)}...`);
      }

      return lesson;
    } catch (err) {
      console.warn('[FeedbackLearner] captureCorrection error:', err.message);
      return null;
    }
  }

  async _extractLesson(originalAction, correction) {
    try {
      const response = await this.claude.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Acción original: "${originalAction}"
Corrección recibida: "${correction}"

En una oración clara, ¿cuál es la lección aprendida para el agente? Sé específico y accionable.`
        }]
      });
      return response.content[0].text.trim();
    } catch {
      return `Evitar: "${String(originalAction).substring(0, 100)}" cuando reciba corrección similar.`;
    }
  }

  async _updateAgentDynamicRules(agentId, lesson) {
    if (!agentId) return;
    try {
      const { data: agent } = await this.supabase
        .from('agents')
        .select('dynamic_rules')
        .eq('id', agentId)
        .maybeSingle();

      if (!agent) return;

      const currentRules = agent.dynamic_rules || [];
      const newRule = {
        lesson,
        learned_at: new Date().toISOString(),
        times_applied: 0
      };

      // Max 20 reglas dinámicas (FIFO)
      const updatedRules = [...currentRules, newRule].slice(-20);

      await this.supabase
        .from('agents')
        .update({ dynamic_rules: updatedRules })
        .eq('id', agentId);
    } catch (err) {
      console.warn('[FeedbackLearner] updateDynamicRules error:', err.message);
    }
  }

  async getAgentLessons(agentId, limit = 5) {
    try {
      const { data } = await this.supabase
        .from('learning_events')
        .select('lesson_learned, learned_at')
        .eq('agent_id', agentId)
        .order('learned_at', { ascending: false })
        .limit(limit);

      return (data || []).map(e => e.lesson_learned).filter(Boolean);
    } catch {
      return [];
    }
  }
}

module.exports = new FeedbackLearner();
