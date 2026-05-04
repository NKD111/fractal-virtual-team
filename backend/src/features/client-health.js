// backend/src/features/client-health.js
// A4: Client Satisfaction Score (composite health score 1-10)

const { supabase } = require('../core/supabase');

class ClientHealth {
  async calculateScore(clientId) {
    const [{ data: client }, { data: projects }, { data: revisions }, { data: conversations }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
      supabase.from('projects').select('*').eq('client_id', clientId),
      supabase.from('project_revisions').select('*').eq('client_id', clientId),
      supabase.from('conversations').select('id, last_message_at').eq('client_id', clientId).order('last_message_at', { ascending: false }).limit(10)
    ]);

    const scores = {
      payment: this._payment(client),
      communication: this._communication(conversations),
      revisions: this._revisions(revisions, projects),
      loyalty: this._loyalty(client, projects),
      completion: this._completion(projects)
    };

    const overall = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;
    const riskLevel = overall >= 8 ? 'low' : overall >= 6 ? 'medium' : overall >= 4 ? 'high' : 'critical';
    const recommendation = {
      low: '✅ Cliente sano. Mantener relación actual.',
      medium: '⚠️ Monitorear. Mejorar comunicación proactiva.',
      high: '🚨 Atención requerida. Diana debe hacer check-in personal.',
      critical: '🔴 Cliente en riesgo de churn. Escalar a Neiky inmediatamente.'
    }[riskLevel];

    try {
      await supabase.from('client_health_scores').insert({
        client_id: clientId,
        payment_score: scores.payment,
        communication_score: scores.communication,
        satisfaction_score: scores.completion,
        revision_score: scores.revisions,
        loyalty_score: scores.loyalty,
        overall_score: Number(overall.toFixed(2)),
        risk_level: riskLevel,
        recommendation
      });
    } catch (_) {}

    return { clientId, scores, overall: Number(overall.toFixed(2)), riskLevel, recommendation };
  }

  _payment(c) {
    if (!c) return 5;
    if (c.payment_status === 'always_on_time') return 10;
    if (c.payment_status === 'sometimes_late') return 6;
    if (c.payment_status === 'often_late') return 3;
    return 7;
  }

  _communication(conversations) {
    if (!conversations?.length) return 5;
    return 8; // simplified
  }

  _revisions(revisions, projects) {
    if (!revisions?.length || !projects?.length) return 8;
    const avg = revisions.length / Math.max(projects.length, 1);
    if (avg <= 2) return 10;
    if (avg <= 5) return 7;
    if (avg <= 10) return 5;
    return 3;
  }

  _loyalty(client, projects) {
    const months = client?.created_at
      ? (Date.now() - new Date(client.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
      : 0;
    if (months > 24) return 10;
    if (months > 12) return 8;
    if (months > 6) return 6;
    return 4;
  }

  _completion(projects) {
    if (!projects?.length) return 5;
    const done = projects.filter(p => p.status === 'completed').length;
    return Math.round((done / projects.length) * 10);
  }
}

module.exports = ClientHealth;
