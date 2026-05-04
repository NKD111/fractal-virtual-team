// backend/src/features/diana-health-check.js
// B5: Diana - Weekly Client Health Check (calls ClientHealth for every client)

const { supabase } = require('../core/supabase');
const ClientHealth = require('./client-health');

class DianaHealthCheck {
  constructor() { this.health = new ClientHealth(); }

  async runWeekly() {
    console.log('💼 DIANA: weekly health check...');
    const { data: clients } = await supabase.from('clients').select('id, name');
    const list = clients || [];

    const results = [];
    for (const c of list) {
      try {
        const score = await this.health.calculateScore(c.id);
        results.push(score);

        if (['high', 'critical'].includes(score.riskLevel)) {
          let strategy = 'Hacer check-in personal con el cliente.';
          if (global.oracle?.isInitialized) {
            try {
              const r = await global.oracle.consult({
                question: `Cliente ${c.name} con health score ${score.overall}/10 (${score.riskLevel}). Scores: ${JSON.stringify(score.scores)}. ¿Qué estrategia de retención recomendás? Máximo 3 acciones concretas.`,
                agent: { id: null, name: 'DIANA', role: 'client_manager' },
                context: { client_id: c.id },
                depth: 'standard'
              });
              if (r?.answer) strategy = r.answer;
            } catch (_) {}
          }

          await supabase.from('system_events').insert({
            event_type: 'client_at_risk',
            severity: score.riskLevel === 'critical' ? 'critical' : 'warning',
            service_key: 'clients',
            details: { client_id: c.id, client_name: c.name, overall_score: score.overall, strategy }
          }).then(() => {}).catch(() => {});
        }
      } catch (err) { console.warn(`[DianaHealthCheck] ${c.name} failed:`, err.message); }
    }

    const avg = results.length ? results.reduce((s, r) => s + Number(r.overall || 0), 0) / results.length : 0;
    console.log(`✅ DIANA: ${results.length} clientes evaluados. Promedio: ${avg.toFixed(1)}/10`);
    return { count: results.length, average: Number(avg.toFixed(2)), at_risk: results.filter(r => ['high', 'critical'].includes(r.riskLevel)).length };
  }
}

module.exports = DianaHealthCheck;
