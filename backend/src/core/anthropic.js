require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1024;

async function chat({ system, messages, model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS, temperature = 0.8 }) {
  const start = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages,
    temperature
  });

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
