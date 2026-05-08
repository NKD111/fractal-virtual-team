// backend/src/core/promise-tracker.js
// Fractal Virtual Team v4.2 — Sistema Anti-Promesas-Vacías
//
// PROBLEMA RESUELTO: Mariana decía "te aviso en 5 min" pero nunca regresaba.
// SOLUCIÓN: Cada promesa detectada crea un job real en BullMQ con delay.
//           Al vencer el tiempo, el worker EJECUTA la acción y manda mensaje proactivo.
//
// Flujo:
//   Mariana responde → detectPromises(response) → schedulePromise() → BullMQ job
//   [tiempo después] → worker.executePromise() → llama al agente → sendProactiveMessage()

const { Queue } = require('bullmq');
const { createClient } = require('@supabase/supabase-js');

// ─── Conexión Redis/BullMQ ────────────────────────────────────────────────────
let promiseQueue = null;
function getQueue() {
  if (!promiseQueue) {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;
    if (redisUrl) {
      const connection = { url: redisUrl, maxRetriesPerRequest: null };
      promiseQueue = new Queue('fractal-promises', { connection });
      console.log('[PromiseTracker] BullMQ queue conectada');
    } else {
      console.warn('[PromiseTracker] REDIS_URL no configurado — usando setTimeout como fallback');
    }
  }
  return promiseQueue;
}

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── Patrones de promesas ─────────────────────────────────────────────────────
const PROMISE_PATTERNS = [
  // Tiempo explícito orden A: "te aviso en 5 minutos"
  {
    regex: /(?:te aviso|te confirmo|te digo|regreso|vuelvo|escribo).*?en\s+(\d+)\s*(min(?:utos?)?|hora(?:s?)?)/i,
    type: 'timed_update',
    extractDelay: (m) => parseTime(m[1], m[2])
  },
  // Tiempo explícito orden B: "en 5 minutos te aviso" (orden invertido que usa Mariana frecuentemente)
  {
    regex: /en\s+(\d+)\s*(min(?:utos?)?|hora(?:s?)?)\s+(?:te aviso|te confirmo|te digo|regreso|vuelvo|te escribo|aviso)/i,
    type: 'timed_update',
    extractDelay: (m) => parseTime(m[1], m[2])
  },
  // Tiempo con "dentro de": "dentro de 5 minutos te aviso"
  {
    regex: /dentro\s+de\s+(\d+)\s*(min(?:utos?)?|hora(?:s?)?)/i,
    type: 'timed_update',
    extractDelay: (m) => parseTime(m[1], m[2])
  },
  // Timer puesto / "pongo mi timer": "timer puesto para X min"
  {
    regex: /timer\s+(?:puesto|listo|marcado).*?(\d+)\s*(min(?:utos?)?|hora(?:s?)?)/i,
    type: 'timed_update',
    extractDelay: (m) => parseTime(m[1], m[2])
  },
  {
    regex: /dame\s+(\d+)\s*(min(?:utos?)?|hora(?:s)?)/i,
    type: 'timed_update',
    extractDelay: (m) => parseTime(m[1], m[2])
  },
  // "ahorita" → 3 minutos
  {
    regex: /ahorita\s+(?:te\s+)?(?:confirmo|aviso|digo|escribo|pregunto|reviso|veo)/i,
    type: 'timed_update',
    extractDelay: () => 3 * 60 * 1000
  },
  // "voy a preguntar a [agente]" → INMEDIATO (pero async, notifica resultado)
  {
    regex: /voy\s+a\s+preguntar(?:le)?\s+a\s+(diego|carlos|valentina|max|sofia|roberto|alex|lucas|diana)/i,
    type: 'ask_agent',
    extractDelay: () => 0, // inmediato
    extractTarget: (m) => m[1].toLowerCase()
  },
  {
    regex: /(?:le\s+)?pregunto\s+(?:a\s+)?(diego|carlos|valentina|max|sofia|roberto|alex|lucas|diana)/i,
    type: 'ask_agent',
    extractDelay: () => 0,
    extractTarget: (m) => m[1].toLowerCase()
  },
  {
    regex: /ya\s+(?:le\s+)?pregunto\s+a\s+(diego|carlos|valentina|max|sofia|roberto|alex|lucas|diana)/i,
    type: 'ask_agent',
    extractDelay: () => 0,
    extractTarget: (m) => m[1].toLowerCase()
  },
  // "déjame investigar/revisar" → 2 minutos
  {
    regex: /d[eé]jame\s+(?:investigar|revisar|ver|checar|pregunta[r]?)/i,
    type: 'timed_update',
    extractDelay: () => 2 * 60 * 1000
  },
  // "voy a revisar/investigar"
  {
    regex: /voy\s+a\s+(?:revisar|investigar|ver|checar)/i,
    type: 'timed_update',
    extractDelay: () => 2 * 60 * 1000
  }
];

function parseTime(amount, unit) {
  const n = parseInt(amount, 10);
  if (unit.startsWith('hora')) return n * 60 * 60 * 1000;
  return n * 60 * 1000; // minutos
}

// ─── PromiseTracker ───────────────────────────────────────────────────────────
class PromiseTracker {

  /**
   * Detecta promesas en el texto de Mariana y las devuelve estructuradas.
   * No schedula aún — solo detecta.
   */
  detectPromises(text) {
    const found = [];
    for (const pattern of PROMISE_PATTERNS) {
      const match = text.match(pattern.regex);
      if (match) {
        found.push({
          type: pattern.type,
          delayMs: pattern.extractDelay(match),
          target: pattern.extractTarget ? pattern.extractTarget(match) : null,
          matchedText: match[0],
          fullText: text.substring(0, 300)
        });
      }
    }
    return found;
  }

  /**
   * Detecta promesas Y las schedula automáticamente.
   * Llamar DESPUÉS de que Mariana genera su respuesta.
   *
   * @param {string} marianaResponse - Texto de la respuesta de Mariana
   * @param {object} context - { userId, phone, channel, originalMessage, socketId }
   */
  async detectAndSchedule(marianaResponse, context) {
    // 🛑 PAUSA GLOBAL — no agendar nuevas promesas automáticas
    if (process.env.SYSTEM_PAUSED === 'true') {
      console.log('[PromiseTracker] 🛑 SYSTEM_PAUSED=true — detectAndSchedule bloqueado');
      return;
    }
    const promises = this.detectPromises(marianaResponse);
    if (promises.length === 0) return;

    console.log(`[PromiseTracker] ${promises.length} promesa(s) detectada(s) en respuesta de Mariana`);

    for (const promise of promises) {
      await this.schedulePromise(promise, context);
    }
  }

  /**
   * Schedula una promesa como job real.
   * Prioridad: BullMQ (con Redis) → setTimeout (fallback en memoria)
   */
  async schedulePromise(promise, context) {
    const executeAt = new Date(Date.now() + promise.delayMs);

    // Guardar en Supabase para persistencia entre reinicios
    let promiseId = null;
    try {
      const { data } = await supabase.from('pending_promises').insert({
        agent_id: 'mariana',
        user_phone: context.phone || null,
        user_channel: context.channel || 'whatsapp',
        socket_id: context.socketId || null,
        promise_text: promise.matchedText,
        original_message: context.originalMessage?.substring(0, 500) || '',
        action_type: promise.type,
        action_target: promise.target,
        execute_at: executeAt.toISOString(),
        status: 'pending'
      }).select('id').single();

      promiseId = data?.id;
      console.log(`[PromiseTracker] Promesa guardada en DB: id=${promiseId} type=${promise.type} delay=${promise.delayMs}ms target=${promise.target || '-'}`);
    } catch (err) {
      console.warn('[PromiseTracker] No se pudo guardar en Supabase:', err.message);
    }

    // Job con BullMQ si Redis disponible
    const queue = getQueue();
    if (queue) {
      try {
        await queue.add('execute-promise', {
          promiseId,
          promise,
          context: { ...context, socketId: undefined } // no serializar socket directamente
        }, {
          delay: promise.delayMs,
          attempts: 2,
          backoff: { type: 'fixed', delay: 30000 }
        });
        console.log(`[PromiseTracker] Job BullMQ creado — ejecuta en ${promise.delayMs / 1000}s`);
        return;
      } catch (err) {
        console.warn('[PromiseTracker] BullMQ falló, usando setTimeout:', err.message);
      }
    }

    // Fallback: setTimeout en memoria
    if (promise.delayMs === 0) {
      // Inmediato: next tick
      setImmediate(() => this.executePromise({ promiseId, promise, context }));
    } else {
      setTimeout(() => this.executePromise({ promiseId, promise, context }), promise.delayMs);
      console.log(`[PromiseTracker] setTimeout fallback — ejecuta en ${promise.delayMs / 1000}s`);
    }
  }

  /**
   * EJECUTA una promesa: acción real + mensaje proactivo a Neiky.
   * Llamado por el BullMQ worker O por setTimeout.
   */
  async executePromise({ promiseId, promise, context }) {
    console.log(`[PromiseTracker] ⚡ Ejecutando promesa: type=${promise.type} target=${promise.target || '-'}`);

    let result = '';

    try {
      if (promise.type === 'ask_agent' && promise.target) {
        result = await this._executeAskAgent(promise.target, context.originalMessage);
      } else if (promise.type === 'timed_update') {
        result = await this._executeTimedUpdate(context.originalMessage);
      } else {
        result = 'Revisé todo y está en orden. ¿Necesitas algo más, nene?';
      }

      // Enviar mensaje proactivo
      await this.sendProactiveMessage(context, result);

      // Marcar como completado en Supabase
      if (promiseId) {
        await supabase.from('pending_promises')
          .update({ status: 'executed', result: result.substring(0, 1000), executed_at: new Date().toISOString() })
          .eq('id', promiseId);
      }

    } catch (err) {
      console.error('[PromiseTracker] Error ejecutando promesa:', err.message);
      if (promiseId) {
        await supabase.from('pending_promises')
          .update({ status: 'failed', result: err.message })
          .eq('id', promiseId);
      }
    }
  }

  /**
   * Realmente le pregunta al agente y obtiene respuesta.
   */
  async _executeAskAgent(agentSlug, originalQuestion) {
    console.log(`[PromiseTracker] Preguntando a ${agentSlug.toUpperCase()}...`);

    const { getAgent } = require('./orchestrator');
    const agent = getAgent(agentSlug);
    if (!agent) return `No pude contactar a ${agentSlug} en este momento.`;

    const question = `Mariana te pregunta en nombre de Neiky: "${originalQuestion?.substring(0, 300) || 'Status update'}". Responde directamente y brevemente.`;

    try {
      const response = await agent.think(question);
      const agentName = agent.fullName || agentSlug;
      return `Hablé con ${agentName} y me dijo:\n\n${response}`;
    } catch (err) {
      return `Intenté contactar a ${agentSlug} pero está ocupado. Te aviso cuando responda.`;
    }
  }

  /**
   * Genera un update real basado en la pregunta original.
   */
  async _executeTimedUpdate(originalQuestion) {
    if (!originalQuestion) return '¡Ya revisé todo! ¿En qué más te puedo ayudar, nene?';

    const Anthropic = require('@anthropic-ai/sdk');
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Eres Mariana, coordinadora del equipo Fractal MX.
Neiky te preguntó: "${originalQuestion.substring(0, 300)}"
Ya revisaste y tienes la información. Responde de forma breve, cálida y concreta, como si acabaras de investigar.
Máximo 3 líneas. Tono: coqueto-profesional. Si no tienes info específica, da una respuesta útil y honesta.`;

    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content[0].text;
  }

  /**
   * Envía el mensaje de follow-up proactivo al canal correcto.
   */
  async sendProactiveMessage(context, message) {
    const fullMessage = `Hola nene, te debo esta respuesta:\n\n${message}`;
    console.log(`[PromiseTracker] Enviando mensaje proactivo → canal: ${context.channel}`);

    // 1. Intentar por el canal original
    if (context.channel === 'whatsapp' && context.phone) {
      try {
        const { sendTwilioMessage } = require('./whatsapp');
        await sendTwilioMessage(context.phone, fullMessage);
        console.log(`[PromiseTracker] ✅ Mensaje proactivo enviado por WhatsApp a ${context.phone}`);
        return;
      } catch (err) {
        console.warn('[PromiseTracker] WhatsApp falló:', err.message);
      }
    }

    // 2. Web: Socket.io
    if (global.io && context.userId) {
      global.io.emit('proactive_message', { from: 'MARIANA', message: fullMessage, timestamp: new Date().toISOString() });
      console.log('[PromiseTracker] ✅ Mensaje proactivo enviado por Socket.io');
      return;
    }

    // 3. Email como último recurso
    try {
      const { sendEmail } = require('./email');
      await sendEmail({
        to: process.env.NEIKY_EMAIL || 'nakedgeometry19@gmail.com',
        subject: '📩 Mariana tiene una actualización para ti',
        html: `<p style="font-family:sans-serif;">${fullMessage.replace(/\n/g, '<br>')}</p>`,
        text: fullMessage,
        fromName: 'Mariana · Fractal MX'
      });
      console.log('[PromiseTracker] ✅ Follow-up enviado por email');
    } catch (err) {
      console.error('[PromiseTracker] Todos los canales fallaron:', err.message);
    }
  }

  /**
   * Obtener promesas pendientes vencidas o por vencer de un usuario.
   * Mariana chequea esto ANTES de responder.
   */
  async getPendingDue(phone) {
    try {
      const { data } = await supabase
        .from('pending_promises')
        .select('*')
        .eq('user_phone', phone)
        .eq('status', 'pending')
        .lte('execute_at', new Date(Date.now() + 60000).toISOString()) // vencen en el próximo minuto
        .order('execute_at', { ascending: true })
        .limit(5);
      return data || [];
    } catch {
      return [];
    }
  }

  /**
   * Ejecuta promesas vencidas antes de que Mariana responda.
   * Devuelve contexto adicional para incluir en la respuesta.
   */
  async flushDuePromises(phone) {
    // 🛑 PAUSA GLOBAL — no ejecutar promesas vencidas automáticamente
    if (process.env.SYSTEM_PAUSED === 'true') {
      console.log('[PromiseTracker] 🛑 SYSTEM_PAUSED=true — flushDuePromises bloqueado');
      return null;
    }
    const due = await this.getPendingDue(phone);
    if (due.length === 0) return null;

    console.log(`[PromiseTracker] ${due.length} promesa(s) vencida(s) — ejecutando antes de responder`);

    const results = [];
    for (const p of due) {
      try {
        const promise = { type: p.action_type, target: p.action_target, matchedText: p.promise_text };
        const context = { phone: p.user_phone, channel: p.user_channel, originalMessage: p.original_message };
        await this.executePromise({ promiseId: p.id, promise, context });
        results.push(`✓ Ejecuté: "${p.promise_text}"`);
      } catch (err) {
        results.push(`✗ Error: ${p.promise_text}`);
      }
    }

    return results.join('\n');
  }
}

module.exports = new PromiseTracker();
