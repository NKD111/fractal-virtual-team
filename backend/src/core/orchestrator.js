const { supabase, getOrCreateClient, saveMessage, logActivity } = require('./supabase');
const { notifyNeiky } = require('./whatsapp');

// Lazy load agents to avoid circular deps
const agents = {};
function getAgent(slug) {
  if (!agents[slug]) {
    agents[slug] = require(`../agents/${slug}`);
  }
  return agents[slug];
}

const ALL_SLUGS = ['mariana', 'diana', 'alex', 'carlos', 'sofia', 'lucas', 'diego', 'max', 'valentina', 'roberto'];

// Routing rules: which agent handles which topic keywords
const ROUTING_RULES = [
  { keywords: ['factura', 'pago', 'precio', 'cobro', 'contrato', 'presupuesto', 'costo', 'iva', 'sat', 'rfc'], agent: 'roberto' },
  { keywords: ['diseño', 'logo', 'branding', 'identidad', 'tipografia', 'paleta', 'colores', 'brand'], agent: 'diego' },
  { keywords: ['video', 'reel', 'tiktok', 'edicion', 'animacion', 'motion', 'youtube'], agent: 'max' },
  { keywords: ['contenido', 'copy', 'caption', 'texto', 'blog', 'post', 'publicacion', 'instagram'], agent: 'alex' },
  { keywords: ['proyecto', 'timeline', 'entrega', 'deadline', 'avance', 'status'], agent: 'sofia' },
  { keywords: ['analitica', 'metricas', 'analytics', 'estadisticas', 'reach', 'engagement', 'reporte', 'kpi'], agent: 'lucas' },
  { keywords: ['arte', 'creativo', 'campaña', 'concepto', 'vision', 'estrategia creativa'], agent: 'valentina' },
  { keywords: ['cliente', 'cuenta', 'propuesta', 'negociacion', 'relacion'], agent: 'diana' },
];

// Detect which agent should handle the message
function routeMessage(text) {
  const lower = text.toLowerCase();

  // Always route Fermín directly to Mariana first
  for (const rule of ROUTING_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.agent;
    }
  }
  return 'mariana'; // Default hub
}

// Main message processor
async function processIncoming({ from, text, channel = 'whatsapp', mediaUrl = null }) {
  console.log(`[Orchestrator] New message from ${from} via ${channel}: ${text?.substring(0, 80)}`);

  try {
    // Check if Fermín is messaging
    const neikyPhone = process.env.NEIKY_WHATSAPP?.replace('whatsapp:', '');
    const fromPhone = from.replace('whatsapp:', '').replace('+', '');
    const isNeiky = fromPhone === neikyPhone?.replace('+', '');

    // Route to appropriate agent
    const targetSlug = isNeiky ? 'mariana' : routeMessage(text);
    const agent = getAgent(targetSlug);

    // Set Socket.io if available
    if (global.io) agent.setIo(global.io);

    // Process
    const result = await agent.processMessage({ from, text, channel, mediaUrl });

    console.log(`[Orchestrator] ${targetSlug} responded successfully`);
    return result;

  } catch (err) {
    console.error('[Orchestrator] Error:', err.message);

    // Fallback: notify Fermín if something breaks
    try {
      await notifyNeiky(`⚠️ Error en el sistema:\n${err.message}\nMensaje de: ${from}`);
    } catch (_) {}

    throw err;
  }
}

// Process inter-agent tasks (from queue)
async function processAgentTask({ fromSlug, toSlug, message, taskId }) {
  const targetAgent = getAgent(toSlug);
  if (global.io) targetAgent.setIo(global.io);

  return targetAgent.processMessage({
    from: 'internal',
    text: `[De ${fromSlug}]: ${message}`,
    channel: 'internal'
  });
}

// Initialize all agents (pre-load data from DB)
async function initAllAgents(io) {
  global.io = io;
  console.log('[Orchestrator] Initializing all agents...');

  for (const slug of ALL_SLUGS) {
    try {
      const agent = getAgent(slug);
      agent.setIo(io);
      await agent.init();
      console.log(`  ✓ ${slug}`);
    } catch (err) {
      console.error(`  ✗ ${slug}:`, err.message);
    }
  }
  console.log('[Orchestrator] All agents ready.');
}

module.exports = { processIncoming, processAgentTask, initAllAgents, routeMessage };
