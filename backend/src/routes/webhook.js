const express = require('express');
const router = express.Router();
const { processIncoming } = require('../core/orchestrator');
const { supabase } = require('../core/supabase');
const { sendTwilioMessage } = require('../core/whatsapp');

// ─── META CLOUD API (Production WhatsApp) ─────────────────────────────────────

// Webhook verification
router.get('/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('[Webhook] Meta verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Incoming messages
router.post('/meta', async (req, res) => {
  res.sendStatus(200); // Ack immediately

  try {
    const body = req.body;
    if (!body?.entry?.[0]?.changes?.[0]?.value?.messages) return;

    const value = body.entry[0].changes[0].value;
    const message = value.messages[0];
    const from = message.from; // phone number

    let text = '';
    let mediaUrl = null;

    if (message.type === 'text') {
      text = message.text.body;
    } else if (message.type === 'image') {
      text = message.image?.caption || '[imagen recibida]';
      mediaUrl = message.image?.id; // Meta media ID
    } else if (message.type === 'audio') {
      text = '[nota de voz recibida]';
    } else if (message.type === 'document') {
      text = `[documento: ${message.document?.filename || 'archivo'}]`;
    } else {
      text = `[mensaje tipo: ${message.type}]`;
    }

    // Log raw webhook
    await supabase.from('webhooks_log').insert({
      source: 'meta_whatsapp',
      event_type: message.type,
      payload: body,
      processed: false
    });

    // Process
    await processIncoming({ from, text, channel: 'whatsapp', mediaUrl });

    // Mark processed
    await supabase.from('webhooks_log')
      .update({ processed: true })
      .eq('source', 'meta_whatsapp')
      .order('created_at', { ascending: false })
      .limit(1);

  } catch (err) {
    console.error('[Webhook Meta] Error:', err.message);
  }
});

// ─── TWILIO (Sandbox / dev WhatsApp) ──────────────────────────────────────────

router.post('/twilio', async (req, res) => {
  res.status(200).end(); // ACK vacío — sendStatus(200) manda "OK" como body y Twilio lo reenvía

  try {
    const { From, Body, MediaUrl0 } = req.body;
    if (!From || !Body) return;

    // Decodificar por si viene URL-encoded (sandbox/simulación) o tiene caracteres especiales
    const text = (() => { try { return decodeURIComponent(Body); } catch { return Body; } })();

    console.log(`[Webhook Twilio] From=${From} Body="${text.substring(0, 80)}"`);

    await supabase.from('webhooks_log').insert({
      source: 'twilio_whatsapp',
      event_type: 'message',
      payload: req.body
    });

    // Procesar mensaje y obtener respuesta de Mariana
    const response = await processIncoming({
      from: From,
      text,
      channel: 'whatsapp',
      mediaUrl: MediaUrl0 || null
    });

    // Enviar respuesta de Mariana de vuelta al WhatsApp de quien escribió
    if (response && typeof response === 'string') {
      await sendTwilioMessage(From, response);
      console.log(`[Webhook Twilio] Respuesta enviada a ${From}`);
    }
  } catch (err) {
    console.error('[Webhook Twilio] Error:', err.message);
  }
});

// ─── HEALTH CHECK ──────────────────────────────────────────────────────────────

router.get('/health', async (req, res) => {
  const start = Date.now();
  const checks = { meta_whatsapp: 'unknown', twilio: 'unknown', supabase: 'unknown', redis: 'unknown', resend: 'unknown', axiom: 'unknown' };
  const meta = {};
  const axios = require('axios');

  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${process.env.META_ACCESS_TOKEN}&access_token=${process.env.META_ACCESS_TOKEN}`,
      { timeout: 4000 }
    );
    if (data?.data?.is_valid) {
      checks.meta_whatsapp = 'healthy';
      meta.token_expires = data.data.expires_at === 0 ? 'never' : new Date(data.data.expires_at * 1000).toISOString();
    } else {
      checks.meta_whatsapp = 'degraded';
    }
  } catch (e) {
    checks.meta_whatsapp = 'degraded';
    meta.meta_error = (e.message || '').slice(0, 80);
  }

  checks.twilio = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) ? 'healthy' : 'not_configured';

  try {
    const { error } = await supabase.from('agents').select('id', { count: 'exact', head: true }).limit(1);
    checks.supabase = error ? 'degraded' : 'healthy';
  } catch (_) { checks.supabase = 'degraded'; }

  checks.redis = process.env.REDIS_URL ? 'healthy' : 'not_configured';
  checks.resend = process.env.RESEND_API_KEY ? 'healthy' : 'not_configured';

  try {
    const { data: lastAxiom } = await supabase.from('audit_log')
      .select('timestamp').eq('actor', 'axiom').eq('action', 'scan_completed')
      .order('timestamp', { ascending: false }).limit(1);
    if (lastAxiom && lastAxiom.length > 0) {
      const ageHours = ((Date.now() - new Date(lastAxiom[0].timestamp).getTime()) / 3600000).toFixed(1);
      checks.axiom = parseFloat(ageHours) < 8 ? 'healthy' : 'stale';
      meta.axiom_last_scan_hours_ago = parseFloat(ageHours);
    } else {
      checks.axiom = 'no_scans_yet';
    }
  } catch (_) { checks.axiom = 'unknown'; }

  try {
    const { data: lastStandup } = await supabase.from('audit_log')
      .select('timestamp, status').eq('action', 'standup_sent')
      .order('timestamp', { ascending: false }).limit(1);
    if (lastStandup && lastStandup.length > 0) {
      meta.last_standup = lastStandup[0].timestamp;
      meta.last_standup_status = lastStandup[0].status;
    }
  } catch (_) {}

  const allHealthy = Object.values(checks).every(s => s === 'healthy' || s === 'not_configured' || s === 'no_scans_yet');
  res.status(200).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    team: 'Fractal Virtual Team v4.2',
    agents_active: 12,
    services: checks,
    meta,
    uptime_seconds: Math.floor(process.uptime()),
    duration_ms: Date.now() - start
  });
});

// ─── GMAIL PUSH NOTIFICATIONS (Google Pub/Sub) ────────────────────────────────
// Setup: https://developers.google.com/gmail/api/guides/push
// When configured, Google sends POST here when proyectosfractalmx@gmail.com gets new email

router.post('/gmail', async (req, res) => {
  res.status(200).send(); // ACK immediately

  try {
    const data = req.body?.message?.data;
    if (!data) return;

    const decoded = JSON.parse(Buffer.from(data, 'base64').toString());
    const { emailAddress, historyId } = decoded;

    console.log(`[Webhook Gmail] Push notification — ${emailAddress} historyId: ${historyId}`);

    if (emailAddress !== (process.env.PROYECTOS_GMAIL || 'proyectosfractalmx@gmail.com')) return;

    // Trigger resource check
    const { checkResources } = require('../workers/resources.worker');
    await checkResources();

  } catch (err) {
    console.error('[Webhook Gmail] Error:', err.message);
  }
});

// ─── EMAIL INBOUND (Resend / Mailgun / generic) ───────────────────────────
// Cuando el usuario responde a un email de pitch [FX-<taskId>], parseamos
// el subject, extraemos el cuerpo y disparamos resumeTask.
//
// Resend inbound payload shape (cuando se configura inbound webhook):
//   { from, to, subject, text, html, ... }
// Mailgun shape similar pero con 'stripped-text'.
// Genérico: aceptamos cualquier { subject, text|body, from }.
router.post('/email-inbound', async (req, res) => {
  res.status(200).send('ok'); // ack inmediato

  try {
    const body = req.body || {};
    // Try multiple field names from common providers
    const subject = body.subject || body.Subject || body.headers?.subject || '';
    const rawText = body['stripped-text'] || body.text || body.body || body.plain || body.html || '';
    const from = body.from || body.From || body.sender || 'unknown';

    console.log(`[Webhook Email] Inbound from=${from} subject="${subject?.slice(0, 80)}"`);

    const { parseTaskIdFromSubject, extractReplyBody, resumeTask } = require('../routines/task-runner');
    const taskId = parseTaskIdFromSubject(subject);
    if (!taskId) {
      console.log('[Webhook Email] No [FX-taskId] tag in subject, ignoring');
      return;
    }

    const feedback = extractReplyBody(rawText);
    console.log(`[Webhook Email] Resuming task ${taskId} with feedback: "${feedback.slice(0, 60)}…"`);

    // fire-and-forget
    resumeTask({ taskId, feedback, source: 'email-reply' })
      .catch(err => console.error('[Webhook Email] resumeTask failed:', err.message));

  } catch (err) {
    console.error('[Webhook Email] Error:', err.message);
  }
});

module.exports = router;
