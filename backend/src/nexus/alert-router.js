// backend/src/nexus/alert-router.js
// NEXUS — Alert Router
// Decides WHEN and HOW to notify Neiky. Anti-spam: max 5 non-critical alerts/day.
// Critical alerts always go through immediately.

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');

const SEVERITY_ORDER = { info: 0, warning: 1, error: 2, critical: 3 };
const MAX_DAILY_NON_CRITICAL = 5;

class AlertRouter {
  constructor() {
    this.todayAlertCount = 0;
    this.lastResetDate = new Date().toDateString();
    this._pendingMorningReport = [];
  }

  /**
   * Main entry point. Route an alert from any source (ATLAS, FinancialMonitor, etc.)
   */
  async route(alert) {
    this._resetDailyCountIfNeeded();

    const severity = alert.severity || 'info';
    const level = SEVERITY_ORDER[severity] ?? 0;

    // Emit guardian event to live clients
    try {
      if (global.io) {
        const evType = level >= SEVERITY_ORDER.error ? 'nexus_alert' : 'nexus_active';
        global.io.emit(evType, { severity, type: alert.type, message: String(alert.message || '').substring(0, 120) });
      }
    } catch (_) {}

    // Critical → always notify immediately
    if (level >= SEVERITY_ORDER.error) {
      await this._sendImmediate(alert);
      return;
    }

    // Warning → notify if under daily cap, else queue for morning report
    if (level === SEVERITY_ORDER.warning) {
      if (this.todayAlertCount < MAX_DAILY_NON_CRITICAL) {
        await this._sendImmediate(alert);
      } else {
        this._pendingMorningReport.push(alert);
        console.log(`[AlertRouter] Daily cap reached — queuing "${alert.message?.substring(0, 60)}"`);
      }
      return;
    }

    // Info → always queue for morning report (don't wake Neiky)
    this._pendingMorningReport.push(alert);
  }

  async _sendImmediate(alert) {
    const emoji = { info: 'ℹ️', warning: '⚠️', error: '🚨', critical: '🔴' }[alert.severity] || '📢';
    const msg = `${emoji} *NEXUS Guardian*\n${alert.message || 'Sin detalle'}${
      alert.recommended_action ? `\n\n💡 _${alert.recommended_action}_` : ''
    }`;

    try {
      await notifyNeiky(msg);
      this.todayAlertCount++;

      await supabase.from('system_events').insert({
        event_type: 'alert_sent',
        service_key: alert.service || 'system',
        success: true,
        details: { severity: alert.severity, type: alert.type, notified_neiky: true },
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      }).catch(() => {});

      console.log(`[AlertRouter] Notified Neiky: [${alert.severity}] ${alert.message?.substring(0, 80)}`);
    } catch (err) {
      console.error('[AlertRouter] Failed to notify Neiky:', err.message);
    }
  }

  /**
   * Called by DailyReporter to get queued non-critical alerts.
   */
  flushPendingAlerts() {
    const alerts = [...this._pendingMorningReport];
    this._pendingMorningReport = [];
    return alerts;
  }

  _resetDailyCountIfNeeded() {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.todayAlertCount = 0;
      this.lastResetDate = today;
    }
  }

  getTodayCount() {
    this._resetDailyCountIfNeeded();
    return this.todayAlertCount;
  }
}

module.exports = { AlertRouter };
