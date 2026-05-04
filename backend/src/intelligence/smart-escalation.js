// backend/src/intelligence/smart-escalation.js
// Sistema 9 — Escalamiento inteligente con contexto completo
'use strict';

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

class SmartEscalation {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async escalateWithContext(situation, context = {}) {
    const analysis = await this._analyzeImpact(situation, context);
    const options = await this._generateOptions(situation, context);
    const recommendation = await this._recommend(situation, context);

    const formatted = `🚨 NECESITO TU DECISIÓN

Situación: ${situation.description || situation.message || situation.type || 'Situación no especificada'}
${context.clientName ? `Cliente: ${context.clientName}` : ''}

📊 Análisis:
${analysis}

🎯 Opciones que veo:
${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}

✅ Mi recomendación:
${recommendation}

${situation.actions_taken && situation.actions_taken.length > 0 ? `📝 Ya hice:\n- ${situation.actions_taken.join('\n- ')}` : ''}

❓ Necesito que decidas:
${situation.what_neiky_needs || situation.needs_decision || 'Cómo proceder con esta situación'}`;

    // Enviar a Neiky
    await this._sendToNeiky(formatted, context);

    return formatted;
  }

  async _analyzeImpact(situation, context) {
    try {
      const response = await this.claude.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Analiza brevemente el impacto de esta situación en una agencia creativa:
Situación: "${situation.description || situation.message || ''}"
Cliente: "${context.clientName || 'N/A'}"
En 2 bullets: impacto financiero y relacional.`
        }]
      });
      return response.content[0].text.trim();
    } catch {
      return `• Impacto en cliente: ${context.clientName || 'N/A'}\n• Requiere decisión inmediata`;
    }
  }

  async _generateOptions(situation, context) {
    try {
      const response = await this.claude.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Para esta situación en agencia creativa: "${situation.description || situation.message || ''}"
Lista 3 opciones concretas de acción (máximo 1 línea cada una):`
        }]
      });
      const text = response.content[0].text.trim();
      return text.split('\n').filter(l => l.trim()).slice(0, 3).map(l => l.replace(/^\d+\.\s*/, ''));
    } catch {
      return ['Proceder con precaución', 'Pausar y consultar', 'Escalar a dirección'];
    }
  }

  async _recommend(situation, context) {
    try {
      const response = await this.claude.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Situación: "${situation.description || situation.message || ''}"
Cliente: "${context.clientName || 'N/A'}"
¿Cuál es tu recomendación más directa? En 1-2 oraciones.`
        }]
      });
      return response.content[0].text.trim();
    } catch {
      return 'Pausar y definir siguiente paso con Neiky antes de responder al cliente.';
    }
  }

  async _sendToNeiky(message, context) {
    try {
      const phone = process.env.NEIKY_WHATSAPP || process.env.NEIKY_PHONE || '+5215534189583';
      const { sendTwilioMessage } = require('../core/whatsapp');
      await sendTwilioMessage(phone, message);
    } catch (err) {
      // Fallback: socket.io
      if (global.io) {
        global.io.emit('escalation', { message, context, timestamp: new Date().toISOString() });
      }
      console.warn('[SmartEscalation] whatsapp fallback:', err.message);
    }
  }
}

module.exports = new SmartEscalation();
