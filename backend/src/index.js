require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { initAllAgents } = require('./core/orchestrator');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
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

app.get('/', (req, res) => {
  res.json({
    name: 'Fractal Virtual Team v4.2',
    status: 'online',
    agents: ['mariana', 'diana', 'alex', 'carlos', 'sofia', 'lucas', 'diego', 'max', 'valentina', 'roberto', 'qcbot'],
    endpoints: {
      webhook_meta: 'POST /webhook/meta',
      webhook_twilio: 'POST /webhook/twilio',
      agents: 'GET /api/agents',
      dashboard: 'GET /api/dashboard',
      health: 'GET /webhook/health'
    }
  });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('send_message', async (data) => {
    try {
      const { processIncoming } = require('./core/orchestrator');
      const result = await processIncoming({
        from: data.from || 'web_user',
        text: data.text,
        channel: 'web'
      });
      socket.emit('message_response', result);
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
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
  console.log(`\n✅ Sistema listo — 10 agentes activos\n`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
