require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const Anthropic = require('@anthropic-ai/sdk');

let client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// UPGRADE 2: auto-wrap para tracking de costos en cost_log
// telemetry.wrapAnthropic() intercepta cada client.messages.create
// y loguea tokens + costo en background sin bloquear el flujo
try {
  const { wrapAnthropic } = require('./telemetry');
  client = wrapAnthropic(client);
} catch { /* telemetry opcional — no bloquea si hay error */ }

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1024;

// Opus 4.7 does not accept temperature — omit it for that model.
const NO_TEMPERATURE_MODELS = ['claude-opus-4-7'];

// UPGRADE 3: Circuit breaker para Claude API
// Lazy-load para evitar circular dependency al startup
function getClaudeBreaker() {
  try { return require('./circuit-breaker').breakers.claudeAPI; } catch { return null; }
}

async function chat({ system, messages, model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS, temperature = 0.8 }) {
  const start = Date.now();

  const params = { model, max_tokens: maxTokens, system, messages };
  if (!NO_TEMPERATURE_MODELS.includes(model)) params.temperature = temperature;

  const breaker = getClaudeBreaker();

  const doCall = () => client.messages.create(params);

  // Si el breaker está OPEN → falla rápido con error descriptivo (no esperar timeout de API)
  const response = breaker
    ? await breaker.execute(
        doCall,
        () => { throw new Error('[Claude API] Circuit breaker OPEN — servicio temporalmente no disponible'); }
      )
    : await doCall();

  return {
    content: response.content[0].text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs: Date.now() - start,
    model
  };
}

// Build messages array from history + new user message
function buildMessages(history, userMessage) {
  const messages = history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

module.exports = { chat, buildMessages };
