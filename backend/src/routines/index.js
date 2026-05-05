// backend/src/routines/index.js
// C1-C3: Morning Prep, Nightly Maintenance, Weekly Financial + 3 extras

const cron = require('node-cron');
const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');
const DailyStandup = require('./daily-standup');

const TZ = { timezone: 'America/Mexico_City' };

class RoutineManager {
  constructor() { this._tasks = []; this._initialized = false; }

  initialize() {
    if (this._initialized) return;
    console.log('⏰ ROUTINES: inicializando schedules...');

    // C1: Morning Prep — 8:29 AM L-V
    this._tasks.push(cron.schedule('29 8 * * 1-5', () => this.morningPrep().catch(e => console.error('morningPrep:', e.message)), TZ));

    // C2: Nightly Maintenance — 11 PM diario
    this._tasks.push(cron.schedule('0 23 * * *', () => this.nightlyMaintenance().catch(e => console.error('nightlyMaintenance:', e.message)), TZ));

    // C3: Weekly Financial — Lunes 9 AM
    this._tasks.push(cron.schedule('0 9 * * 1', () => this.weeklyFinancial().catch(e => console.error('weeklyFinancial:', e.message)), TZ));

    // EXTRAS:
    // Insights scan — Lunes 7:30 AM (antes del Morning Prep)
    this._tasks.push(cron.schedule('30 7 * * 1', () => this._runInsightsScan().catch(e => console.error('insights:', e.message)), TZ));
    // Follow-ups proactivos — 3 PM L-V
    this._tasks.push(cron.schedule('0 15 * * 1-5', () => this._runProactiveFollowups().catch(e => console.error('proactive:', e.message)), TZ));
    // Diana health check — Viernes 6 PM
    this._tasks.push(cron.schedule('0 18 * * 5', () => this._runDianaHealthCheck().catch(e => console.error('diana:', e.message)), TZ));
    // Daily KPIs — 11:55 PM
    this._tasks.push(cron.schedule('55 23 * * *', () => this._runDailyKPIs().catch(e => console.error('kpis:', e.message)), TZ));

    this._initialized = true;
    console.log(`✅ ROUTINES: ${this._tasks.length} schedules activos`);
  }

  // C1
  async morningPrep() {
    console.log('🌅 ROUTINE: Morning Prep...');
    const { data: promises } = await supabase
      .from('pending_promises').select('id, promise_text, execute_at, user_phone')
      .eq('status', 'pending')
      .lte('execute_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    const { data: projects } = await supabase
      .from('projects').select('id, name, status, deadline, clients(name)')
      .not('status', 'in', '("completed","cancelled")');
    const list = projects || [];
    const atRisk = list.filter(p => {
      if (!p.deadline) return false;
      const days = (new Date(p.deadline) - new Date()) / (1000 * 60 * 60 * 24);
      return days < 3;
    });

    // Run team standup BEFORE building Neiky's digest. Standup populates
    // `daily_context` table and emits chat bubbles to the live Office View.
    let dayContext = '';
    let standupResult = null;
    try {
      standupResult = await DailyStandup.run();
      dayContext = standupResult?.summary || '';
    } catch (err) {
      console.error('  ✗ Standup falló (digest sigue):', err.message);
    }

    // Fall back to direct Oracle query if standup didn't yield a summary
    if (!dayContext && global.oracle?.isInitialized) {
      try {
        const r = await global.oracle.consult({
          question: `Resumen ejecutivo del día para Mariana:
- Promesas que vencen hoy: ${promises?.length || 0}
- Proyectos activos: ${list.length}
- Proyectos en riesgo: ${atRisk.length}
- Lista: ${list.slice(0, 8).map(p => `${p.name}(${p.status})`).join(', ')}

Máximo 3 puntos clave de acción para hoy. Tono: directo, accionable.`,
          agent: { id: null, name: 'SYSTEM', role: 'morning_prep' },
          depth: 'quick'
        });
        dayContext = r?.answer || '';
      } catch (_) {}
    }

    await supabase.from('system_events').insert({
      event_type: 'morning_prep_completed',
      severity: 'info',
      service_key: 'routines',
      details: {
        promises_today: promises?.length || 0,
        active_projects: list.length,
        at_risk: atRisk.length,
        day_context: dayContext
      }
    }).then(() => {}).catch(() => {});

    // Build the WhatsApp digest and send to Neiky
    const oracleSummary = (dayContext || '').trim() ||
      (atRisk.length > 0
        ? `Enfocar el día en los ${atRisk.length} proyectos en riesgo.`
        : 'Día limpio. Mantener ritmo de seguimiento con clientes activos.');
    const message =
      `🌅 Buenos días Neiky!\n\n` +
      `📋 HOY:\n` +
      `- ${promises?.length || 0} promesas que vencen hoy\n` +
      `- ${list.length} proyectos activos\n` +
      `- ⚠️ ${atRisk.length} proyectos en riesgo\n\n` +
      `🎯 Prioridad del día:\n${oracleSummary}\n\n` +
      `— Mariana 🤖`;

    try {
      await notifyNeiky(message);
      console.log('  ✓ Morning digest enviado por WhatsApp');
    } catch (err) {
      console.error('  ✗ Morning WhatsApp falló:', err.message);
    }

    console.log(`✅ Morning Prep: ${promises?.length || 0} promesas, ${atRisk.length} en riesgo`);
    return { promises: promises?.length || 0, active_projects: list.length, at_risk: atRisk.length, day_context: dayContext, message };
  }

  // C2
  async nightlyMaintenance() {
    console.log('🌙 ROUTINE: Nightly Maintenance...');
    const results = {};

    // 1. Limpiar logs viejos (> 30 días) de severity baja
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('system_events').delete().lt('started_at', cutoff).in('severity', ['low', 'info']);
      results.logs_cleaned = true;
    } catch (err) { results.logs_cleaned_error = err.message; }

    // 2. Oracle daily metrics
    if (global.oracle?.generateDailyMetrics) {
      try { await global.oracle.generateDailyMetrics(); results.oracle_metrics = true; }
      catch (err) { results.oracle_metrics_error = err.message; }
    }

    // 3. Daily KPIs
    try { await this._runDailyKPIs(); results.kpis = true; }
    catch (err) { results.kpis_error = err.message; }

    console.log(`✅ Nightly Maintenance:`, results);
    return results;
  }

  // C3
  async weeklyFinancial() {
    console.log('💼 ROUTINE: Weekly Financial...');
    const FinancialReport = require('../features/financial-report');
    return new FinancialReport().generateWeekly();
  }

  // Extras
  async _runProactiveFollowups() {
    const ProactiveFollowups = require('../features/proactive-followups');
    return new ProactiveFollowups().runDailyScan();
  }

  async _runInsightsScan() {
    const { runInsightsScan } = require('./insights-scanner');
    return runInsightsScan();
  }

  async _runDianaHealthCheck() {
    const DianaHealthCheck = require('../features/diana-health-check');
    return new DianaHealthCheck().runWeekly();
  }

  async _runDailyKPIs() {
    const AnalyticsDashboard = require('../features/analytics-dashboard');
    return new AnalyticsDashboard().generateDailyKPIs();
  }
}

module.exports = RoutineManager;
