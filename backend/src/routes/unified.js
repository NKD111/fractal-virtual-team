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

// POST /api/task/:id/confirm — confirma el pitch para arrancar la entrega final
//   body opcional: { feedback: string }
router.post('/task/:id/confirm', async (req, res) => {
  try {
    const taskId = String(req.params.id);
    const feedback = String(req.body?.feedback || '').trim();
    const { resumeTask } = require('../routines/task-runner');
    // fire-and-forget — el frontend ya escucha eventos
    resumeTask({ taskId, feedback, source: 'web-confirm' })
      .catch(err => console.error('resumeTask:', err.message));
    res.json({ accepted: true, taskId, feedback_len: feedback.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/task/:id/confirm-page — pequeña UI de confirmación (link del email)
router.get('/task/:id/confirm-page', async (req, res) => {
  const taskId = String(req.params.id);
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Confirmar tarea</title>
<style>body{font-family:system-ui,sans-serif;background:#0a0a14;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}
.box{background:#fff;color:#1a1a14;border-radius:12px;padding:32px;max-width:520px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,0.5);}
h1{color:#B14FFF;margin:0 0 8px;font-size:22px;}
textarea{width:100%;min-height:120px;padding:12px;border:2px solid #ddd;border-radius:8px;font-family:inherit;font-size:14px;resize:vertical;box-sizing:border-box;}
button{background:#B14FFF;color:#fff;border:none;padding:12px 28px;border-radius:24px;font-size:14px;font-weight:600;cursor:pointer;margin-top:12px;}
button:hover{background:#9333ea;}
.ok{background:#dcfce7;border:1px solid #16a34a;color:#15803d;padding:14px;border-radius:8px;margin-top:14px;display:none;}
</style></head>
<body><div class="box">
<h1>Confirmar entrega</h1>
<p style="color:#666;font-size:13px;">Task <code>${taskId}</code></p>
<p>Escribe tu OK / ajustes / preguntas. Si dejas vacío, el agente arranca con el plan tal cual lo propuso.</p>
<textarea id="fb" placeholder="OK adelante / cámbialo así / agrega esto…"></textarea>
<button id="go">Confirmar y arrancar entrega →</button>
<div class="ok" id="ok">✅ Recibido. El agente está trabajando — recibirás el correo final en unos minutos.</div>
<script>
document.getElementById('go').addEventListener('click', async () => {
  const fb = document.getElementById('fb').value;
  const r = await fetch('/api/task/${taskId}/confirm', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ feedback: fb })
  });
  if (r.ok) document.getElementById('ok').style.display = 'block';
  else alert('Error: ' + (await r.text()));
});
</script></div></body></html>`;
  res.set('Content-Type', 'text/html').send(html);
});

// GET /api/inbox — agregado de TODO lo que requiere atención del usuario
//   - tareas en awaiting_confirmation
//   - promesas que vencen hoy o ya vencieron
//   - alertas de NEXUS (financial / system)
//   - ultimas 3 reviews de QC con score < 7
router.get('/inbox', async (req, res) => {
  try {
    const now = new Date();
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const [tasksAw, promisesDue, qcFails, recentEvents] = await Promise.allSettled([
      supabase.from('tasks').select('id,brief,agent_assigned,created_at,user_email').eq('status', 'awaiting_confirmation').order('created_at', { ascending: false }).limit(8),
      supabase.from('pending_promises').select('id,promise_text,execute_at,user_phone,agent_id').eq('status', 'pending').lte('execute_at', todayEnd.toISOString()).order('execute_at').limit(10),
      supabase.from('qc_reviews').select('task_id,agent,score,issues,ts').lt('score', 7).order('ts', { ascending: false }).limit(5),
      supabase.from('system_events').select('event_type,severity,details,started_at').in('severity', ['warning','error','critical']).order('started_at', { ascending: false }).limit(5)
    ]);

    res.json({
      tasks_awaiting:  tasksAw.value?.data || [],
      promises_due:    promisesDue.value?.data || [],
      qc_failures:     qcFails.value?.data || [],
      alerts:          recentEvents.value?.data || [],
      generated_at:    now.toISOString()
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cost/today — gasto de IA + email + WA del día
router.get('/cost/today', async (req, res) => {
  try {
    const { getCostsToday, getCostsMonth } = require('../core/telemetry');
    const today = await getCostsToday();
    const month = await getCostsMonth();
    res.json({ today, month });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/voice/transcribe — Whisper STT del audio del input voz
//   body: { audio_base64: string, mime?: string }
//   o multipart 'audio' field
router.post('/voice/transcribe', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'OPENAI_API_KEY no configurada' });
    }
    const audioB64 = req.body?.audio_base64;
    if (!audioB64) return res.status(400).json({ error: 'audio_base64 required' });
    const mime = req.body?.mime || 'audio/webm';
    const buf = Buffer.from(audioB64, 'base64');
    const FormData = require('form-data');
    const axios = require('axios');
    const form = new FormData();
    form.append('file', buf, { filename: 'audio.webm', contentType: mime });
    form.append('model', 'whisper-1');
    form.append('language', 'es');
    const r = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      maxBodyLength: Infinity, maxContentLength: Infinity, timeout: 30000
    });
    res.json({ text: r.data?.text || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks — lista de tareas con su status y entregables (cumplidas vs prometidas)
router.get('/tasks', async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query?.limit, 10) || 20);
    const { data } = await supabase
      .from('tasks')
      .select('id, source, message, brief, agent_assigned, supervisor, status, promised, delivered, image_url, email_id, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    res.json({ tasks: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
