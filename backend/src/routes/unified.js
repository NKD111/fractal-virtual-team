// backend/src/routes/unified.js
// Fase 7 — Unified Context API endpoints

const express = require('express');
const router = express.Router();
const { getUCM } = require('../unified-context/UnifiedContextManager');
const { supabase } = require('../core/supabase');

const ucm = getUCM();
global.ucm = ucm;

// POST /api/unified-message  { channel, identifier, message, agentName? }
router.post('/unified-message', async (req, res) => {
  try {
    const { channel = 'web', identifier, message, agentName = 'mariana' } = req.body || {};
    if (!identifier) return res.status(400).json({ error: 'identifier required' });
    if (!message) return res.status(400).json({ error: 'message required' });
    const result = await ucm.processMessage({ channel, identifier, message, agentName });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/:userId/:agentName
// Strict filter: ONLY messages tagged with this exact agent. Each agent
// keeps its own independent thread per user (no cross-agent leakage).
router.get('/conversations/:userId/:agentName', async (req, res) => {
  try {
    const { userId, agentName } = req.params;
    const { data: messages } = await supabase
      .from('messages')
      .select('id, role, content, agent_name, source_channel, created_at')
      .eq('user_id', userId)
      .eq('agent_name', agentName)
      .order('created_at', { ascending: true })
      .limit(100);
    res.json({ messages: messages || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/me?session=...  — get-or-create web session user
router.get('/users/me', async (req, res) => {
  try {
    const session = req.query.session || `anon-${Date.now()}`;
    const user = await ucm.identifyUser({ channel: 'web', identifier: session });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/standup/run — manual trigger for the daily standup orchestrator.
// Used to verify the full pipeline works (agents report → Mariana synthesizes
// → WhatsApp arrives at +525534189583 → Office View shows chat bubbles).
router.post('/standup/run', async (req, res) => {
  try {
    const DailyStandup = require('../routines/daily-standup');
    const result = await DailyStandup.run();
    res.json({
      success: true,
      message: 'Standup ejecutado',
      whatsapp_sent: result.whatsapp_sent,
      summary: result.summary,
      standups: result.standups
    });
  } catch (err) {
    console.error('Standup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/evolving-chat/run — el equipo brainstormea CRECIMIENTO de la
// empresa cambiando de tema cada N réplicas. Cada tema cierra con conclusión
// accionable ("X hará Y para Z fecha"). Mariana modera, Sofia trackea al final.
router.post('/evolving-chat/run', async (req, res) => {
  try {
    const topicCount = Math.max(1, Math.min(7, parseInt(req.body?.topics, 10) || 3));
    const repliesPerTopic = Math.max(3, Math.min(12, parseInt(req.body?.repliesPerTopic, 10) || 7));
    const gapMs = Math.max(3000, Math.min(15000, parseInt(req.body?.gapMs, 10) || 8000));
    const betweenTopicMs = Math.max(5000, Math.min(30000, parseInt(req.body?.betweenTopicMs, 10) || 14000));
    const { runEvolvingChat } = require('../routines/evolving-chat');
    runEvolvingChat({ topicCount, repliesPerTopic, gapMs, betweenTopicMs })
      .catch(err => console.error('evolving-chat:', err.message));
    const linesPerTopic = 1 + repliesPerTopic + 1;
    const totalLines = topicCount * linesPerTopic + 2;
    const estSec = (totalLines * gapMs + (topicCount - 1) * betweenTopicMs) / 1000;
    res.json({
      started: true,
      topics: topicCount, repliesPerTopic, gapMs, betweenTopicMs,
      total_lines: totalLines,
      estimated_duration_sec: Math.round(estSec),
      hint: 'Conversación evolutiva: cambian de tema cada cierto rato, cada tema cierra con conclusión accionable.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/creative-jam/run — multi-agent collaboration para identidad 2027.
// 5 creativos brainstormean, Valentina sintetiza 2 propuestas, Diego genera
// imágenes IA, Sofia revisa viabilidad, Mariana aprueba, email final con TODO.
router.post('/creative-jam/run', async (req, res) => {
  try {
    const gapMs = Math.max(3000, Math.min(15000, parseInt(req.body?.gapMs, 10) || 7000));
    const userEmail = String(req.body?.email || 'nakedgeometry19@gmail.com').trim();
    const { runCreativeJam } = require('../routines/creative-jam');
    runCreativeJam({ userEmail, gapMs }).catch(err => console.error('creative-jam:', err.message));
    const estSec = (5 + 3 + 1 + 2 + 2 + 1) * gapMs / 1000 + 60; // ~brainstorm + sintesis + imágenes
    res.json({
      started: true,
      gapMs,
      email_target: userEmail,
      estimated_duration_sec: Math.round(estSec),
      hint: 'Abre el Office View — verás a los 5 creativos rebotando ideas y luego Valentina cierra. Email final llega cuando termina.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/task/dispatch — pipeline visual de tarea
//   1. Mariana clasifica (qué agente)
//   2. Emite eventos para que el Office View anime una bolita
//   3. Agente narra avances vía chat_bubble
//   4. Supervisor revisa
//   5. Email final al usuario (Resend)
// Body: { message: string, email?: string }
router.post('/task/dispatch', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'message required' });
    const userEmail = String(req.body?.email || 'nakedgeometry19@gmail.com').trim();
    const { runTask } = require('../routines/task-runner');
    // Fire-and-forget; el frontend escucha vía socket
    runTask({ message, userEmail }).catch(err => console.error('task:', err.message));
    res.json({ accepted: true, message: message.slice(0, 60) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/group-chat/run — conversación grupal con HILO coherente.
// Un agente arranca un tema, los demás van encadenando respuestas (Claude
// lee el transcript de la charla y genera réplicas conectadas).
//
// Body:
//   topics?: número de temas (default 2)
//   repliesPerTopic?: respuestas por tema después del kicker (default 8)
//   gapMs?: tiempo entre líneas (default 8000)
//   theme?: tema forzado en texto libre, ej "series de anime"
router.post('/group-chat/run', async (req, res) => {
  try {
    const topics = Math.max(1, Math.min(5, parseInt(req.body?.topics, 10) || 2));
    const repliesPerTopic = Math.max(3, Math.min(20, parseInt(req.body?.repliesPerTopic, 10) || 8));
    const gapMs = Math.max(3000, Math.min(15000, parseInt(req.body?.gapMs, 10) || 8000));
    const theme = req.body?.theme ? String(req.body.theme).trim() : null;
    const { runGroupChat } = require('../routines/group-chat');
    runGroupChat({ topics, repliesPerTopic, gapMs, theme }).catch(err => console.error('group-chat:', err.message));
    const totalLines = topics * (1 + repliesPerTopic);
    const estSec = (totalLines * gapMs + topics * gapMs * 1.5) / 1000;
    res.json({
      started: true,
      topics, repliesPerTopic, gapMs, theme,
      total_lines: totalLines,
      estimated_duration_sec: Math.round(estSec),
      hint: 'Abre el Office View — verás un agente arrancar el hilo y los demás encadenarse.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/intro-chat/run — los 11 agentes se presentan, hablan de gustos y
// reaccionan entre sí durante ~5 min. Cada línea se broadcastea como
// chat_bubble al Office View. Devuelve inmediatamente; corre en background.
router.post('/intro-chat/run', async (req, res) => {
  try {
    const rounds = Math.max(1, Math.min(4, parseInt(req.body?.rounds, 10) || 4));
    const gapMs = Math.max(3000, Math.min(15000, parseInt(req.body?.gapMs, 10) || 8000));
    const { runIntroChat } = require('../routines/intro-chat');
    // Fire-and-forget so the HTTP request returns fast
    runIntroChat({ rounds, gapMs }).catch(err => console.error('intro-chat:', err.message));
    const estSeconds = (rounds * 11 * gapMs) / 1000;
    res.json({
      started: true,
      rounds, gapMs,
      agents: 11,
      estimated_duration_sec: Math.round(estSeconds),
      hint: 'Abre el Office View ahora — verás bubbles flotando arriba de cada agente.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mariana/notify — Mariana envía un WhatsApp directo a Neiky.
// Body: { message?: string }. Si no hay message, manda un recordatorio default.
// Devuelve diagnostic completo para saber qué canal entregó.
router.post('/mariana/notify', async (req, res) => {
  try {
    const customMsg = String(req.body?.message || '').trim();
    const message = customMsg ||
      `🔔 Hola Neiky! Recordatorio rápido:\n\n` +
      `• Revisa las cotizaciones pendientes que vencen esta semana\n` +
      `• Confirma con Diana los precios para que pueda enviar propuestas\n` +
      `• Roberto necesita cerrar el flujo de caja del mes\n\n` +
      `Aquí estoy si necesitas algo. — Mariana 🤖`;

    const phone = process.env.NEIKY_WHATSAPP || '+525534189583';
    const { sendMetaMessage, sendTwilioMessage } = require('../core/whatsapp');
    const diag = { phone, channels: {} };

    try {
      const r = await sendMetaMessage(phone, message);
      diag.channels.meta = { ok: true, response: r };
    } catch (e) {
      diag.channels.meta = { ok: false, error: e.message, details: e.response?.data || null };
    }

    try {
      const r = await sendTwilioMessage(phone, message);
      diag.channels.twilio = { ok: true, sid: r?.sid, status: r?.status, to: r?.to };
    } catch (e) {
      diag.channels.twilio = { ok: false, error: e.message, code: e.code || null, more: e.moreInfo || null };
    }

    const sent = diag.channels.meta?.ok || diag.channels.twilio?.ok;
    res.json({ sent, message_preview: message.slice(0, 120), diagnostic: diag });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:slug/pendings — what's on this agent's plate right now
router.get('/agents/:slug/pendings', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    // Promises owned by this agent OR delegated TO this agent
    const { data: ownPromises } = await supabase
      .from('pending_promises')
      .select('id, promise_text, action_type, action_target, execute_at, user_phone, status')
      .eq('status', 'pending')
      .or(`agent_id.eq.${slug},action_target.eq.${slug}`)
      .order('execute_at', { ascending: true })
      .limit(8);

    // Recent activity from system_events (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: events } = await supabase
      .from('system_events')
      .select('event_type, details, started_at')
      .or(`details->>agent.eq.${slug},details->>agent.eq.${slug.toUpperCase()}`)
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(5);

    // Latest standup line from daily_context
    const today = new Date().toISOString().slice(0, 10);
    const { data: ctxRow } = await supabase
      .from('daily_context')
      .select('reports')
      .eq('context_date', today)
      .maybeSingle();
    const standupLine = ctxRow?.reports?.[slug] || ctxRow?.reports?.[slug.toUpperCase()] || null;

    res.json({
      slug,
      standup_today: standupLine,
      promises: ownPromises || [],
      recent_events: events || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/standup/latest — last standup events from the log
router.get('/standup/latest', async (req, res) => {
  try {
    const { data } = await supabase
      .from('system_events')
      .select('event_type, details, started_at')
      .in('event_type', ['agent_standup', 'daily_summary'])
      .order('started_at', { ascending: false })
      .limit(20);
    res.json({ events: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/unified/status — for verification
router.get('/status', async (req, res) => {
  try {
    const { data: usersCount } = await supabase.from('users').select('id', { head: true, count: 'exact' });
    res.json({
      ok: true,
      ucm_initialized: !!global.ucm,
      io_connected: !!global.io,
      users_count: usersCount?.length ?? 'n/a'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
