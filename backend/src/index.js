// backend/src/index.js — Fractal MX simplificado
//
// Arranca:
//   • Servidor HTTP + Socket.io
//   • Mariana (único agente, vía WhatsApp + chat web)
//   • Workers: resources + promise
//   • Crons FIF (parrilla-fif días 1-20, parrilla-pipeline 7 fases)
//   • 1 cron de revenue (lunes 9 AM CDMX) vía RoutineManager
//   • Pipelines bajo demanda: KDP, Whop Vault
//
// Lo que fue retirado: Oracle, Megazord, Guardian, Intelligence Engine,
// 11 agentes con personalidad, AXIOM, briefings, councils, monthly reviews,
// metric snapshots, vision, qcbot, meshy, obsidian. Si vuelven, se
// reconstruyen como pipelines con outputs concretos — no como agentes.

require('dotenv').config({
  path: require('path').join(__dirname, '../.env'),
  override: true,
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { initAllAgents, processIncoming } = require('./core/orchestrator');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['polling', 'websocket'],
});

const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(require('./middleware/audit'));
app.use(express.static(require('path').join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Token, X-Webhook-Signature'
  );
  res.header('Access-Control-Expose-Headers', 'X-RateLimit-Remaining, X-RateLimit-Reset');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const { supabase } = require('./core/supabase');
  const checks = {};
  try {
    const { error } = await supabase.from('webhooks_log').select('id').limit(1);
    checks.supabase = !error ? '✅' : `❌ ${error.message}`;
  } catch (e) {
    checks.supabase = `❌ ${e.message}`;
  }
  checks.claude_api_key = process.env.ANTHROPIC_API_KEY ? '✅' : '❌ missing';
  checks.twilio = process.env.TWILIO_ACCOUNT_SID ? '✅' : '❌ missing';

  const criticalFails = ['supabase', 'claude_api_key', 'twilio'].filter(k =>
    checks[k]?.startsWith('❌')
  );
  res.status(criticalFails.length === 0 ? 200 : 503).json({
    status: criticalFails.length === 0 ? 'healthy' : 'degraded',
    checks,
    critical_failures: criticalFails.length,
    timestamp: new Date().toISOString(),
    version: 'v7.0-simple',
  });
});

// ─── Routes (sobrevivientes) ─────────────────────────────────────────────────
app.use('/webhook', require('./routes/webhook'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/financial', require('./routes/financial'));
app.use('/api/models', require('./routes/models'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/verification', require('./routes/verification'));
app.use('/api/features', require('./routes/features'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/creative', require('./routes/creative'));
app.use('/api', require('./routes/public-api'));
app.use('/webhooks', require('./routes/webhooks'));

// ─── Pipelines on-demand ─────────────────────────────────────────────────────
// KDP: nicho → PDF (libro low-content Amazon KDP-ready)
app.post('/api/pipelines/kdp', async (req, res) => {
  try {
    const { runKdp } = require('./pipelines/kdp');
    const { niche, title, pages } = req.body || {};
    if (!niche) return res.status(400).json({ error: 'niche required' });
    const result = await runKdp({ niche, title, pages });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[KDP]', err);
    res.status(500).json({ error: err.message });
  }
});

// Whop Vault: tema → videos 16:9
app.post('/api/pipelines/whop-vault', async (req, res) => {
  try {
    const { runWhopVault } = require('./pipelines/whop-vault');
    const { topic, count } = req.body || {};
    if (!topic) return res.status(400).json({ error: 'topic required' });
    const result = await runWhopVault({ topic, count });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[WhopVault]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Root ─────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'Fractal MX',
    version: 'v7.0-simple',
    status: 'online',
    agent: 'mariana',
    pipelines: ['kdp', 'whop-vault', 'parrilla-fif', 'parrilla-pipeline'],
    crons: ['weekly-revenue (Mon 9AM CDMX)', 'parrilla-fif', 'parrilla-pipeline'],
    endpoints: {
      health: 'GET /api/health',
      webhook_twilio: 'POST /webhook/twilio',
      webhook_meta: 'POST /webhook/meta',
      kdp: 'POST /api/pipelines/kdp { niche, title?, pages? }',
      whop_vault: 'POST /api/pipelines/whop-vault { topic, count? }',
    },
  });
});

// ─── Socket.io (chat web) ────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[Socket] connected: ${socket.id}`);
  socket.on('send_message', async (data, ack) => {
    const respond = payload => {
      if (typeof ack === 'function') ack({ ok: true, ...payload });
      else io.to(socket.id).emit('message_response', { response: payload.response || payload });
    };
    const respondError = msg => {
      if (typeof ack === 'function') ack({ ok: false, error: msg });
      else io.to(socket.id).emit('mariana_error', { message: msg });
    };
    try {
      const result = await processIncoming({
        from: data.from || 'web_neiky',
        text: data.text,
        channel: 'web',
      });
      respond({ response: result });
    } catch (err) {
      console.error('[Socket]', err.message);
      respondError(err.message);
    }
  });
  socket.on('disconnect', reason => console.log(`[Socket] disconnected: ${socket.id} — ${reason}`));
});

global.io = io;

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, async () => {
  console.log(`\n🌸 Fractal MX v7.0-simple`);
  console.log(`📡 http://localhost:${PORT}`);

  // 1. Mariana
  await initAllAgents(io);

  // 2. Workers críticos (solo los que entregan output concreto)
  try {
    require('./workers/resources.worker').startResourcesWorker();
    require('./workers/promise.worker').startPromiseWorker();
    console.log('✅ Workers: resources + promise');
  } catch (err) {
    console.error('[workers] init error:', err.message);
  }

  // 3. Crons FIF (parrilla días 1-20 + pipeline 7 fases)
  try {
    require('./routines/parrilla-fif').startParrillaFIFCrons();
    console.log('✅ Parrilla FIF (días 1-20) activa');
  } catch (err) {
    console.warn('[parrilla-fif]', err.message);
  }
  try {
    require('./routines/parrilla-pipeline').startParrillaPipelineCrons();
    console.log('✅ Parrilla Pipeline (7 fases) activa');
  } catch (err) {
    console.warn('[parrilla-pipeline]', err.message);
  }

  // 4. RoutineManager → 1 cron de revenue (lunes 9 AM)
  try {
    const RoutineManager = require('./routines');
    global.routines = new RoutineManager();
    global.routines.initialize();
  } catch (err) {
    console.error('[routines]', err.message);
  }

  console.log('\n✅ Sistema arriba. Mariana lista. 1 cron de revenue programado.');
});
