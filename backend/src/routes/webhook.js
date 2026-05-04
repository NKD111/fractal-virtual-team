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

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    team: 'Fractal Virtual Team v4.2',
    agents: 11,
    timestamp: new Date().toISOString()
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

module.exports = router;
