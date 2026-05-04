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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/webhook', require('./routes/webhook'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/financial', require('./routes/financial'));
app.use('/api/models', require('./routes/models'));

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
        // Cliente legacy sin ack: usar evento
        io.to(socketId).emit('message_response', payload.response || payload);
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
      console.log(`[Socket] Processing message from ${data.from}: "${(data.text||'').substring(0,60)}"`);
      const result = await processIncoming({
        from: data.from || 'web_user',
        text: data.text,
        channel: 'web'
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

  console.log(`\n✅ Sistema listo — 10 agentes activos\n`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
