// backend/src/nexus/financial-monitor.js
// NEXUS — Financial Monitor
// Checks service_subscriptions every hour. Alerts when credits low or billing approaching.

const { supabase } = require('../core/supabase');

class FinancialMonitor {
  constructor(alertRouter) {
    this.alertRouter = alertRouter;
    this.intervalHandle = null;
    this.INTERVAL_MS = 60 * 60 * 1000; // every hour
  }

  start() {
    if (this.intervalHandle) return;

    // Run once on start, then hourly
    this._check().catch(err => console.error('[FinancialMonitor] Initial check error:', err.message));

    this.intervalHandle = setInterval(async () => {
      try {
        await this._check();
      } catch (err) {
        console.error('[FinancialMonitor] Check error:', err.message);
      }
    }, this.INTERVAL_MS);

    console.log('[FinancialMonitor] Started — checking subscriptions every hour');
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async _check() {
    const { data: subs, error } = await supabase
      .from('service_subscriptions')
      .select('*')
      .eq('current_status', 'active');

    if (error || !subs || subs.length === 0) return;

    const alerts = [];
    const now = new Date();

    for (const sub of subs) {
      // Credit balance check
      if (sub.credit_balance !== null && sub.alert_at_credit_remaining !== null) {
        if (sub.credit_balance <= sub.alert_at_credit_remaining) {
          const daysLeft = sub.credit_balance > 0
            ? Math.ceil(sub.credit_balance / (sub.alert_at_credit_remaining / 7))
            : 0;

          alerts.push({
            type: 'low_credit',
            severity: sub.credit_balance <= 0 ? 'critical' : 'warning',
            service: sub.service_name,
            message: `💳 ${sub.service_name}: $${sub.credit_balance} restante (umbral: $${sub.alert_at_credit_remaining})`,
            subscription_id: sub.id,
            amount_remaining: sub.credit_balance,
            days_until_critical: daysLeft
          });
        }
      }

      // Upcoming billing date
      if (sub.next_billing_date) {
        const billingDate = new Date(sub.next_billing_date);
        const daysUntilBilling = Math.ceil((billingDate - now) / (1000 * 60 * 60 * 24));
        const alertDays = sub.alert_days_before_billing || 7;

        if (daysUntilBilling >= 0 && daysUntilBilling <= alertDays) {
          alerts.push({
            type: 'upcoming_billing',
            severity: daysUntilBilling <= 2 ? 'warning' : 'info',
            service: sub.service_name,
            message: `📅 ${sub.service_name}: renovación en ${daysUntilBilling} día(s) — $${sub.monthly_cost} ${sub.currency || 'USD'}`,
            subscription_id: sub.id,
            days_until_critical: daysUntilBilling
          });
        }
      }

      // Usage limit check
      if (sub.usage_current_period !== null && sub.usage_limit !== null && sub.usage_limit > 0) {
        const usagePct = (sub.usage_current_period / sub.usage_limit) * 100;
        const alertPct = sub.alert_at_usage_percent || 80;

        if (usagePct >= alertPct) {
          alerts.push({
            type: 'high_usage',
            severity: usagePct >= 95 ? 'critical' : 'warning',
            service: sub.service_name,
            message: `📊 ${sub.service_name}: ${usagePct.toFixed(1)}% del límite de uso alcanzado`,
            subscription_id: sub.id,
            amount_remaining: sub.usage_limit - sub.usage_current_period
          });
        }
      }
    }

    // Route each alert
    for (const alert of alerts) {
      await this._saveAndRoute(alert);
    }

    if (alerts.length > 0) {
      console.log(`[FinancialMonitor] ${alerts.length} alertas financieras generadas`);
    }
  }

  async _saveAndRoute(alert) {
    try {
      // Save to financial_alerts table
      const { error } = await supabase.from('financial_alerts').insert({
        subscription_id: alert.subscription_id,
        alert_type: alert.type,
        severity: alert.severity,
        message: alert.message,
        days_until_critical: alert.days_until_critical || null,
        amount_remaining: alert.amount_remaining || null,
        created_at: new Date().toISOString()
      });

      if (error) console.warn('[FinancialMonitor] Save error:', error.message);
    } catch (err) {
      console.warn('[FinancialMonitor] Save error:', err.message);
    }

    // Route to alert handler
    if (this.alertRouter) {
      await this.alertRouter.route({
        source: 'financial_monitor',
        ...alert
      });
    }
  }
}

module.exports = { FinancialMonitor };
