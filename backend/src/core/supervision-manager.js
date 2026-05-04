// backend/src/core/supervision-manager.js
// Sistema 10 — Supervisión Progresiva + Trust Dashboard
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPERVISION_LEVELS = {
  1: {
    description: 'Todo se revisa con Neiky',
    autonomous_threshold: 0,
    weekly_report: true,
    daily_summary: true
  },
  2: {
    description: 'Tareas básicas autónomas (respuestas, recordatorios)',
    autonomous_threshold: 30,
    weekly_report: true,
    daily_summary: true
  },
  3: {
    description: 'Más decisiones autónomas (proyectos standard)',
    autonomous_threshold: 60,
    weekly_report: true,
    daily_summary: false
  },
  4: {
    description: 'Operación normal — escala solo en críticos',
    autonomous_threshold: 80,
    weekly_report: false,
    daily_summary: false
  }
};

class SupervisionManager {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }

  getSupervisionConfig(weekInOperation) {
    const week = Math.min(Math.max(weekInOperation || 1, 1), 4);
    return SUPERVISION_LEVELS[week];
  }

  async getAgentTrustData(agentId) {
    try {
      const { data } = await this.supabase
        .from('agents')
        .select('trust_score, supervision_level, week_in_operation, name, dynamic_rules')
        .eq('id', agentId)
        .maybeSingle();

      if (!data) return { trust_score: 50, supervision_level: 1, week_in_operation: 1 };
      return data;
    } catch {
      return { trust_score: 50, supervision_level: 1, week_in_operation: 1 };
    }
  }

  async shouldActAutonomously(agentId, situationType) {
    try {
      const agent = await this.getAgentTrustData(agentId);
      const config = this.getSupervisionConfig(agent.week_in_operation);

      // Trust score determina autonomía dentro del nivel
      const autonomyPct = (agent.trust_score / 100) * 100;
      return autonomyPct >= (100 - config.autonomous_threshold);
    } catch {
      return false; // Por defecto, no autónomo
    }
  }

  async updateTrustScore(agentId, delta) {
    try {
      const agent = await this.getAgentTrustData(agentId);
      const newScore = Math.min(Math.max((agent.trust_score || 50) + delta, 0), 100);

      await this.supabase
        .from('agents')
        .update({ trust_score: newScore })
        .eq('id', agentId);

      return newScore;
    } catch (err) {
      console.warn('[SupervisionManager] updateTrustScore error:', err.message);
      return 50;
    }
  }

  async generateTrustDashboard() {
    try {
      const { data: agents } = await this.supabase
        .from('agents')
        .select('name, trust_score, supervision_level, week_in_operation')
        .order('trust_score', { ascending: false });

      if (!agents) return null;

      return agents.map(a => ({
        name: a.name,
        trust_score: a.trust_score || 50,
        supervision_level: a.supervision_level || 1,
        week: a.week_in_operation || 1,
        config: this.getSupervisionConfig(a.week_in_operation || 1)
      }));
    } catch (err) {
      console.warn('[SupervisionManager] generateTrustDashboard error:', err.message);
      return [];
    }
  }

  async advanceWeek(agentId) {
    try {
      const agent = await this.getAgentTrustData(agentId);
      const newWeek = Math.min((agent.week_in_operation || 1) + 1, 4);
      const newLevel = newWeek;

      await this.supabase
        .from('agents')
        .update({ week_in_operation: newWeek, supervision_level: newLevel })
        .eq('id', agentId);

      return this.getSupervisionConfig(newWeek);
    } catch (err) {
      console.warn('[SupervisionManager] advanceWeek error:', err.message);
    }
  }
}

module.exports = new SupervisionManager();
