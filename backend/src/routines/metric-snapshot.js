// backend/src/routines/metric-snapshot.js
// BLOQUE E3 — Metric Snapshot (23:00 CDMX diario)
// Cron: 0 23 * * *
// Modelo: Haiku (operativo — solo guardar datos)

const { supabase } = require('../core/supabase');

async function safeCount(table, filters = {}) {
  try {
    let query = supabase.from(table).select('*', { count: 'exact', head: true });
    const today = new Date().toISOString().split('T')[0];

    if (filters.gte_today) query = query.gte('created_at', today);
    if (filters.updated_today) query = query.gte('updated_at', today);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.type) query = query.eq('type', filters.type);
    if (filters.not_status) query = query.neq('status', filters.not_status);

    const { count } = await query;
    return count || 0;
  } catch { return 0; }
}

async function safeSum(table, column, filters = {}) {
  try {
    let query = supabase.from(table).select(column);
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    if (filters.gte_month) query = query.gte('created_at', monthStart);
    if (filters.gte_today) query = query.gte('created_at', today);

    const { data } = await query;
    return (data || []).reduce((s, r) => s + (r[column] || 0), 0);
  } catch { return 0; }
}

async function getTodayRevenue() {
  return safeSum('digital_products_sales', 'precio_usd', { gte_today: true });
}

async function getMonthRevenue() {
  return safeSum('digital_products_sales', 'precio_usd', { gte_month: true });
}

async function getWeekRevenue() {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data } = await supabase.from('digital_products_sales').select('precio_usd').gte('created_at', weekAgo);
    return (data || []).reduce((s, r) => s + (r.precio_usd || 0), 0);
  } catch { return 0; }
}

async function checkSystemHealth() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('system_events')
      .select('*', { count: 'exact', head: true })
      .gte('started_at', today)
      .eq('severity', 'critical');
    if (count > 3) return 'critical';
    if (count > 0) return 'degraded';
    return 'healthy';
  } catch { return 'unknown'; }
}

async function getTodayAPICost() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('api_usage_log')
      .select('cost_usd')
      .gte('created_at', today);
    return (data || []).reduce((s, r) => s + (r.cost_usd || 0), 0);
  } catch { return 0; }
}

async function saveMetricSnapshot() {
  console.log('📊 METRIC SNAPSHOT: guardando métricas del día...');

  try {
    const today = new Date().toISOString().split('T')[0];

    const [
      revToday, revWeek, revMonth,
      projActive, projDelivered,
      marianaMessages, marianaEscalations,
      axiomFound, axiomTop, axiomContacted, axiomConverted,
      imagesGenerated, videosGenerated,
      errorsToday, systemHealth, apiCost
    ] = await Promise.all([
      getTodayRevenue(),
      getWeekRevenue(),
      getMonthRevenue(),
      safeCount('projects', { not_status: 'completed' }),
      safeCount('parrilla_briefs', { status: 'entregado', updated_today: true }),
      safeCount('messages', { gte_today: true }),
      safeCount('system_events', { gte_today: true, type: 'mariana_escalation' }),
      safeCount('prospects', { gte_today: true }),
      (async () => { try { const { data } = await supabase.from('prospects').select('score').order('score', { ascending: false }).limit(1).maybeSingle(); return data?.score || 0; } catch { return 0; } })(),
      safeCount('prospects', { status: 'mensaje_enviado', updated_today: true }),
      safeCount('prospects', { status: 'cerrado_ganado', updated_today: true }),
      safeCount('assets', { type: 'image', gte_today: true }),
      safeCount('assets', { type: 'video', gte_today: true }),
      safeCount('system_events', { gte_today: true, status: 'error' }),
      checkSystemHealth(),
      getTodayAPICost()
    ]);

    const revPerAgent = revMonth > 0 ? Math.round(revMonth / 14) : 0;

    // Contar crons activos (aproximado)
    const cronsActive = global.routines?._tasks?.length || 0;

    const metrics = {
      date: today,
      revenue_today: revToday,
      revenue_week: revWeek,
      revenue_month: revMonth,
      revenue_per_agent: revPerAgent,
      projects_active: projActive,
      projects_delivered_today: projDelivered,
      mariana_messages_today: marianaMessages,
      mariana_escalations: marianaEscalations,
      axiom_opportunities_found: axiomFound,
      axiom_top_score: axiomTop,
      axiom_contacted: axiomContacted,
      axiom_converted: axiomConverted,
      images_generated: imagesGenerated,
      videos_generated: videosGenerated,
      crons_active: cronsActive,
      system_health: systemHealth,
      errors_today: errorsToday,
      api_cost_today: parseFloat(apiCost.toFixed(4))
    };

    // Upsert (un snapshot por día)
    const { error } = await supabase
      .from('metric_snapshots')
      .upsert(metrics, { onConflict: 'date' });

    if (error) throw error;

    console.log(`✅ Metric Snapshot guardado: ${today} | Revenue: $${revToday} USD | Salud: ${systemHealth}`);
    return { success: true, metrics };

  } catch (err) {
    console.error('❌ Metric Snapshot error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { saveMetricSnapshot };
