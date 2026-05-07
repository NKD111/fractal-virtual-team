// backend/src/intelligence/pattern-analyzer.js
// Sistema 4 — Análisis de Patrones: aprende del histórico de clientes
'use strict';

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

class PatternAnalyzer {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async analyzeClientPatterns(clientId) {
    try {
      // Obtener historial de mensajes del cliente (últimos 30 días)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: messages } = await this.supabase
        .from('messages')
        .select('*')
        .eq('from_number', clientId)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(100);

      const { data: client } = await this.supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .maybeSingle();

      const history = messages || [];

      return {
        client_name: client?.name || 'Unknown',
        message_count: history.length,
        avg_response_time_hours: this._calcAvgResponseTime(history),
        common_topics: this._extractTopics(history),
        sentiment_trend: this._analyzeSentiment(history),
        activity_hours: this._getActiveHours(history),
        health_score: client?.health_score || 50,
        revision_patterns: this._extractRevisionPatterns(history)
      };
    } catch (err) {
      console.warn('[PatternAnalyzer] analyzeClientPatterns error:', err.message);
      return { client_name: 'Unknown', message_count: 0, health_score: 50 };
    }
  }

  async predictClientNeeds(message, clientId) {
    try {
      const patterns = await this.analyzeClientPatterns(clientId);

      const response = await this.claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Cliente: ${patterns.client_name}
Mensaje actual: "${message}"
Patrones históricos: mensajes=${patterns.message_count}, health=${patterns.health_score}, temas=${JSON.stringify(patterns.common_topics)}

En 3 bullets cortos predice:
1. Qué necesita este cliente ahora
2. Posibles objeciones o red flags
3. Tono recomendado para responderle`
        }]
      });

      return response.content[0].text;
    } catch (err) {
      console.warn('[PatternAnalyzer] predictClientNeeds error:', err.message);
      return null;
    }
  }

  async detectRedFlags(clientId, currentMessage) {
    const RED_FLAGS = [
      { pattern: /pago.*atras|no.*pag|deuda/i, flag: 'pago_atrasado', severity: 4 },
      { pattern: /cambio|revision|modifica/gi, flag: 'multiples_revisiones', severity: 3 },
      { pattern: /descuento|barato|precio.*alto|caro/i, flag: 'negociacion_precio', severity: 3 },
      { pattern: /competencia|otro.*agencia|cotiza.*otro/i, flag: 'comparando_competencia', severity: 4 },
      { pattern: /cancel|ya no|desistir/i, flag: 'riesgo_cancelacion', severity: 5 },
      { pattern: /renegoci|cambiar.*acuerdo/i, flag: 'renegociacion', severity: 4 }
    ];

    const flags = [];
    for (const rf of RED_FLAGS) {
      if (rf.pattern.test(currentMessage)) {
        flags.push({ flag: rf.flag, severity: rf.severity, message: currentMessage });
      }
    }

    return flags;
  }

  async detectGreenFlags(currentMessage) {
    const GREEN_FLAGS = [
      { pattern: /recomend|refir|colegas?|conocid/i, flag: 'referido', opportunity: 'nuevo_cliente' },
      { pattern: /mas.*servicio|otro.*proyecto|ampliar/i, flag: 'upsell', opportunity: 'expansion' },
      { pattern: /pago.*adelant|anticip/i, flag: 'pago_anticipado', opportunity: 'cliente_premium' },
      { pattern: /contrato.*mensual|retainer|mensualidad/i, flag: 'retainer', opportunity: 'recurrencia' }
    ];

    const flags = [];
    for (const gf of GREEN_FLAGS) {
      if (gf.pattern.test(currentMessage)) {
        flags.push({ flag: gf.flag, opportunity: gf.opportunity });
      }
    }

    return flags;
  }

  _calcAvgResponseTime(messages) {
    if (!messages || messages.length < 2) return 24;
    const gaps = [];
    for (let i = 1; i < Math.min(messages.length, 10); i++) {
      const diff = new Date(messages[i-1].created_at) - new Date(messages[i].created_at);
      gaps.push(Math.abs(diff) / 3600000);
    }
    return gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }

  _extractTopics(messages) {
    const topics = {};
    const keywords = {
      'video': /video|reel|clip|edición/i,
      'diseño': /diseño|grafico|logo|banner/i,
      'precio': /precio|costo|cotiz|presupuest/i,
      'evento': /evento|expo|feria/i,
      'urgente': /urgent|rapido|ya|hoy/i
    };

    for (const msg of (messages || [])) {
      for (const [topic, regex] of Object.entries(keywords)) {
        if (regex.test(msg.content || msg.body || '')) {
          topics[topic] = (topics[topic] || 0) + 1;
        }
      }
    }

    return Object.entries(topics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
  }

  _analyzeSentiment(messages) {
    if (!messages || messages.length === 0) return 'neutral';
    const positive = /gracias|excelente|perfecto|genial|bien/i;
    const negative = /mal|problema|error|falla|queja/i;
    let pos = 0, neg = 0;
    for (const m of messages) {
      const text = m.content || m.body || '';
      if (positive.test(text)) pos++;
      if (negative.test(text)) neg++;
    }
    if (pos > neg * 2) return 'positivo';
    if (neg > pos * 2) return 'negativo';
    return 'neutral';
  }

  _getActiveHours(messages) {
    const hours = {};
    for (const m of (messages || [])) {
      const h = new Date(m.created_at).getHours();
      hours[h] = (hours[h] || 0) + 1;
    }
    return Object.entries(hours).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => `${h}:00`);
  }

  _extractRevisionPatterns(messages) {
    const revCount = (messages || []).filter(m =>
      /cambio|revision|modifica/i.test(m.content || m.body || '')
    ).length;
    return { count: revCount, tendency: revCount > 5 ? 'alto' : revCount > 2 ? 'medio' : 'bajo' };
  }
}

module.exports = new PatternAnalyzer();
