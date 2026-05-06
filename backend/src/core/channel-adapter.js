// backend/src/core/channel-adapter.js
// Adaptador unificado Twilio ↔ Meta Cloud API.
// Mariana NUNCA sabe si está en Twilio o Meta — el adapter traduce todo.

const axios = require('axios');
const { supabase } = require('./supabase');

/**
 * ChannelAdapter — single point of contact para outbound + normalización inbound.
 *
 * Variable de entorno: ACTIVE_CHANNEL = 'twilio' | 'meta'
 * Fallback: si no se especifica, usa 'twilio' (sandbox actual operacional).
 *
 * Cuando BV-1 sea aprobado y se haga /register con PIN, ejecutar:
 *   await ChannelAdapter.switchToMeta()
 * y la siguiente request usará Meta. Twilio queda como fallback siempre.
 */
class ChannelAdapter {
  static get ACTIVE_CHANNEL() {
    return process.env.ACTIVE_CHANNEL || 'twilio';
  }

  /**
   * Envía un mensaje al destinatario `to` por el canal activo.
   * `to` puede venir con o sin prefix 'whatsapp:' — se normaliza.
   * @returns { ok, messageId, channel, raw }
   */
  static async send(to, message, options = {}) {
    const channel = this.ACTIVE_CHANNEL;
    try {
      let result;
      if (channel === 'meta') {
        result = await this.sendViaMeta(to, message, options);
      } else {
        result = await this.sendViaTwilio(to, message, options);
      }
      // Audit log
      await this._safeLog({
        actor: 'mariana',
        action: 'message_sent',
        service: channel,
        status: 'success',
        details: { to: this._cleanPhone(to), messageId: result.messageId, len: (message || '').length }
      });
      return { ok: true, channel, ...result };
    } catch (err) {
      await this._safeLog({
        actor: 'mariana',
        action: 'message_send_failed',
        service: channel,
        status: 'failed',
        details: { to: this._cleanPhone(to), error: err.message },
        error_code: err.code || 'SEND_ERROR'
      });
      // Si falla Meta y Twilio está disponible: fallback automático
      if (channel === 'meta' && process.env.TWILIO_ACCOUNT_SID) {
        console.warn('[ChannelAdapter] Meta failed, falling back to Twilio');
        try {
          const fallback = await this.sendViaTwilio(to, message, options);
          await this._safeLog({
            actor: 'channel_adapter',
            action: 'meta_failed_twilio_fallback',
            service: 'twilio',
            status: 'success',
            details: { to: this._cleanPhone(to), originalError: err.message, fallbackId: fallback.messageId }
          });
          return { ok: true, channel: 'twilio_fallback', ...fallback };
        } catch (twErr) {
          throw new Error(`Both channels failed. Meta: ${err.message}. Twilio: ${twErr.message}`);
        }
      }
      throw err;
    }
  }

  /**
   * Normaliza payload inbound a una shape única.
   * @param {Object} payload — body del POST webhook
   * @param {string} source — 'meta' | 'twilio'
   * @returns { from, body, type, messageId, channel, mediaUrl?, raw }
   */
  static normalize(payload, source) {
    if (source === 'meta') {
      const value = payload?.entry?.[0]?.changes?.[0]?.value;
      const msg = value?.messages?.[0];
      if (!msg) return null;
      let body = '';
      let mediaUrl = null;
      let type = msg.type || 'text';
      if (type === 'text') {
        body = msg.text?.body || '';
      } else if (type === 'image') {
        body = msg.image?.caption || '[imagen]';
        mediaUrl = msg.image?.id || null;
      } else if (type === 'audio') {
        body = '[nota de voz]';
        mediaUrl = msg.audio?.id || null;
      } else if (type === 'document') {
        body = `[documento: ${msg.document?.filename || 'archivo'}]`;
        mediaUrl = msg.document?.id || null;
      } else {
        body = `[${type}]`;
      }
      return {
        from: this._normalizePhone(msg.from),
        body,
        type,
        messageId: msg.id,
        channel: 'whatsapp_meta',
        mediaUrl,
        timestamp: msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date(),
        raw: payload
      };
    }
    if (source === 'twilio') {
      return {
        from: this._normalizePhone((payload.From || '').replace('whatsapp:', '')),
        body: payload.Body || '',
        type: payload.NumMedia && parseInt(payload.NumMedia) > 0 ? 'media' : 'text',
        messageId: payload.MessageSid,
        channel: 'whatsapp_twilio',
        mediaUrl: payload.MediaUrl0 || null,
        timestamp: new Date(),
        raw: payload
      };
    }
    return null;
  }

  // ─── Implementations ─────────────────────────────────────────

  static async sendViaMeta(to, message, options = {}) {
    const phoneId = process.env.META_PHONE_NUMBER_ID;
    const token = process.env.META_ACCESS_TOKEN;
    if (!phoneId || !token) throw new Error('META_PHONE_NUMBER_ID or META_ACCESS_TOKEN missing');

    const cleanTo = this._cleanPhone(to);
    const body = {
      messaging_product: 'whatsapp',
      to: cleanTo,
      type: 'text',
      text: { preview_url: false, body: message }
    };
    const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
    const { data } = await axios.post(url, body, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    return {
      messageId: data?.messages?.[0]?.id || null,
      raw: data
    };
  }

  static async sendViaTwilio(to, message, options = {}) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
    if (!sid || !auth) throw new Error('TWILIO credentials missing');

    const twilio = require('twilio')(sid, auth);
    const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${this._cleanPhone(to)}`;
    const fromFormatted = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;

    const msg = await twilio.messages.create({
      from: fromFormatted,
      to: toFormatted,
      body: message
    });

    // Poll real status for 10s — avoid silent-success false positive
    let realStatus = msg.status;
    let errorCode = null;
    let errorMessage = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const m = await twilio.messages(msg.sid).fetch();
        realStatus = m.status;
        errorCode = m.errorCode || null;
        errorMessage = m.errorMessage || null;
        if (['delivered', 'read', 'failed', 'undelivered', 'sent'].includes(realStatus)) break;
      } catch (_) {}
    }
    if (['failed', 'undelivered'].includes(realStatus)) {
      const e = new Error(`Twilio delivery failed: ${realStatus} (${errorCode}: ${errorMessage})`);
      e.code = errorCode;
      throw e;
    }
    return {
      messageId: msg.sid,
      raw: { sid: msg.sid, status: realStatus, errorCode, errorMessage }
    };
  }

  // ─── Channel switching ──────────────────────────────────────

  /**
   * Cambia el canal activo a Meta. Requiere que el phone number esté CONNECTED en Cloud API.
   * Solo llamar después de BV-1 aprobado + /register exitoso.
   *
   * NOTA: Esto solo cambia la variable in-memory. Para persistir, usar
   * Railway GraphQL `variableUpsert` con `ACTIVE_CHANNEL=meta`.
   */
  static async switchToMeta() {
    process.env.ACTIVE_CHANNEL = 'meta';
    await this._safeLog({
      actor: 'system',
      action: 'channel_switched',
      service: 'channel_adapter',
      status: 'success',
      details: { from: 'twilio', to: 'meta', at: new Date().toISOString() }
    });
    console.log('[ChannelAdapter] ACTIVE_CHANNEL switched to META (in-memory)');
    return { ok: true, active: 'meta' };
  }

  static async switchToTwilio() {
    process.env.ACTIVE_CHANNEL = 'twilio';
    await this._safeLog({
      actor: 'system',
      action: 'channel_switched',
      service: 'channel_adapter',
      status: 'success',
      details: { from: 'meta', to: 'twilio', at: new Date().toISOString() }
    });
    console.warn('[ChannelAdapter] ACTIVE_CHANNEL rolled back to TWILIO');
    return { ok: true, active: 'twilio' };
  }

  // ─── Helpers ────────────────────────────────────────────────

  /**
   * Limpia el número: remueve prefix 'whatsapp:', '+', espacios.
   * Mantiene el `1` legacy MX si está presente (formato +5215534189583 stays).
   */
  static _cleanPhone(phone) {
    if (!phone) return '';
    return String(phone).replace('whatsapp:', '').replace(/[\s+]/g, '');
  }

  /**
   * Normaliza para comparar: igual que cleanPhone pero también remueve `1` después de `52`
   * (para identificar mismo cliente independiente de formato).
   */
  static _normalizePhone(phone) {
    const clean = this._cleanPhone(phone);
    if (clean.startsWith('521') && clean.length === 13) return '52' + clean.slice(3);
    return clean;
  }

  static async _safeLog(args) {
    try {
      await supabase.rpc('log_action', {
        p_actor: args.actor,
        p_action: args.action,
        p_service: args.service,
        p_status: args.status,
        p_details: args.details || null,
        p_error_code: args.error_code || null
      });
    } catch (e) {
      // log_action puede no existir si SQL no se pegó aún. NO romper el flow.
      console.warn('[ChannelAdapter] log_action skipped:', e?.message?.slice(0, 80));
    }
  }
}

module.exports = ChannelAdapter;
