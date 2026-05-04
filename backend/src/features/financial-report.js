// backend/src/features/financial-report.js
// B2: Roberto - Reporte Financiero Semanal

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');

class FinancialReport {
  async generateWeekly() {
    console.log('💼 ROBERTO: generando reporte financiero semanal...');
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [quotesRes, projectsRes, subsRes, oracleRes] = await Promise.all([
      supabase.from('quotes').select('status, final_price').gte('created_at', weekStart.toISOString()),
      supabase.from('projects').select('id, status, updated_at').gte('updated_at', weekStart.toISOString()),
      supabase.from('service_subscriptions').select('monthly_cost'),
      supabase.from('oracle_metrics').select('total_cost').gte('date', weekStart.toISOString().split('T')[0])
    ]);

    const quotes = quotesRes.data || [];
    const accepted = quotes.filter(q => q.status === 'accepted');
    const pending = quotes.filter(q => q.status === 'sent');
    const totalRevenue = accepted.reduce((s, q) => s + Number(q.final_price || 0), 0);
    const pipeline = pending.reduce((s, q) => s + Number(q.final_price || 0), 0);

    const oracleCost = (oracleRes.data || []).reduce((s, m) => s + Number(m.total_cost || 0), 0);
    const subsCost = (subsRes.data || []).reduce((s, sub) => s + Number(sub.monthly_cost || 0) / 4, 0);
    const totalCost = oracleCost + subsCost;

    let summary = 'Reporte semanal generado.';
    if (global.oracle?.isInitialized) {
      try {
        const r = await global.oracle.consult({
          question: `Genera un resumen ejecutivo semanal para Fractal MX. Ingresos confirmados: $${totalRevenue.toFixed(0)} MXN. Pipeline activo: $${pipeline.toFixed(0)} MXN. Costos operativos: $${totalCost.toFixed(2)} USD. Proyectos activos: ${projectsRes.data?.length || 0}. Cotizaciones nuevas: ${quotes.length}. Máximo 200 palabras, español, tono profesional.`,
          agent: { id: null, name: 'ROBERTO', role: 'cfo' },
          depth: 'standard'
        });
        if (r?.answer) summary = r.answer;
      } catch (_) {}
    }

    const report = {
      period: `${weekStart.toLocaleDateString()} - ${new Date().toLocaleDateString()}`,
      revenue_confirmed: totalRevenue,
      pipeline,
      operational_costs_usd: totalCost,
      active_projects: projectsRes.data?.length || 0,
      new_quotes: quotes.length,
      summary
    };

    await this._sendToNeiky(report);
    return report;
  }

  async _sendToNeiky(r) {
    const message =
`💼 *REPORTE SEMANAL — ROBERTO*
📅 ${r.period}

💰 Ingresos confirmados: $${r.revenue_confirmed.toLocaleString()} MXN
📊 Pipeline activo: $${r.pipeline.toLocaleString()} MXN
💸 Costos op.: $${r.operational_costs_usd.toFixed(2)} USD
📁 Proyectos activos: ${r.active_projects}
📋 Cotizaciones semana: ${r.new_quotes}

📝 ${r.summary}`;
    try { await notifyNeiky(message); } catch (err) { console.warn('[FinancialReport] notify error:', err.message); }
  }
}

module.exports = FinancialReport;
