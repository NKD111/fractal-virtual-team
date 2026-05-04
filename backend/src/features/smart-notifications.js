// backend/src/features/smart-notifications.js
// D2: Notificaciones inteligentes con anti-spam (dedup por key)

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');

class SmartNotifications {
  constructor() {
    this.sentToday = new Set();
    this.lastReset = new Date().toDateString();
  }

  _resetIfNewDay() {
    const today = new Date().toDateString();
    if (today !== this.lastReset) { this.sentToday.clear(); this.lastReset = today; }
  }

  async send({ message, type = 'generic', dedupKey = null }) {
    this._resetIfNewDay();
    if (dedupKey && this.sentToday.has(dedupKey)) {
      return { sent: false, reason: 'dedup' };
    }
    try {
      await notifyNeiky(message);
      if (dedupKey) this.sentToday.add(dedupKey);
      try {
        await supabase.from('system_events').insert({
          event_type: 'notification_sent',
          severity: 'info',
          service_key: 'notifications',
          details: { type, dedupKey }
        });
      } catch (_) {}
      return { sent: true };
    } catch (err) {
      return { sent: false, error: err.message };
    }
  }

  async notifyProjectDeadline(project) {
    if (!project?.deadline) return;
    const days = Math.round((new Date(project.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    return this.send({
      message: `⏰ *DEADLINE PRONTO*\n"${project.name}"\nCliente: ${project.client_name || project.clients?.name || 'sin cliente'}\nFaltan: ${days} días`,
      type: 'deadline_warning',
      dedupKey: `deadline_${project.id}_${days}`
    });
  }

  async notifyNewClient(client) {
    return this.send({
      message: `🆕 *NUEVO CLIENTE*\n${client.name}\nContacto: ${client.phone || client.email || 'sin canal'}`,
      type: 'new_client',
      dedupKey: `new_client_${client.id}`
    });
  }

  async notifyQuoteAccepted(quote) {
    return this.send({
      message: `💰 *¡COTIZACIÓN ACEPTADA!*\nCliente: ${quote.client_name}\nServicio: ${quote.service_type}\nMonto: $${Number(quote.final_price || 0).toLocaleString()} MXN`,
      type: 'quote_accepted',
      dedupKey: `quote_accepted_${quote.id}`
    });
  }
}

module.exports = SmartNotifications;
