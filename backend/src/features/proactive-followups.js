// backend/src/features/proactive-followups.js
// B1: Mariana Follow-up Proactivo
// (Standalone module — invoked from RoutineManager and exposed via API)

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');

class ProactiveFollowups {
  async runDailyScan() {
    console.log('📱 PROACTIVE: scanning quotes / promises / inactive projects...');
    const summary = { quotes_followed_up: 0, overdue_promises: 0, inactive_projects: 0, errors: [] };

    // 1. Cotizaciones sin respuesta > 48h
    try {
      const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: pendingQuotes } = await supabase
        .from('quotes').select('*, clients(name, phone)')
        .eq('status', 'sent').lt('sent_at', cutoff48h);

      for (const q of pendingQuotes || []) {
        let msg = `Hola ${q.clients?.name || ''}, te escribo de Fractal MX. Te envié una cotización de ${q.service_type} hace un par de días. ¿Tuviste chance de revisarla? Cualquier duda con gusto te ayudo. 🙌`;
        if (global.oracle?.isInitialized) {
          try {
            const r = await global.oracle.consult({
              question: `Genera un mensaje de follow-up corto y amable (3 líneas máximo) para ${q.clients?.name || 'cliente'} sobre una cotización de ${q.service_type} sin respuesta hace 2 días. Tono: profesional pero cercano, español mexicano.`,
              agent: { id: null, name: 'MARIANA', role: 'hub_coordinator' },
              depth: 'quick'
            });
            if (r?.answer) msg = r.answer;
          } catch (_) {}
        }
        if (q.clients?.phone) {
          // Send via WhatsApp (best effort)
          try {
            const { sendMetaMessage } = require('../core/whatsapp');
            await sendMetaMessage(q.clients.phone, msg).catch(() => {});
          } catch (_) {}
        }
        summary.quotes_followed_up++;
      }
    } catch (err) { summary.errors.push(`quotes: ${err.message}`); }

    // 2. Promesas vencidas (real schema: execute_at + promise_text)
    try {
      const { data: overdue } = await supabase
        .from('pending_promises').select('*')
        .eq('status', 'pending').lt('execute_at', new Date().toISOString());
      summary.overdue_promises = overdue?.length || 0;
      if (overdue?.length) {
        const lines = overdue.slice(0, 10).map(p => `• ${p.promise_text || p.action_type} (${p.user_phone || 'sin tel'})`).join('\n');
        await notifyNeiky(`⚠️ *${overdue.length} promesa(s) vencida(s)*\n${lines}`).catch(() => {});
      }
    } catch (err) { summary.errors.push(`promises: ${err.message}`); }

    // 3. Proyectos inactivos > 72h
    try {
      const cutoff72h = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
      const { data: inactive } = await supabase
        .from('projects').select('id, name, status, updated_at, clients(name)')
        .not('status', 'in', '("completed","cancelled","on_hold")')
        .lt('updated_at', cutoff72h);
      summary.inactive_projects = inactive?.length || 0;
      for (const p of inactive || []) {
        await supabase.from('system_events').insert({
          event_type: 'project_inactive',
          severity: 'warning',
          service_key: 'projects',
          details: { project_id: p.id, name: p.name, client: p.clients?.name }
        }).then(() => {}).catch(() => {});
      }
    } catch (err) { summary.errors.push(`inactive: ${err.message}`); }

    console.log(`✅ PROACTIVE summary:`, summary);
    return summary;
  }
}

module.exports = ProactiveFollowups;
