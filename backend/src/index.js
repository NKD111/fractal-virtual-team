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
app.use('/api/payments', require('./routes/payments'));
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
app.use('/api/projects', require('./routes/projects'));
app.use('/api/axiom', require('./routes/axiom'));
app.use('/api/qcbot', require('./routes/qcbot'));
app.use('/api/creative', require('./routes/creative'));
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
    agents: ['mariana', 'diana', 'alex', 'carlos', 'sofia', 'lucas', 'diego', 'max', 'valentina', 'roberto', 'qcbot', 'nexus'],
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

    // WorkflowManager — Supabase Realtime listeners para video/branding/social
    try {
      const WorkflowManager = require('./services/workflow-manager');
      global.workflowManager = new WorkflowManager();
      await global.workflowManager.initialize();
      console.log('✅ WorkflowManager: iniciado (video/branding/social/web/print)');
    } catch (wfErr) {
      console.warn('[WorkflowManager] init error (non-fatal):', wfErr.message);
    }

    // Boot AXIOM scan + start 6h cron
    try {
      const { runAxiomScan } = require('./routines/axiom-scanner');
      runAxiomScan().then(r => console.log(`✅ AXIOM boot scan: ${r.inserted} oportunidades insertadas`))
        .catch(e => console.warn('[AXIOM] boot scan error:', e.message));
      // Register 6h cron (single instance — routines/index.js no longer does this)
      const cron = require('node-cron');
      cron.schedule('0 */6 * * *', () => runAxiomScan().catch(e => console.error('[AXIOM] cron err:', e.message)), { timezone: 'America/Mexico_City' });
      console.log('✅ AXIOM cron: cada 6h (00,06,12,18 CDMX)');
    } catch (e) {
      console.warn('[AXIOM] boot/cron init error:', e.message);
    }

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
                        'diego', 'max', 'valentina', 'roberto', 'qcbot', 'nexus'];
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
    // NEXUS también disponible como global.nexus (alias limpio)
    if (global['nexus']) global.nexus = global['nexus'];
    console.log('🧠 FASE 8.5: 12 agentes globales con contexto de negocio (incl. NEXUS)');
  } catch (err) {
    console.error('[Fase 8.5] context injection error:', err.message);
  }

  // ─── FASE 9: Departamento Creativo FIF ──────────────────────────────────────
  try {
    const { startParrillaFIFCrons } = require('./routines/parrilla-fif');
    startParrillaFIFCrons();
    console.log('✅ FASE 9: Departamento Creativo FIF activo (parrilla crons + /api/creative)');
  } catch (err) {
    console.warn('[Fase 9] init error (non-fatal):', err.message);
  }

  // ─── BLOQUE F: Pipeline Editorial FIF (7 fases) ──────────────────────────
  try {
    const { startParrillaPipelineCrons } = require('./routines/parrilla-pipeline');
    startParrillaPipelineCrons();
    console.log('✅ BLOQUE F: Pipeline Editorial FIF activo (7 fases — días 1,5,7,10,17,20)');
  } catch (err) {
    console.warn('[Bloque F] init error (non-fatal):', err.message);
  }

  // ─── BLOQUES I-R: Business OS v3.0 ─────────────────────────────────────────
  const cron = require('node-cron');

  // BLOQUE M — Oracle Auto-Improvement (domingo 3 AM CDMX)
  try {
    const { oracleAutoImprovement } = require('./routines/oracle-improvement');
    cron.schedule('0 3 * * 0', () => oracleAutoImprovement().catch(e => console.error('[Oracle] cron err:', e.message)), { timezone: 'America/Mexico_City' });
    console.log('✅ BLOQUE M: Oracle Auto-Improvement activo (domingo 3 AM CDMX)');
  } catch (err) {
    console.warn('[Bloque M] init error (non-fatal):', err.message);
  }

  // BLOQUE N — YouTube Weekly Content (lunes y jueves 9 AM CDMX)
  try {
    const { generateWeeklyVideos } = require('./pipelines/youtube-content');
    cron.schedule('0 9 * * 1,4', () => generateWeeklyVideos().catch(e => console.error('[YouTube] cron err:', e.message)), { timezone: 'America/Mexico_City' });
    console.log('✅ BLOQUE N: YouTube content cron activo (lun+jue 9 AM CDMX)');
  } catch (err) {
    console.warn('[Bloque N] init error (non-fatal):', err.message);
  }

  // BLOQUE K — N8N Revenue Alert (día 20 al mediodía CDMX)
  try {
    const { checkRevenueAlert } = require('./pipelines/n8n-workflows');
    cron.schedule('0 12 20 * *', () => checkRevenueAlert().catch(e => console.error('[N8N] revenue alert err:', e.message)), { timezone: 'America/Mexico_City' });
    console.log('✅ BLOQUE K: N8N Revenue Alert activo (día 20 mediodía CDMX)');
  } catch (err) {
    console.warn('[Bloque K] init error (non-fatal):', err.message);
  }

  // BLOQUE L — Revenue Streams: Flujos de ingreso autónomo
  // Flujo 1: FIF ($1,000 USD/mes) — pipeline BLOQUE F ya activo
  // Flujo 2: Auditoría Digital ($300-800 USD) — disponible en /api/services/auditoria
  // Flujo 3: Productos Digitales (pasivo $37-97 USD) — pipeline BLOQUE J
  // Flujo 4: Landing Cinematográfica ($1,500-3,000 USD) — servicio BLOQUE O
  // AXIOM → Mariana → NKD cierra → sistema produce (automatizado)

  // Register new services routes
  try {
    // Expose auditoría and landing as API endpoints
    app.post('/api/services/auditoria', async (req, res) => {
      try {
        const { generarAuditoria } = require('./services/auditoria-digital');
        const { empresa_url, tipo, industria, ciudad } = req.body;
        if (!empresa_url) return res.status(400).json({ error: 'empresa_url requerido' });
        const result = await generarAuditoria(empresa_url, { tipo, industria, ciudad });
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/services/landing', async (req, res) => {
      try {
        const { crearLanding } = require('./services/landing-cinematografica');
        const { cliente_data, tipo } = req.body;
        if (!cliente_data?.empresa) return res.status(400).json({ error: 'cliente_data.empresa requerido' });
        const result = await crearLanding(cliente_data, tipo);
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/products/launch', async (req, res) => {
      try {
        const { launchProducto } = require('./pipelines/digital-product-launch');
        const { productoId } = req.body;
        if (!productoId) return res.status(400).json({ error: 'productoId requerido' });
        const result = await launchProducto(productoId);
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    console.log('✅ BLOQUE L: 4 flujos de ingreso registrados (FIF+Auditoría+Productos+Landing)');
  } catch (err) {
    console.warn('[Bloque L] init error (non-fatal):', err.message);
  }

  // ─── BLOQUE S — Google Drive Delivery Pipeline ────────────────────────────
  try {
    const { fase7b_llenarTablasTrigger } = require('./routines/parrilla-pipeline');
    const { verificarConexionDrive } = require('./services/google-drive-delivery');

    // POST /api/parrilla/llenar-tablas — NKD dispara cuando está lista la presentación
    app.post('/api/parrilla/llenar-tablas', async (req, res) => {
      try {
        const mes = req.body.mes || new Date().toISOString().substring(0, 7);
        const presentationId = req.body.presentationId || null;
        const result = await fase7b_llenarTablasTrigger(mes, presentationId);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/parrilla/drive-status — verifica conexión Drive
    app.get('/api/parrilla/drive-status', async (req, res) => {
      try {
        const status = await verificarConexionDrive();
        res.json(status);
      } catch (err) {
        res.status(500).json({ connected: false, error: err.message });
      }
    });

    console.log('✅ BLOQUE S: Drive delivery pipeline activo (POST /api/parrilla/llenar-tablas + GET /drive-status)');
  } catch (err) {
    console.warn('[Bloque S] init error (non-fatal):', err.message);
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

  console.log(`\n✅ Fractal MX — Business OS v3.0 listo`);
  console.log(`   Agentes: 14 activos (+ AXIOM + ORACLE)`);
  console.log(`   Bloques: A-S completados`);
  console.log(`   Crons: Oracle (dom 3AM) + YouTube (lun+jue) + Revenue Alert (día 20) + AXIOM (6h) + Parrilla FIF (7 fases)`);
  console.log(`   Flujos de ingreso: FIF($1k/mes) + Auditoría($300-800) + Productos digitales + Landing($1.5-3k)`);
  console.log(`   Brand Guide FIF/EFG: activo en CARLOS, DIEGO, ALEX, VALENTINA, NEXUS\n`);

  // Cleanup on shutdown
  process.on('SIGTERM', async () => {
    try { await global.visionService?.shutdown(); } catch (_) {}
  });
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
