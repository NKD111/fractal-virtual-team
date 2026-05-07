const express = require('express');
const router = express.Router();
const { processIncoming } = require('../core/orchestrator');
const { supabase } = require('../core/supabase');
const { sendTwilioMessage, sendMetaMessage } = require('../core/whatsapp');

// ─── Rate limiter en memoria (sin dependencias extra) ──────────────────────────
// Ventana deslizante: max 30 requests / 60 segundos por IP
const _rateLimitMap = new Map();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 60_000; // 1 min

function _checkRateLimit(ip) {
  const now = Date.now();
  let bucket = _rateLimitMap.get(ip);

  if (!bucket) {
    bucket = { count: 0, windowStart: now };
    _rateLimitMap.set(ip, bucket);
  }

  // Reset ventana si expiró
  if (now - bucket.windowStart > RATE_LIMIT_WINDOW) {
    bucket.count = 0;
    bucket.windowStart = now;
  }

  bucket.count++;

  // Limpiar IPs inactivas cada 5 min para evitar memory leak
  if (_rateLimitMap.size > 500) {
    for (const [k, v] of _rateLimitMap) {
      if (now - v.windowStart > 5 * 60_000) _rateLimitMap.delete(k);
    }
  }

  return bucket.count <= RATE_LIMIT_MAX;
}

function rateLimitMiddleware(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  if (!_checkRateLimit(ip)) {
    console.warn(`[Webhook] Rate limit exceeded — IP: ${ip}`);
    return res.status(429).json({ error: 'Too many requests', retry_after: '60s' });
  }
  next();
}

router.use(rateLimitMiddleware);

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

    // Deduplicación Meta — ignorar entrega duplicada del mismo mensaje
    if (_isDuplicateMeta(message.id)) {
      console.log(`[Webhook Meta] Dedup — message.id=${message.id} ya procesado, ignorando`);
      return;
    }

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

    // Log raw webhook; capturar ID para marcar processed=true al finalizar
    const { data: metaLog } = await supabase.from('webhooks_log').insert({
      source: 'meta_whatsapp',
      event_type: message.type,
      payload: body,
      processed: false
    }).select('id').single();
    const metaLogId = metaLog?.id || null;

    // Process y enviar respuesta de vuelta a quien escribió
    const response = await processIncoming({ from, text, channel: 'whatsapp', mediaUrl });
    if (response && typeof response === 'string') {
      await sendMetaMessage(from, _truncateWA(response));
      console.log(`[Webhook Meta] Respuesta enviada a ${from}: "${response.substring(0, 60)}..."`);
    }

    // Mark processed — usar ID capturado, no order+limit (no válido en update)
    if (metaLogId) {
      await supabase.from('webhooks_log').update({ processed: true }).eq('id', metaLogId);
    }

  } catch (err) {
    console.error('[Webhook Meta] Error:', err.message);
  }
});

// ─── TWILIO (Sandbox / dev WhatsApp) ──────────────────────────────────────────

// Dedup cache en memoria: MessageSid → timestamp. Limpiamos entradas > 10min.
const _twilioSeenSids = new Map();
function _isDuplicateTwilio(sid) {
  if (!sid) return false;
  const now = Date.now();
  // Limpiar entradas viejas (> 10 min)
  for (const [k, ts] of _twilioSeenSids) {
    if (now - ts > 600_000) _twilioSeenSids.delete(k);
  }
  if (_twilioSeenSids.has(sid)) return true;
  _twilioSeenSids.set(sid, now);
  return false;
}

// Dedup cache Meta: MessageId → timestamp
const _metaSeenIds = new Map();
function _isDuplicateMeta(msgId) {
  if (!msgId) return false;
  const now = Date.now();
  for (const [k, ts] of _metaSeenIds) {
    if (now - ts > 600_000) _metaSeenIds.delete(k);
  }
  if (_metaSeenIds.has(msgId)) return true;
  _metaSeenIds.set(msgId, now);
  return false;
}

// Trunca mensajes WA al límite de 4096 chars
const MAX_WA = 4096;
function _truncateWA(text) {
  if (!text || text.length <= MAX_WA) return text;
  return text.substring(0, MAX_WA - 40) + '\n…_(mensaje truncado)_';
}

router.post('/twilio', async (req, res) => {
  res.status(200).end(); // ACK vacío — sendStatus(200) manda "OK" como body y Twilio lo reenvía

  let logId = null;
  try {
    const { From, Body, MediaUrl0, MessageSid } = req.body;
    if (!From || !Body) return;

    // Deduplicación: ignorar reintentos de Twilio con el mismo MessageSid
    if (_isDuplicateTwilio(MessageSid)) {
      console.log(`[Webhook Twilio] Dedup — MessageSid=${MessageSid} ya procesado, ignorando reintento`);
      return;
    }

    // Decodificar por si viene URL-encoded (sandbox/simulación) o tiene caracteres especiales
    const text = (() => { try { return decodeURIComponent(Body); } catch { return Body; } })();

    console.log(`[Webhook Twilio] From=${From} SID=${MessageSid} Body="${text.substring(0, 80)}"`);

    // Insert con processed=false; capturar ID para marcarlo true al finalizar
    const { data: logEntry } = await supabase.from('webhooks_log').insert({
      source: 'twilio_whatsapp',
      event_type: 'message',
      payload: req.body,
      processed: false
    }).select('id').single();
    logId = logEntry?.id || null;

    // Procesar mensaje y obtener respuesta de Mariana
    const response = await processIncoming({
      from: From,
      text,
      channel: 'whatsapp',
      mediaUrl: MediaUrl0 || null
    });

    // Enviar respuesta de Mariana de vuelta al WhatsApp de quien escribió
    if (response && typeof response === 'string') {
      await sendTwilioMessage(From, _truncateWA(response));
      console.log(`[Webhook Twilio] Respuesta enviada a ${From}`);
    }

    // Marcar como procesado exitosamente
    if (logId) {
      await supabase.from('webhooks_log').update({ processed: true }).eq('id', logId);
    }
  } catch (err) {
    console.error('[Webhook Twilio] Error:', err.message);
    // Marcar como fallido pero procesado (evita reintento infinito)
    if (logId) {
      await supabase.from('webhooks_log')
        .update({ processed: true, error: err.message.slice(0, 200) })
        .eq('id', logId);
    }
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


// ─── STRIPE WEBHOOK ──────────────────────────────────────────────────────────
router.post('/stripe', async (req, res) => {
  res.status(200).end();  // ack inmediato
  try {
    const stripeClient = require('../core/stripe-client');
    const sig = req.headers['stripe-signature'];
    const result = await stripeClient.processWebhook(JSON.stringify(req.body), sig);
    console.log('[Stripe webhook]', result);
  } catch (err) {
    console.error('[Stripe webhook] error:', err.message);
  }
});

module.exports = router;
