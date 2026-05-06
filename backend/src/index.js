require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { initAllAgents } = require('./core/orchestrator');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,    // 60s — da tiempo al AI processing en Railway
  pingInterval: 25000,   // 25s ping normal
  transports: ['polling', 'websocket'],
});

const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));     // audio base64 puede pesar
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Audit log middleware — captura todas las requests importantes
const auditMiddleware = require('./middleware/audit');
app.use(auditMiddleware);

// Servir el widget embebible y otros assets públicos
app.use(express.static(require('path').join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token, X-Webhook-Signature');
  res.header('Access-Control-Expose-Headers', 'X-RateLimit-Remaining, X-RateLimit-Reset');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/webhook', require('./routes/webhook'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/financial', require('./routes/financial'));
app.use('/api/models', require('./routes/models'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/guardian', require('./routes/guardian'));
app.use('/api/oracle', require('./routes/oracle'));
app.use('/api/verification', require('./routes/verification'));
app.use('/api/features', require('./routes/features'));
app.use('/api/vision', require('./routes/vision'));
app.use('/api/meshy', require('./routes/meshy'));
app.use('/api', require('./routes/unified'));
app.use('/api', require('./routes/public-api'));   // /api/admin/keys + /api/v1/*
app.use('/webhooks', require('./routes/webhooks'));

// MEGAZORD status endpoint
app.get('/api/megazord/status', async (req, res) => {
  try {
    if (!global.megazord) return res.json({ initialized: false });
    const status = await global.megazord.getOrganismStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'Fractal Virtual Team v4.2',
    status: 'online',
    agents: ['mariana', 'diana', 'alex', 'carlos', 'sofia', 'lucas', 'diego', 'max', 'valentina', 'roberto', 'qcbot'],
    endpoints: {
      webhook_meta: 'POST /webhook/meta',
      webhook_twilio: 'POST /webhook/twilio',
      webhook_gmail: 'POST /webhook/gmail',
      agents: 'GET /api/agents',
      dashboard: 'GET /api/dashboard',
      health: 'GET /webhook/health',
      models: 'GET /api/models/status',
      classify: 'POST /api/models/classify'
    }
  });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('send_message', async (data, ackCallback) => {
    // Capturar socketId antes del async — si hay reconnect, aún podemos emitir
    const socketId = socket.id;
    const respond = (payload) => {
      if (typeof ackCallback === 'function') {
        // Cliente moderno: usa ack (garantizado, no duplicar con event)
        ackCallback({ ok: true, ...payload });
      } else {
        // Cliente legacy sin ack: usar evento (siempre enviar objeto { response })
        io.to(socketId).emit('message_response', { response: payload.response || payload });
      }
    };
    const respondError = (msg) => {
      if (typeof ackCallback === 'function') {
        ackCallback({ ok: false, error: msg });
      } else {
        io.to(socketId).emit('mariana_error', { message: msg });
      }
    };

    try {
      const { processIncoming } = require('./core/orchestrator');
      // web_neiky = Neiky en dashboard → siempre identificado correctamente
      const fromId = data.from || 'web_neiky';
      console.log(`[Socket] Processing message from ${fromId}: "${(data.text||'').substring(0,60)}"`);
      const result = await processIncoming({
        from: fromId,
        text: data.text,
        channel: 'web',
        agentSlug: data.agentSlug // respeta agente seleccionado en dashboard
      });
      console.log(`[Socket] Response ready for ${socketId}: "${String(result).substring(0,60)}"`);
      respond({ response: result });
    } catch (err) {
      console.error(`[Socket] Error processing message:`, err.message);
      respondError(err.message);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Client disconnected: ${socket.id} — ${reason}`);
  });
});

global.io = io;

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, async () => {
  console.log(`\n🌸 Fractal Virtual Team v4.2`);
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🔗 Webhook Meta: POST /webhook/meta`);
  console.log(`🔗 Webhook Twilio: POST /webhook/twilio`);

  await initAllAgents(io);

  // Start resources worker (checks Gmail for client assets every 5 min)
  const { startResourcesWorker } = require('./workers/resources.worker');
  startResourcesWorker();

  // Start promise worker (ejecuta promesas de Mariana cuando vence el tiempo)
  const { startPromiseWorker } = require('./workers/promise.worker');
  startPromiseWorker();

  // Start proactive scheduler (check-ins, follow-ups, alertas proactivas)
  const { startProactiveScheduler } = require('./core/proactive-scheduler');
  startProactiveScheduler();

  // Start proactive BullMQ worker (si hay Redis disponible)
  const { startProactiveWorker } = require('./workers/proactive.worker');
  startProactiveWorker();

  // Initialize Intelligence Engine (sistemas 4-10)
  const intelligenceEngine = require('./core/intelligence-engine');
  intelligenceEngine.initialize();
  global.intelligenceEngine = intelligenceEngine;

  // ─── MEGAZORD: Sistema Nervioso Colectivo (Fase 5) ──────────────────────────
  const { getMegazord } = require('./core/megazord-orchestrator');
  const megazord = getMegazord();
  await megazord.initialize();
  global.megazord = megazord;

  // ─── SYSTEM GUARDIAN: NEXUS + ATLAS (Fase 5.5) ──────────────────────────────
  const { getGuardian } = require('./core/system-guardian');
  const guardian = getGuardian();
  await guardian.initialize();
  global.guardian = guardian;

  // ─── ORACLE: Sistema de Inteligencia Compartida (Fase 5.7) ──────────────────
  const { getOracle } = require('./oracle/oracle');
  const oracle = getOracle();
  await oracle.initialize();
  global.oracle = oracle;

  // ─── VISION LAYER (Fase 6.5) ────────────────────────────────────────────────
  try {
    const { getVisionService } = require('./vision/vision-service');
    const vision = getVisionService();
    await vision.initialize();
    global.visionService = vision;
  } catch (err) {
    console.warn('[Vision] init error (non-fatal):', err.message);
  }

  // ─── FASE 6: 22 Features ────────────────────────────────────────────────────
  try {
    global.briefGenerator = new (require('./features/brief-generator'))();
    global.quoteBuilder = new (require('./features/quote-builder'))();
    global.projectTracker = new (require('./features/project-tracker'))();
    global.clientHealth = new (require('./features/client-health'))();
    global.deliveryChecklist = new (require('./features/delivery-checklist'))();
    global.revisionTracker = new (require('./features/revision-tracker'))();
    global.qcBot = new (require('./features/qc-bot'))();
    global.notifications = new (require('./features/smart-notifications'))();

    // Routines (cron) — initialized last
    const RoutineManager = require('./routines');
    global.routines = new RoutineManager();
    global.routines.initialize();

    console.log('✅ FASE 6: 22 features + 6 routines activos');
  } catch (err) {
    console.error('[Fase 6] init error:', err.message);
  }

  // Fase 8.5 — eager-load each agent, register as global, inject business context.
  // Without eager load, getAgent() instantiates lazily on first message and
  // baseContext is never injected. With eager + global.X registration, the
  // spec's "global[agentName].baseContext" pattern works.
  try {
    const { getAgent } = require('./core/orchestrator');
    const agentContext = require('./agents/agent-context');
    const agentNames = ['mariana', 'diana', 'carlos', 'alex', 'sofia', 'lucas',
                        'diego', 'max', 'valentina', 'roberto', 'qcbot'];
    for (const name of agentNames) {
      try {
        const inst = getAgent(name);
        if (inst) {
          global[name] = inst;
          const ctx = await agentContext.buildContext(name);
          inst.baseContext = ctx;
          console.log(`  ✓ ${name.toUpperCase()} eager + contexto (${ctx.length} chars)`);
        }
      } catch (e) {
        console.warn(`  ✗ ${name}: ${e.message}`);
      }
    }
    console.log('🧠 FASE 8.5: 11 agentes globales con contexto de negocio');
  } catch (err) {
    console.error('[Fase 8.5] context injection error:', err.message);
  }

  // Start response tracker reminder checker (cada 15 min)
  const responseTracker = require('./core/response-tracker');
  setInterval(async () => {
    try {
      await responseTracker.checkPendingReminders();
    } catch (err) {
      console.error('[ResponseTracker] Reminder check error:', err.message);
    }
  }, 15 * 60 * 1000);

  console.log(`\n✅ Sistema listo — 11 agentes activos + promise tracker + proactive scheduler + response tracker + intelligence engine (10 sistemas) + MEGAZORD (7 sistemas) + NEXUS + ATLAS (Guardian 24/7) + ORACLE (Inteligencia Compartida) + FASE 6 (22 features + 6 routines) + VISION LAYER (Fase 6.5)\n`);

  // Cleanup on shutdown
  process.on('SIGTERM', async () => {
    try { await global.visionService?.shutdown(); } catch (_) {}
  });
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
