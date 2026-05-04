// backend/src/features/analytics-dashboard.js
// B3: Lucas - Dashboard de Analytics + Daily KPI snapshot

const { supabase } = require('../core/supabase');

class AnalyticsDashboard {
  async generateDailyKPIs() {
    console.log('📊 LUCAS: calculando KPIs del día...');
    const today = new Date().toISOString().split('T')[0];

    const [projectsRes, clientsRes, msgsRes, oracleRes] = await Promise.all([
      supabase.from('projects').select('status'),
      supabase.from('clients').select('id, created_at'),
      supabase.from('messages').select('id', { head: true, count: 'exact' }).gte('created_at', `${today}T00:00:00Z`),
      supabase.from('oracle_metrics').select('*').eq('date', today).maybeSingle()
    ]);

    const projects = projectsRes.data || [];
    const om = oracleRes.data || {};

    const kpis = {
      active_projects: projects.filter(p => !['completed', 'cancelled'].includes(p.status)).length,
      completed_this_month: projects.filter(p => p.status === 'completed').length,
      total_clients: clientsRes.data?.length || 0,
      messages_today: msgsRes.count || 0,
      oracle_queries_today: om.total_queries || 0,
      oracle_cost_today: Number(om.total_cost || 0),
      oracle_savings_today: Number(om.cost_optimization_savings || 0)
    };

    try {
      await supabase.from('business_kpis').upsert({
        date: today,
        active_projects: kpis.active_projects,
        completed_this_month: kpis.completed_this_month,
        active_clients: kpis.total_clients,
        total_messages_handled: kpis.messages_today,
        oracle_queries_today: kpis.oracle_queries_today,
        oracle_cost_today: kpis.oracle_cost_today,
        generated_at: new Date().toISOString()
      }, { onConflict: 'date' });
    } catch (_) {}

    return kpis;
  }

  async getRealtimeData() {
    const [kpisRes, projectsRes, eventsRes] = await Promise.all([
      supabase.from('business_kpis').select('*').order('date', { ascending: false }).limit(7),
      supabase.from('projects').select('id, name, status, deadline, clients(name)').not('status', 'in', '("completed","cancelled")'),
      supabase.from('system_events').select('event_type, severity, started_at, details').order('started_at', { ascending: false }).limit(10)
    ]);
    return {
      kpis: kpisRes.data || [],
      active_projects: projectsRes.data || [],
      recent_activity: eventsRes.data || [],
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = AnalyticsDashboard;
