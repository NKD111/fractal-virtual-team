// orchestrator.js — Simplificado: solo Mariana (WhatsApp).
// Todo lo demás (Diana, Alex, Carlos, etc.) fue retirado.

const { notifyNeiky } = require('./whatsapp');

const marianaInstance = (() => {
  try { return new (require('../agents/mariana.agent'))(); }
  catch (_) { return require('../agents/mariana'); }
})();

function getAgent(_slug) { return marianaInstance; }

function normalizePhone(str) {
  return (str || '').replace(/\D/g, '');
}

async function processIncoming({ from, text, channel = 'whatsapp', mediaUrl = null }) {
  console.log(`[Orchestrator] msg from ${from} via ${channel}: ${(text || '').substring(0, 80)}`);

  try {
    if (global.io) marianaInstance.setIo?.(global.io);
    const result = await marianaInstance.processMessage({ from, text, channel, mediaUrl });

    if (global.io && channel !== 'web') {
      global.io.emit('new_message', { from, channel });
      if (text) {
        global.io.emit('chat_bubble', {
          agent: 'mariana',
          text: `📱 ${text.slice(0, 120)}`,
          kind: 'whatsapp_in'
        });
      }
      if (typeof result === 'string') {
        global.io.emit('chat_bubble', {
          agent: 'mariana',
          text: result.slice(0, 200),
          kind: 'whatsapp_out'
        });
      }
    }
    return result;
  } catch (err) {
    console.error('[Orchestrator] Error:', err.message);
    try { await notifyNeiky(`⚠️ Error: ${err.message}\nDe: ${from}`); } catch (_) {}
    throw err;
  }
}

async function initAllAgents(io) {
  global.io = io;
  if (typeof marianaInstance.setIo === 'function') marianaInstance.setIo(io);
  if (typeof marianaInstance.init === 'function') {
    try { await marianaInstance.init(); } catch (e) { console.error('[mariana init]', e.message); }
  }
  console.log('[Orchestrator] Mariana ready (single-agent mode).');
}

module.exports = {
  processIncoming,
  initAllAgents,
  getAgent,
  // back-compat stubs for any leftover imports
  routeMessage: () => 'mariana',
  processAgentTask: async () => { throw new Error('Multi-agent tasks disabled'); },
};
