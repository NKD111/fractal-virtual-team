// backend/src/nexus/nexus-agent.js
// NEXUS — Strategic Guardian
// Macro-level decisions, alert routing, financial monitoring, daily reports.

const cron = require('node-cron');
const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');
const { FinancialMonitor } = require('./financial-monitor');
const { AlertRouter } = require('./alert-router');

class NexusAgent {
  constructor() {
    this.name = 'NEXUS';
    this.role = 'Strategic Guardian';

    this.alertRouter = new AlertRouter();
    this.financialMonitor = new FinancialMonitor(this.alertRouter);

    this._initialized = false;
    this.startedAt = null;
    this._dailyCronJob = null;
    this._cleanupCronJob = null;
  }

  async initialize() {
    if (this._initialized) return;
    console.log('\n🛡️ NEXUS — Strategic Guardian iniciando...');

    try {
      // Start financial monitoring (hourly)
      this.financialMonitor.start();
      console.log('  ✓ Financial Monitor: suscripciones/créditos cada hora');

      // Daily report at 8 AM Mexico City time
      this._dailyCronJob = cron.schedule('0 8 * * *', async () => {
        try {
          await this._sendDailyReport();
        } catch (err) {
          console.error('[NEXUS] Daily report error:', err.message);
        }
      }, { timezone: 'America/Mexico_City' });
      console.log('  ✓ Daily Reporter: reporte diario a las 8 AM (CDMX)');

      // Cleanup old logs at 11 PM
      this._cleanupCronJob = cron.schedule('0 23 * * *', async () => {
        try {
          await this._cleanupOldLogs();
        } catch (err) {
          console.error('[NEXUS] Cleanup error:', err.message);
        }
      }, { timezone: 'America/Mexico_City' });
      console.log('  ✓ Log Cleanup: limpieza automática a las 11 PM (CDMX)');

      this._initialized = true;
      this.startedAt = new Date().toISOString();
      console.log('🛡️ NEXUS operativo\n');
    } catch (err) {
      console.error('[NEXUS] Error en inicialización:', err.message);
    }
  }

  /**
   * Evaluate an issue from ATLAS and decide action.
   * Returns: { action: 'auto_repair' | 'notify_critical' | 'monitor_only' | 'queue_report', ... }
   */
  async evaluateIssue(issue) {
    const { serviceKey, severity, consecutiveFailures = 1, predictedFailureInMinutes } = issue;

    // Critical: service is importance 5 AND has been failing 3+ consecutive times
    if (severity === 'critical' || consecutiveFailures >= 3) {
      return {
        action: 'notify_critical',
        alert: {
          severity: 'critical',
          service: serviceKey,
          message: `🔴 ${serviceKey} caído — ${consecutiveFailures} fallos consecutivos`,
          recommended_action: 'Revisar Railway logs y reiniciar si necesario'
        }
      };
    }

    // Predictive: failure expected within 30 min
    if (predictedFailureInMinutes && predictedFailureInMinutes <= 30) {
      return {
        action: 'notify_critical',
        alert: {
          severity: 'error',
          service: serviceKey,
          message: `🚨 Predicción: ${serviceKey} fallará en ~${predictedFailureInMinutes} min`,
          recommended_action: 'ATLAS aplicando mitigación preventiva'
        }
      };
    }

    // Single failure or low importance: try auto-repair first
    if (consecutiveFailures <= 2) {
      return { action: 'auto_repair', serviceKey };
    }

    // Otherwise: monitor
    return { action: 'monitor_only', serviceKey };
  }

  /**
   * Route an alert through AlertRouter.
   */
  async alert(alertPayload) {
    return this.alertRouter.route(alertPayload);
  }

  /**
   * Generate and send the daily health report.
   */
  async _sendDailyReport() {
    console.log('[NEXUS] Generating daily report...');

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Gather stats in parallel
    const [servicesRes, testsRes, eventsRes, predictionsRes] = await Promise.allSettled([
      supabase.from('monitored_services').select('service_key, current_status, is_active').eq('is_active', true),
      supabase.from('synthetic_tests').select('status', { count: 'exact', head: false })
        .gte('tested_at', yesterday),
      supabase.from('system_events').select('event_type, success')
        .gte('started_at', yesterday),
      supabase.from('predictive_alerts').select('service_key, confidence')
        .gte('created_at', yesterday)
    ]);

    const services = servicesRes.value?.data || [];
    const tests = testsRes.value?.data || [];
    const events = eventsRes.value?.data || [];
    const predictions = predictionsRes.value?.data || [];

    const healthy = services.filter(s => s.current_status === 'healthy').length;
    const degraded = services.filter(s => s.current_status === 'degraded').length;
    const down = services.filter(s => s.current_status === 'down').length;

    const totalTests = tests.length;
    const failedTests = tests.filter(t => t.status !== 'healthy').length;
    const uptimePct = totalTests > 0 ? (((totalTests - failedTests) / totalTests) * 100).toFixed(1) : '100.0';

    const repairs = events.filter(e => e.event_type === 'auto_repair' && e.success).length;
    const pendingAlerts = this.alertRouter.flushPendingAlerts();

    let report = `🛡️ *NEXUS — Reporte Diario*\n`;
    report += `📅 ${new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}\n\n`;
    report += `*Sistema:* ${healthy}✅ ${degraded > 0 ? degraded + '⚠️ ' : ''}${down > 0 ? down + '🔴' : ''}\n`;
    report += `*Uptime:* ${uptimePct}% (${totalTests} pruebas sintéticas)\n`;
    report += `*Auto-reparaciones:* ${repairs}\n`;
    report += `*Predicciones activas:* ${predictions.length}\n`;

    if (pendingAlerts.length > 0) {
      report += `\n*Alertas acumuladas:*\n`;
      pendingAlerts.slice(0, 5).forEach(a => {
        report += `• ${a.message}\n`;
      });
      if (pendingAlerts.length > 5) report += `• ...y ${pendingAlerts.length - 5} más\n`;
    }

    report += `\n_ATLAS completó ${totalTests} pruebas sin gastar créditos_ 🔧`;

    // Save to daily_health_reports
    await supabase.from('daily_health_reports').upsert({
      report_date: new Date().toISOString().slice(0, 10),
      total_services_monitored: services.length,
      services_healthy: healthy,
      services_degraded: degraded,
      services_down: down,
      errors_detected: failedTests,
      errors_auto_repaired: repairs,
      predictions_made: predictions.length,
      uptime_percentage: parseFloat(uptimePct),
      total_synthetic_test_cost: 0,
      generated_at: new Date().toISOString()
    }).catch(err => console.warn('[NEXUS] Daily report save error:', err.message));

    await notifyNeiky(report);
    console.log('[NEXUS] Daily report sent');
  }

  async _cleanupOldLogs() {
    // Keep last 7 days of synthetic_tests, 30 days of system_events
    const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const month = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    await Promise.allSettled([
      supabase.from('synthetic_tests').delete().lt('tested_at', week),
      supabase.from('system_events').delete().lt('started_at', month)
    ]);

    console.log('[NEXUS] Old logs cleaned up');
  }

  async getStatus() {
    let subsCount = 0, unresolvedAlerts = 0;
    try {
      const r1 = await supabase.from('service_subscriptions').select('*', { count: 'exact', head: true }).eq('current_status', 'active');
      subsCount = r1.count || 0;
      const r2 = await supabase.from('financial_alerts').select('*', { count: 'exact', head: true }).eq('resolved', false);
      unresolvedAlerts = r2.count || 0;
    } catch (_) {}

    return {
      agent: this.name,
      role: this.role,
      initialized: this._initialized,
      started_at: this.startedAt,
      alerts_today: this.alertRouter.getTodayCount(),
      active_subscriptions: subsCount,
      unresolved_financial_alerts: unresolvedAlerts
    };
  }
}

module.exports = { NexusAgent };
