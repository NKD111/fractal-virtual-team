// backend/src/intelligence/self-evaluation.js
// Sistema 8 — Auto-evaluación de agentes después de cada acción
'use strict';

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

class SelfEvaluation {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async evaluateAction(agentId, action, outcome = {}) {
    try {
      const scores = await this._scoreAction(action, outcome);

      await this.supabase.from('agent_evaluations').insert({
        agent_id: agentId || null,
        action_taken: (action.description || action.content || '').substring(0, 500),
        action_quality_score: scores.quality,
        outcome_success_score: scores.success,
        client_impact_score: scores.client_impact,
        could_be_improved: scores.improvements,
        evaluated_at: new Date().toISOString()
      });

      // Si calidad < 7, sugerir mejora (non-blocking)
      if (scores.quality < 7 && scores.improvements && scores.improvements.length > 0) {
        console.log(`[SelfEval] ${agentId} puede mejorar: ${JSON.stringify(scores.improvements)}`);
      }

      return scores;
    } catch (err) {
      console.warn('[SelfEvaluation] evaluateAction error:', err.message);
      return { quality: 7, success: 7, client_impact: 7, improvements: [] };
    }
  }

  async _scoreAction(action, outcome) {
    // Score rápido sin AI para no añadir latencia en cada mensaje
    const actionText = action.description || action.content || '';

    let quality = 7;
    let success = outcome.success !== false ? 8 : 5;
    let client_impact = 7;
    const improvements = [];

    // Penalizar si respuesta muy corta
    if (actionText.length < 20) { quality -= 2; improvements.push('respuesta demasiado corta'); }
    // Penalizar si no se usó personalidad
    if (!/nene|mi rey|bebé|qué onda/i.test(actionText) && action.isMariana) {
      quality -= 1; improvements.push('mantener personalidad de Mariana');
    }
    // Bonus si incluye propuesta o solución
    if (/propon|sugiero|podemos|opción/i.test(actionText)) quality = Math.min(quality + 1, 10);

    return { quality, success, client_impact, improvements };
  }

  async generateDailyReport(agentId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data } = await this.supabase
        .from('agent_evaluations')
        .select('*')
        .eq('agent_id', agentId)
        .gte('evaluated_at', today.toISOString())
        .order('evaluated_at', { ascending: false });

      const evals = data || [];
      if (evals.length === 0) return null;

      const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      return {
        total_actions: evals.length,
        avg_quality: Math.round(avg(evals.map(e => e.action_quality_score || 7)) * 10) / 10,
        success_rate: Math.round((evals.filter(e => (e.outcome_success_score || 7) >= 7).length / evals.length) * 100),
        areas_to_improve: evals.flatMap(e => e.could_be_improved || []).slice(0, 3)
      };
    } catch (err) {
      console.warn('[SelfEvaluation] generateDailyReport error:', err.message);
      return null;
    }
  }
}

module.exports = new SelfEvaluation();
