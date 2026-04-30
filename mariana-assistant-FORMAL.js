/**
 * mariana-assistant-FORMAL.js — BUILD-META-v1
 *
 * Soporta dos transportes en paralelo:
 *   1. Twilio Sandbox   → POST /whatsapp       (modo sandbox actual — Fer ya registrado)
 *   2. Meta Cloud API   → GET/POST /meta-webhook (modo formal, activa con META_ACCESS_TOKEN)
 *
 * Para activar Meta: agrega META_ACCESS_TOKEN + META_PHONE_NUMBER_ID en Railway env vars.
 * Twilio sigue activo para notificaciones a Fer sin importar el transporte principal.
 */

const express  = require('express');
const twilio   = require('twilio');
const dotenv   = require('dotenv');
const crypto   = require('crypto');
const fs       = require('fs');
const path     = require('path');

dotenv.config({ path: '.env.mariana', override: true });

const { extract }          = require('./skills/intent');
const { analyze }          = require('./skills/sentiment-es');
const { buildResponse }    = require('./skills/short-response-generator');
const { generateResponse } = require('./skills/ai-brain');
const store                = require('./skills/store');
const { getDueJobs, markSent, cancelPending } = require('./skills/pending-jobs');
const { writeClientNote }  = require('./skills/obsidian-context');

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio
app.use(express.json());                          // Meta Cloud API

// ─── Config ──────────────────────────────────────────────────────────────────
const TWILIO_WA = process.env.TWILIO_WHATSAPP_NUMBER   || 'whatsapp:+14155238886';
const FERMIN_WA = process.env.FERMIN_PERSONAL_WHATSAPP || 'whatsapp:+525534189583';
const VAULT     = process.env.OBSIDIAN_VAULT           || 'C:\\Users\\naked\\Desktop\\BOVEDA NKD';

// Meta Cloud API — activo solo cuando AMBAS vars están configuradas
const META_TOKEN    = process.env.META_ACCESS_TOKEN;
const META_PHONE_ID = process.env.META_PHONE_NUMBER_ID;
const META_VERIFY   = process.env.META_VERIFY_TOKEN || 'mariana-fractal-secret-2024';
const USE_META      = !!(META_TOKEN && META_PHONE_ID);

// Twilio client — siempre activo (notificaciones a Fer, fallback)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Lista de destinos de notificación a Fer (Business + Personal)
const FERMIN_NOTIFY_LIST = [
  process.env.FERMIN_NOTIFY_WHATSAPP,
  process.env.FERMIN_NOTIFY_2_WHATSAPP,
].filter(Boolean).map(s => s.trim()).filter(s => /^whatsapp:\+\d+$/.test(s));
if (FERMIN_NOTIFY_LIST.length === 0) FERMIN_NOTIFY_LIST.push(FERMIN_WA);

// Detección robusta de Fer — compara últimos 10 dígitos para ignorar prefijos +52/+521
const onlyDigits = s => (s || '').replace(/\D/g, '');
const FER_DIGITS_LIST = [
  onlyDigits(FERMIN_WA).slice(-10),
  onlyDigits(process.env.FERMIN_NOTIFY_WHATSAPP).slice(-10),
  onlyDigits(process.env.FERMIN_NOTIFY_2_WHATSAPP).slice(-10),
  ...(process.env.FERMIN_EXTRA_NUMBERS || '').split(',').map(s => onlyDigits(s).slice(-10)),
].filter((v, i, a) => v && a.indexOf(v) === i);

function isFermin(phone) {
  return FER_DIGITS_LIST.includes(onlyDigits(phone).slice(-10));
}

const AI_ENABLED  = !!(process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY);
const RETURN_MS   = 60 * 60 * 1000;
const NOTIFY_WIN  = 5 * 60 * 1000;

console.log(`\n[startup] BUILD-META-v1 🚀`);
console.log(`[startup] Transporte: ${USE_META ? '✅ Meta Cloud API ACTIVO' : '📱 Twilio Sandbox (Meta pendiente)'}`);
console.log(`[startup] IA: ${AI_ENABLED ? '✅ activa' : '⚠️ sin API key'}`);
console.log(`[startup] Notifs Fer → ${JSON.stringify(FERMIN_NOTIFY_LIST)}`);
console.log(`[startup] isFer si últimos 10 dígitos en ${JSON.stringify(FER_DIGITS_LIST)}\n`);

// ─── Logs internos ────────────────────────────────────────────────────────────
const eventLog = [];
const inboxLog  = [];

function logEvent(e)  { eventLog.unshift({ ts: new Date().toISOString(), ...e }); if (eventLog.length > 50)  eventLog.pop(); }
function logInbox(e)  { inboxLog.unshift({ ts: new Date().toISOString(), ...e  }); if (inboxLog.length  > 200) inboxLog.pop(); }

// ─── Meta Cloud API: enviar mensaje ──────────────────────────────────────────
async function sendMetaMessage(toPhone, text) {
  if (!USE_META) throw new Error('Meta no está configurado (falta META_ACCESS_TOKEN o META_PHONE_NUMBER_ID)');
  const to = onlyDigits(toPhone); // Meta espera solo dígitos sin "whatsapp:"
  const res = await fetch(`https://graph.facebook.com/v20.0/${META_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
  const data = await res.json();
  if (!res.ok) { console.error('[meta-send] ❌', JSON.stringify(data)); throw new Error(data?.error?.message || 'Meta send error'); }
  console.log(`[meta-send] ✅ mid=${data.messages?.[0]?.id} to=${to}`);
  return data;
}

// Helper: marcar mensaje como leído (doble palomita azul — mejora UX)
async function markMetaRead(messageId) {
  if (!USE_META || !messageId) return;
  await fetch(`https://graph.facebook.com/v20.0/${META_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
  }).catch(() => {});
}

// ─── Notificaciones a Fer (siempre vía Twilio) ───────────────────────────────
async function notifyFer(subject, body) {
  logInbox({ type: 'notify', subject, body });
  const results = [];

  for (const dest of FERMIN_NOTIFY_LIST) {
    try {
      const msg = await twilioClient.messages.create({ from: TWILIO_WA, to: dest, body: `🔔 ${subject}\n${body}` });
      console.log(`[notify] ✅ sid=${msg.sid} status=${msg.status} → ${dest}`);
      results.push({ dest, sid: msg.sid, status: msg.status });

      setTimeout(async () => {
        try {
          const upd = await twilioClient.messages(msg.sid).fetch();
          if (upd.status === 'failed' || upd.status === 'undelivered') {
            console.error(`[notify] ⚠️ ${dest} falló: ${upd.errorCode} ${upd.errorMessage}`);
            _obsidianAlert(subject, body, dest, upd.errorCode);
          } else {
            console.log(`[notify] 📬 ${dest} → ${upd.status}`);
          }
        } catch {}
      }, 4000);
    } catch (err) {
      console.error(`[notify] ❌ ${dest}:`, err.code, err.message);
      results.push({ dest, error: err.message });
    }
  }

  if (!results.some(r => r.sid)) _obsidianAlert(subject, body, 'TODOS', null);
  return { ok: results.some(r => r.sid), results };
}

function _obsidianAlert(subject, body, dest, errorCode) {
  try {
    const dir = path.join(VAULT, '20 Proyectos', 'Inbox Mariana');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    const line  = errorCode
      ? `\n## ${stamp} — ${subject} (NO ENTREGADA a ${dest}, error ${errorCode})\n\n${body}\n\n---\n`
      : `\n## ${stamp} — ${subject} (TODAS LAS NOTIFS FALLARON)\n\n${body}\n\n---\n`;
    fs.appendFileSync(path.join(dir, '_ALERTAS.md'), line, 'utf8');
  } catch {}
}

// ─── Helpers de perfil y NLP ──────────────────────────────────────────────────
const FLIRT_RX = /(hola|hey|que tal)\s+(guapa|linda|hermosa|bonita|preciosa|princesa)|te\s+(invito|llevo|miro|veo)\s+(un|a|el|la)?\s*(caf[eé]|copa|cena|tomar|salir|comer)|est[aá]s\s+(muy\s+)?(buena|guapa|hermosa|bonita|preciosa|rica|linda)|me\s+gust(a|ar[ií]a)\s+(invitarte|verte|conocerte|tu\s+voz)|(qu[eé]\s+(linda|hermosa|bonita|simpat|sexy|guapa))|tu\s+voz\s+(es\s+)?(linda|hermosa|bonita|sexy)|d[ée]jame\s+(invitarte|conocerte)|sales\s+conmigo|(eres|est[aá]s)\s+(hermos|preciosa|guapa|sexy|bell)|tienes\s+novio|me\s+das\s+tu\s+(numero|whats|insta)/i;
const BUSINESS_RX = /(?:mi|para mi|tengo (?:un|una)|es (?:un|una))\s+(restaurante|café|cafeter[ií]a|gym|gimnasio|boutique|tienda|empresa|marca|despacho|consultora|cl[ií]nica|farmacia|hotel|estudio|agencia|negocio|marca personal|e-?commerce)/i;

const detectFlirting     = text => FLIRT_RX.test(text);
const extractBusinessType = text => { const m = text.match(BUSINESS_RX); return m ? m[1].toLowerCase() : null; };
const emptyProfile        = () => ({ source: null, businessType: null, projectType: null, budget: null, timeline: null, objective: null, concerns: [], rawNeed: null });

function updateProfile(profile, extracted, text) {
  if (extracted.projectType && !profile.projectType) profile.projectType = extracted.projectType;
  if (extracted.budget      && !profile.budget)      profile.budget      = extracted.budget;
  if (extracted.timeline    && !profile.timeline)    profile.timeline    = extracted.timeline;
  if (extracted.objective   && !profile.objective)   profile.objective   = extracted.objective;
  const biz = extractBusinessType(text);
  if (biz && !profile.businessType) profile.businessType = biz;
  const objIntents = ['objection_price','objection_thinking','objection_competitor','objection_time'];
  if (objIntents.includes(extracted.intent) && !profile.concerns.includes(extracted.intent)) profile.concerns.push(extracted.intent);
}

function leadSummary(conv) {
  const p = conv.profile;
  const lines = [`👤 ${conv.name}`, `📱 ${conv.phone.replace('whatsapp:', '')}`];
  if (p.source)          lines.push(`📣 Fuente: ${p.source}`);
  if (p.businessType)    lines.push(`🏢 Negocio: ${p.businessType}`);
  if (p.projectType)     lines.push(`💼 Proyecto: ${p.projectType}`);
  if (p.budget)          lines.push(`💰 Presupuesto: $${p.budget.toLocaleString('es-MX')}`);
  if (p.timeline)        lines.push(`📅 Fecha: ${p.timeline}`);
  if (p.concerns.length) lines.push(`⚠️ Objeciones: ${p.concerns.join(', ')}`);
  return lines.join('\n');
}

function buildActionFlags(conv, text, extracted, sentiment, isReturning) {
  const flags = [];
  const t = (text || '').toLowerCase();
  if (isReturning)                           flags.push('El cliente regresó después de más de 1 hora sin escribir');
  if (conv.msgs === 1)                       flags.push('Primer mensaje de este cliente');
  if (conv.state === 'closing')              flags.push('Conversación en etapa de cierre/propuesta');
  if (conv.state === 'escalated')            flags.push('Conversación escalada a Fer');
  if (extracted.intent === 'contact_fermin') flags.push('Cliente quiere hablar con Fer directamente');
  if (extracted.intent === 'ready')          flags.push('Cliente listo para proceder/contratar');
  if (sentiment.emotion === 'muy_negativo')  flags.push('Cliente con sentimiento muy negativo');
  if (/casi list|ya casi|falta poco|ya mero|última revisión/i.test(t)) flags.push('Proyecto cerca de entrega');
  if (/gratis|sin costo adicional/i.test(t)) flags.push('Cliente pregunta por algo fuera del alcance');
  const e = conv.emotional || {};
  if ((e.demandScore || 0) >= 3) flags.push(`Cliente con ${e.demandScore} rondas de cambios extra`);
  if ((e.toxicScore  || 0) >= 3) flags.push(`Cliente con tensión acumulada (score ${e.toxicScore})`);
  if (e.ferAlerted)               flags.push('Fer ya fue notificado de esta conversación');
  return flags;
}

// ─── NÚCLEO: procesar mensaje entrante (compartido entre Twilio y Meta) ────────
async function processIncomingMessage({ phone, name, text, msgId }) {
  const isFer = isFermin(phone);
  console.log(`📨 ${isFer ? '⭐ FER' : name}: ${text || '[media]'}`);

  cancelPending(phone);

  // Dedup — evita responder dos veces al mismo mensaje
  const msgHash = crypto.createHash('md5').update(msgId || `${phone}${text}${Date.now()}`).digest('hex');
  let conv = store.get(phone);
  if (conv && conv.lastMsgHash === msgHash) {
    console.log('   [dedup] mensaje duplicado ignorado');
    return null;
  }

  const isNew       = !conv;
  const isReturning = conv && conv.lastMsgTs && (Date.now() - conv.lastMsgTs > RETURN_MS);

  if (!conv) {
    conv = {
      phone, name,
      state: isFer ? 'fer' : 'new',
      msgs: 0, negativeStreak: 0,
      needsEscalation: false, escalationsSent: new Set(),
      lastMsgHash: null, lastMsgTs: null,
      profile: emptyProfile(), history: [], isFer,
    };
  }

  if (!conv.profile) conv.profile = emptyProfile();
  if (!conv.history) conv.history = [];
  if (conv.source  && !conv.profile.source)  conv.profile.source  = conv.source;
  if (conv.need    && !conv.profile.rawNeed) conv.profile.rawNeed = conv.need;

  conv.name        = isFer ? 'Fer' : name;
  conv.msgs        = (conv.msgs || 0) + 1;
  conv.lastMsgHash = msgHash;
  conv.isFer       = isFer;

  const extracted = extract(text);
  const sentiment = analyze(text);
  updateProfile(conv.profile, extracted, text);
  if (conv.profile.source)  conv.source = conv.profile.source;
  if (conv.profile.rawNeed) conv.need   = conv.profile.rawNeed;

  console.log(`   intent:${extracted.intent} | emotion:${sentiment.emotion}${isFer ? ' | [FER MODE]' : ''} | AI:${AI_ENABLED}`);

  const actionFlags = buildActionFlags(conv, text, extracted, sentiment, isReturning);

  // ── Generar respuesta ──────────────────────────────────────────────────────
  let reply;

  if (AI_ENABLED) {
    reply = await generateResponse({ conv, text, extracted, sentiment, isFer, actionFlags });
  }

  // Fallback cariñoso para Fer — NUNCA cae al sistema de reglas genérico
  if (!reply && isFer) {
    const ferFallbacks = [
      'Ay Fer, déjame procesar eso bien y te escribo en un ratito 🤍',
      'Mi Fer, dame un segundo, te respondo en un momentito ✨',
      'Espérame tantito, guapo, ya te escribo ☺️',
      'Justo me agarras saturada con algo, dame un minuto y te respondo, ¿va? 🤍',
    ];
    reply = ferFallbacks[Math.floor(Math.random() * ferFallbacks.length)];
    console.log('   [fallback Fer] usando respuesta cariñosa');
  }

  // Fallback para clientes — sistema de reglas
  if (!reply) {
    reply = buildResponse(conv, isFer ? 'Fer' : name, text, extracted, sentiment, isReturning);
    console.log('   [fallback] sistema de reglas');
  }

  // ── Actualizar estado ──────────────────────────────────────────────────────
  if (!isFer) {
    if (/le aviso a Fer|Fer ya está enterado|te escribimos asap/i.test(reply)) conv.state = 'closing';
    if (/Fer.*escrib|escrib.*directo/i.test(reply)) conv.needsEscalation = true;
  }

  // ── Historial — buffer largo para mantener contexto en conversaciones extensas ──
  conv.history.push({ role: 'user',    text: text || '[media]', ts: Date.now() });
  conv.history.push({ role: 'mariana', text: reply,             ts: Date.now() });
  if (conv.history.length > 200) conv.history = conv.history.slice(-200);
  conv.lastMsgTs = Date.now();

  // Typing delay natural (Fer espera menos)
  const baseMs   = isFer ? 25 : 38;
  const typingMs = Math.min(Math.max(reply.length * baseMs, isFer ? 800 : 2000), isFer ? 4000 : 8000);
  await new Promise(r => setTimeout(r, typingMs));

  store.set(phone, conv);

  // ── Obsidian: auto-backup conversaciones de clientes ──────────────────────
  if (!isFer) {
    try {
      const dir      = path.join(VAULT, '20 Proyectos', 'Inbox Mariana');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const safeName  = (conv.name || 'cliente').replace(/[^a-zA-ZÀ-ÿ0-9 ]/g, '').trim() || 'cliente';
      const phoneTail = (phone || '').replace(/\D/g, '').slice(-4);
      const file      = path.join(dir, `${safeName}-${phoneTail}.md`);
      const stamp     = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
      const exists    = fs.existsSync(file);
      let content     = '';
      if (!exists) {
        content += `# ${conv.name} (${(phone || '').replace('whatsapp:', '')})\n\n`;
        content += `📅 Primer contacto: ${stamp}\n📲 Teléfono: ${(phone || '').replace('whatsapp:', '')}\n\n## Conversación\n\n`;
      }
      content += `**[${stamp}] ${conv.name}:** ${text || '[media]'}\n\n`;
      content += `**[${stamp}] Mariana:** ${reply}\n\n`;
      fs.appendFileSync(file, content, 'utf8');
    } catch (err) { console.error('[obsidian]', err.message); }
  }

  // ── Notificaciones a Fer ───────────────────────────────────────────────────
  if (!isFer) {
    // Coqueteo de terceros — alerta única por conversación
    if (detectFlirting(text) && !conv.flirtAlerted) {
      conv.flirtAlerted = true;
      store.set(phone, conv);
      notifyFer('🚨 Coqueteo detectado', `Cliente: ${conv.name} (${phone.replace('whatsapp:', '')})\nMensaje: "${text}"\n\nMariana respondió fríamente.`);
    }

    // Nuevo lead
    if (isNew) notifyFer('🆕 Nuevo lead', leadSummary(conv));

    // Mensajes subsiguientes — throttle 5 min
    if (!isNew && (Date.now() - (conv.lastNotifTs || 0) > NOTIFY_WIN)) {
      conv.lastNotifTs = Date.now();
      notifyFer(`💬 ${conv.name}`, `📱 ${phone.replace('whatsapp:', '')}\n📊 Estado: ${conv.state}\n\n"${(text || '[media]').slice(0, 200)}"\n\nMariana: "${reply.slice(0, 120)}${reply.length > 120 ? '…' : ''}"`);
    }

    // Escalación
    if (conv.needsEscalation && !conv.escalationsSent.has('escalation')) {
      conv.escalationsSent.add('escalation');
      store.set(phone, conv);
      const reason = conv.escalationReason || 'frustrated';
      const labels = { toxic_client: '🚨 Cliente tóxico.', excessive_changes: '🔄 Exceso de cambios.', frustrated: '⚠️ Cliente frustrado.' };
      notifyFer('⚡ Escalación', `${leadSummary(conv)}\n\n${labels[reason] || labels.frustrated}`);
    }

    // Lead calificado (→ closing)
    if (conv.state === 'closing' && !conv.escalationsSent.has('qualifying')) {
      conv.escalationsSent.add('qualifying');
      store.set(phone, conv);
      notifyFer('Lead calificado ✅', leadSummary(conv));
      writeClientNote(conv);
    }
  }

  logEvent({ phone, name: conv.name, isFer, text: text || '[media]', intent: extracted.intent, state: conv.state, reply: reply.slice(0, 80) });
  console.log(`✅ [${conv.state}]${isFer ? '[FER]' : ''} → ${reply.slice(0, 70)}…`);

  return reply;
}

// ─── TRANSPORTE 1: Twilio Sandbox ────────────────────────────────────────────
app.post('/whatsapp', async (req, res) => {
  const text  = (req.body.Body || '').trim();
  const phone = req.body.From  || '';
  const name  = req.body.ProfileName || 'Cliente';
  const msgId = req.body.MessageSid  || '';

  const reply = await processIncomingMessage({ phone, name, text, msgId });

  const twiml = new twilio.twiml.MessagingResponse();
  if (reply) twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
});

// ─── TRANSPORTE 2: Meta Cloud API ────────────────────────────────────────────

// GET — Meta llama esto una sola vez para verificar el webhook
app.get('/meta-webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log(`[meta] GET verificación — mode=${mode} token_ok=${token === META_VERIFY}`);

  if (mode === 'subscribe' && token === META_VERIFY) {
    console.log('[meta] ✅ Webhook verificado por Meta');
    return res.status(200).send(challenge);
  }
  console.error('[meta] ❌ Verificación fallida — revisa META_VERIFY_TOKEN');
  res.sendStatus(403);
});

// POST — mensajes entrantes de clientes vía Meta
app.post('/meta-webhook', async (req, res) => {
  // Meta requiere respuesta < 20s o retransmite el webhook
  res.sendStatus(200);

  const body = req.body;
  if (body?.object !== 'whatsapp_business_account') return;

  for (const entry of (body.entry || [])) {
    for (const change of (entry.changes || [])) {
      if (change.field !== 'messages') continue;
      const val = change.value;

      // Marcar como leído inmediatamente (doble palomita azul)
      for (const msg of (val.messages || [])) {
        markMetaRead(msg.id);
      }

      for (const msg of (val.messages || [])) {
        const contact = (val.contacts || []).find(c => c.wa_id === msg.from);
        const phone   = `whatsapp:+${msg.from}`;
        const name    = contact?.profile?.name || 'Cliente';

        // Media (fotos, audios, stickers) — respuesta cortés
        if (msg.type !== 'text') {
          const mediaReply = 'Recibí tu mensaje ☺️ Por el momento solo proceso texto — si tienes una pregunta sobre Fractal MX, con gusto te atiendo.';
          await sendMetaMessage(phone, mediaReply).catch(e => console.error('[meta] media-fallback:', e.message));
          continue;
        }

        const text  = msg.text?.body || '';
        const msgId = msg.id;

        try {
          const reply = await processIncomingMessage({ phone, name, text, msgId });
          if (reply) await sendMetaMessage(phone, reply);
        } catch (err) {
          console.error('[meta] Error procesando:', err.message);
          // Fallback de emergencia — no dejar al cliente sin respuesta
          await sendMetaMessage(phone, 'Tuve un pequeño problema técnico. ¿Puedes repetir tu mensaje? 🙏').catch(() => {});
        }
      }
    }
  }
});

// ─── Admin endpoints ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status:    'ok',
  build:     'META-v1',
  transport: USE_META ? 'meta-cloud-api' : 'twilio-sandbox',
  ai:        AI_ENABLED,
  ts:        new Date().toISOString(),
}));

app.get('/meta-status', (req, res) => {
  const host = req.get('host');
  res.json({
    metaActivo:      USE_META,
    phoneNumberId:   META_PHONE_ID || '(no configurado)',
    verifyToken:     META_VERIFY,
    webhookUrl:      `https://${host}/meta-webhook`,
    hasAccessToken:  !!META_TOKEN,
    nextStep:        USE_META
      ? '✅ Meta activo. Configura este webhook en Meta Developers → WhatsApp → Configuration.'
      : `⏳ Agrega en Railway:\n  META_ACCESS_TOKEN=<tu token>\n  META_PHONE_NUMBER_ID=<tu phone id>\n  META_VERIFY_TOKEN=${META_VERIFY}`,
  });
});

app.get('/stats', (_req, res) => {
  const convs = [];
  for (const [phone, c] of store.entries()) {
    convs.push({ phone, name: c.name, isFer: c.isFer, state: c.state, msgs: c.msgs, profile: c.profile, lastMsgTs: c.lastMsgTs });
  }
  res.json({ total: convs.length, build: 'META-v1', transport: USE_META ? 'meta' : 'twilio', aiEnabled: AI_ENABLED, conversations: convs });
});

app.get('/logs',         (_req, res) => res.json({ count: eventLog.length, events: eventLog }));
app.get('/inbox/notifs', (_req, res) => res.json({ count: inboxLog.length,  notifs: inboxLog }));

app.get('/conv/:phone', (req, res) => {
  const phone = decodeURIComponent(req.params.phone);
  const c = store.get(phone);
  c ? res.json(c) : res.status(404).json({ error: 'no encontrado' });
});

app.post('/reset/:phone', (req, res) => {
  const phone = decodeURIComponent(req.params.phone);
  if (!store.has(phone)) return res.status(404).json({ ok: false });
  store.set(phone, { phone, name: 'Cliente', state: 'new', msgs: 0, negativeStreak: 0,
    needsEscalation: false, escalationsSent: new Set(), lastMsgHash: null, lastMsgTs: null,
    profile: emptyProfile(), history: [] });
  res.json({ ok: true });
});

// ─── Inbox web — Fer puede ver desde cualquier browser ───────────────────────
app.get('/inbox', (_req, res) => {
  const convs = [];
  for (const [phone, c] of store.entries()) {
    if (c.isFer) continue;
    const lastMsg = (c.history || []).slice(-1)[0];
    convs.push({ name: c.name, phone: phone.replace('whatsapp:', ''), state: c.state,
      msgs: c.msgs, lastMsgTs: c.lastMsgTs, lastText: lastMsg ? lastMsg.text.slice(0, 80) : '', profile: c.profile });
  }
  convs.sort((a, b) => (b.lastMsgTs || 0) - (a.lastMsgTs || 0));

  const fmt        = ts => ts ? new Date(ts).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) : '—';
  const stateColor = s  => ({ new: '#94a3b8', asked_source: '#60a5fa', asked_need: '#60a5fa', qualifying: '#fbbf24', closing: '#34d399', escalated: '#f87171' }[s] || '#94a3b8');

  const rows = convs.map(c => `<tr>
    <td><strong>${c.name}</strong><br/><small>${c.phone}</small></td>
    <td><span style="background:${stateColor(c.state)};color:#000;padding:2px 8px;border-radius:4px;font-size:11px;">${c.state}</span></td>
    <td>${c.msgs}</td><td>${c.profile?.businessType||'—'}</td><td>${c.profile?.projectType||'—'}</td>
    <td>${c.profile?.budget ? '$'+c.profile.budget.toLocaleString('es-MX') : '—'}</td>
    <td><small>${fmt(c.lastMsgTs)}</small></td>
    <td><em style="color:#64748b">"${c.lastText}…"</em></td>
    <td><a href="/conv/${encodeURIComponent('whatsapp:+'+c.phone.replace(/\D/g,''))}" style="color:#60a5fa">Ver</a></td>
  </tr>`).join('');

  const transportBadge = USE_META
    ? '<span style="background:#34d399;color:#000;padding:4px 12px;border-radius:6px;font-weight:bold;">✅ Meta Cloud API — número real activo</span>'
    : '<span style="background:#fbbf24;color:#000;padding:4px 12px;border-radius:6px;font-weight:bold;">⏳ Twilio Sandbox — migración a Meta en proceso</span>';

  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8"><title>Mariana Inbox</title>
    <meta http-equiv="refresh" content="30">
    <style>
      body{font-family:-apple-system,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px;}
      h1{margin-top:0;} .stats{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap;}
      .stat{background:#1e293b;padding:16px 24px;border-radius:8px;flex:1;min-width:110px;}
      .stat .label{color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;}
      .stat .value{font-size:28px;font-weight:bold;}
      table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden;}
      th,td{padding:12px;text-align:left;border-bottom:1px solid #334155;font-size:13px;}
      th{background:#0f172a;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;}
      tr:hover{background:#293548;} a{color:#60a5fa;text-decoration:none;}
    </style></head><body>
    <h1>📨 Mariana Inbox &nbsp;<small style="color:#64748b;font-size:14px;">auto-refresh 30s</small></h1>
    <p style="margin-bottom:20px;">${transportBadge}</p>
    <div class="stats">
      <div class="stat"><div class="label">Conversaciones</div><div class="value">${convs.length}</div></div>
      <div class="stat"><div class="label">En cierre</div><div class="value">${convs.filter(c=>c.state==='closing').length}</div></div>
      <div class="stat"><div class="label">Calificando</div><div class="value">${convs.filter(c=>c.state==='qualifying').length}</div></div>
      <div class="stat"><div class="label">Escaladas</div><div class="value">${convs.filter(c=>c.state==='escalated').length}</div></div>
    </div>
    <table>
      <thead><tr><th>Cliente</th><th>Estado</th><th>Msgs</th><th>Negocio</th><th>Proyecto</th><th>Budget</th><th>Último</th><th>Preview</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" style="text-align:center;color:#64748b;padding:40px;">Sin conversaciones aún</td></tr>'}</tbody>
    </table>
    <p style="color:#64748b;font-size:11px;margin-top:16px;">
      <a href="/meta-status">meta-status</a> &nbsp;|&nbsp; <a href="/stats">stats JSON</a> &nbsp;|&nbsp; <a href="/inbox/notifs">notificaciones</a>
    </p>
  </body></html>`;
  res.type('html').send(html);
});

// ─── Background: follow-ups proactivos ───────────────────────────────────────
setInterval(async () => {
  const due = getDueJobs();
  for (const job of due) {
    try {
      if (USE_META) {
        await sendMetaMessage(job.phone, job.message);
      } else {
        await twilioClient.messages.create({ from: TWILIO_WA, to: job.phone, body: job.message });
      }
      markSent(job.id);
      console.log(`[jobs] ✅ Follow-up enviado a ${job.name}`);
    } catch (err) {
      console.error(`[jobs] ❌ Error follow-up:`, err.message);
    }
  }
}, 30 * 1000);

// ─── Boot ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🤖 MARIANA — BUILD-META-v1`);
  console.log(`   Transporte: ${USE_META ? '✅ Meta Cloud API (número real)' : '📱 Twilio Sandbox (Meta pendiente de aprobación)'}`);
  console.log(`   IA: ${AI_ENABLED ? '✅ activa' : '⚠️ sin API key'}`);
  console.log(`   Puerto: ${PORT}`);
  console.log(`   Webhook Twilio: POST /whatsapp`);
  console.log(`   Webhook Meta:   GET+POST /meta-webhook`);
  console.log(`   Meta verify:    ${META_VERIFY}`);
  console.log(`   Fer detectado si últimos 10 dígitos: ${JSON.stringify(FER_DIGITS_LIST)}`);
  console.log(`   Notifs → ${JSON.stringify(FERMIN_NOTIFY_LIST)}\n`);
});
