// backend/src/features/executive-summary.js
// D4: Resumen Diario Ejecutivo (consume Analytics + Oracle)

const AnalyticsDashboard = require('./analytics-dashboard');

class ExecutiveSummary {
  async generate() {
    const dashboard = new AnalyticsDashboard();
    const data = await dashboard.getRealtimeData();

    let summary = `Sistema operativo. ${data.active_projects.length} proyectos activos.`;
    if (global.oracle?.isInitialized) {
      try {
        const r = await global.oracle.consult({
          question: `Genera un resumen ejecutivo matutino para Neiky (Director de Fractal MX):

Proyectos activos: ${data.active_projects.length}
Actividad reciente: ${data.recent_activity.slice(0, 3).map(e => e.event_type).join(', ')}
KPIs últimos 7 días: ${JSON.stringify(data.kpis.slice(0, 3))}

Máximo 3 bullets. Tono ejecutivo pero informal. Empieza con el punto más importante.`,
          agent: { id: null, name: 'SYSTEM', role: 'executive_summary' },
          depth: 'quick'
        });
        summary = r?.answer || summary;
      } catch (_) {}
    }

    return {
      summary,
      active_projects: data.active_projects.length,
      recent_events: data.recent_activity.slice(0, 5),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = ExecutiveSummary;
