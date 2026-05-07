// backend/src/nervous-system/huddle-system.js
// Fractal Virtual Team — Fase 5 MEGAZORD
// Sistema 6: Huddles Virtuales — Reuniones auto-convocadas para decisiones colectivas

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const HUDDLE_TIMEOUT_MS = 60 * 1000; // 60s timeout para recolectar opiniones

class HuddleSystem {
  constructor(channelBus, collectiveMemory) {
    this.bus = channelBus;
    this.memory = collectiveMemory;
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    this._subscribed = false;
  }

  subscribe() {
    if (this._subscribed) return;
    this._subscribed = true;

    // Cuando se detecta conflicto que necesita huddle
    this.bus.on('conflict:detected').subscribe(async event => {
      if (event.type === 'conflict_needs_huddle') {
        setImmediate(() => this._handleConflictHuddle(event.payload).catch(err =>
          console.warn('[HuddleSystem] conflict huddle error:', err.message)
        ));
      }
    });

    console.log('[HuddleSystem] ✅ Suscrito a conflict:detected');
  }

  /**
   * Convocar huddle para una decisión colectiva
   */
  async convokeHuddle({
    topic,
    decisionNeeded,
    triggerReason = 'system',
    participants = [], // slugs
    context = {},
    options = []
  }) {
    console.log(`[HuddleSystem] 🤝 Convocando huddle: "${topic}" con [${participants.join(', ')}]`);

    // 1. Crear huddle en DB
    const { data: huddle } = await this.supabase
      .from('virtual_huddles')
      .insert({
        topic,
        trigger_reason: triggerReason,
        initiated_by: null,
        participants: null, // Sin UUIDs de agentes, usamos context
        context: { ...context, participant_slugs: participants },
        decision_needed: decisionNeeded,
        proposed_options: options,
        status: 'in_progress'
      })
      .select()
      .single();

    if (!huddle) {
      console.warn('[HuddleSystem] No se pudo crear huddle en DB');
      return null;
    }

    // 2. Notificar a participantes via bus
    await Promise.allSettled(
      participants.map(slug =>
        this.bus.emit('team:huddles', {
          type: 'huddle_invitation',
          intended_for: [slug],
          payload: {
            huddle_id: huddle.id,
            topic,
            decision_needed: decisionNeeded,
            options,
            context,
            other_participants: participants.filter(p => p !== slug)
          }
        })
      )
    );

    // 3. Recolectar opiniones de todos los participantes en paralelo
    const opinions = await this._collectOpinions(huddle, participants, context);

    // 4. Sintetizar consenso
    const synthesis = await this._synthesizeOpinions(opinions, decisionNeeded, topic);

    // 5. Resolver o escalar
    let finalDecision = null;
    if (synthesis.consensus_reached) {
      finalDecision = synthesis.decision;
      await this._executeDecision(huddle.id, synthesis);
    } else {
      await this._escalateHuddleToNeiky(huddle.id, synthesis, topic);
    }

    // 6. Actualizar DB
    const endTime = new Date();
    await this.supabase.from('virtual_huddles').update({
      participants_responses: { opinions, synthesis },
      consensus_reached: synthesis.consensus_reached,
      final_decision: finalDecision,
      ended_at: endTime.toISOString(),
      status: synthesis.consensus_reached ? 'resolved' : 'escalated'
    }).eq('id', huddle.id);

    return { huddleId: huddle.id, synthesis, opinions };
  }

  /**
   * Recolectar opiniones de todos los agentes en paralelo
   */
  async _collectOpinions(huddle, participantSlugs, context) {
    const opinionPromises = participantSlugs.map(slug =>
      this._askAgentOpinion(slug, huddle, context)
        .then(opinion => ({ agent: slug, opinion }))
        .catch(err => ({ agent: slug, opinion: null, error: err.message }))
    );

    // Timeout de 60s
    const opinions = await Promise.race([
      Promise.allSettled(opinionPromises),
      new Promise(resolve => setTimeout(() => resolve([]), HUDDLE_TIMEOUT_MS))
    ]);

    return opinions
      .filter(r => r.status === 'fulfilled' && r.value?.opinion)
      .map(r => r.value);
  }

  async _askAgentOpinion(agentSlug, huddle, context) {
    // Obtener contexto de memoria colectiva
    let memoryContext = '';
    if (this.memory) {
      const mem = await this.memory.query({
        question: huddle.topic,
        context
      }).catch(() => ({ synthesis: null }));
      memoryContext = mem.synthesis || '';
    }

    const AGENT_DESCRIPTIONS = {
      diego: 'Sr Designer, experto en diseño visual y branding',
      carlos: 'Jr Designer, especializado en assets digitales',
      valentina: 'Art Director, calidad creativa y brand consistency',
      sofia: 'Project Manager, timelines y recursos',
      roberto: 'Finance Manager, márgenes y facturación',
      lucas: 'Analytics, métricas y predicciones',
      alex: 'Content Creator, copywriting y redes',
      max: 'Video Editor, producción audiovisual',
      diana: 'Client Manager, relaciones y negociación',
      mariana: 'Hub Coordinator, coordinación y supervisión'
    };

    const description = AGENT_DESCRIPTIONS[agentSlug] || 'Agente del equipo';

    const response = await this.claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{
        role: 'user',
        content: `Eres ${agentSlug.toUpperCase()} (${description}) en el equipo Fractal MX.

Huddle del equipo:
Tema: ${huddle.topic}
Decisión necesaria: ${huddle.decision_needed}
Opciones: ${(huddle.proposed_options || []).map((o, i) => `${i + 1}. ${o}`).join(' | ') || 'Libre'}
${memoryContext ? `Contexto relevante: ${memoryContext.substring(0, 200)}` : ''}

Da tu opinión desde tu rol. JSON:
{"preferred_option": "1 o texto", "concerns": ["..."], "confidence": 0.0-1.0, "reasoning": "..."}`
      }]
    });

    const text = response.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { preferred_option: 'sin preferencia', concerns: [], confidence: 0.5, reasoning: text };
  }

  /**
   * Sintetizar todas las opiniones en decisión colectiva
   */
  async _synthesizeOpinions(opinions, decisionNeeded, topic) {
    if (!opinions.length) {
      return {
        consensus_reached: false,
        decision: null,
        alignment_percentage: 0,
        recommendation_for_neiky: `Sin opiniones recolectadas para: ${topic}`
      };
    }

    try {
      const response = await this.claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Decisión necesaria: "${decisionNeeded}"

Opiniones del equipo Fractal MX:
${opinions.map(o => `${o.agent}: prefiere "${o.opinion?.preferred_option}" (confianza: ${o.opinion?.confidence}) — ${o.opinion?.reasoning?.substring(0, 100)}`).join('\n')}

¿Hay consenso (≥70% acuerdo)? JSON:
{
  "consensus_reached": true/false,
  "decision": "...",
  "alignment_percentage": 0-100,
  "main_concerns": ["..."],
  "recommendation_for_neiky": "..."
}`
        }]
      });

      const text = response.content[0].text;
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : {
        consensus_reached: false,
        decision: null,
        alignment_percentage: 0,
        recommendation_for_neiky: `Equipo necesita más contexto sobre: ${topic}`
      };
    } catch (err) {
      console.warn('[HuddleSystem] synthesizeOpinions error:', err.message);
      return {
        consensus_reached: false,
        decision: null,
        alignment_percentage: 0,
        recommendation_for_neiky: `Error en síntesis: ${topic}`
      };
    }
  }

  async _executeDecision(huddleId, synthesis) {
    console.log(`[HuddleSystem] ✅ Consenso alcanzado (${synthesis.alignment_percentage}%): ${synthesis.decision?.substring(0, 80)}`);

    // Notificar a todos via bus
    await this.bus.emit('agent:events', {
      type: 'huddle_decision',
      payload: {
        huddle_id: huddleId,
        decision: synthesis.decision,
        alignment: synthesis.alignment_percentage
      }
    }).catch(() => {});

    // Notificar en Vercel si hay socket
    if (global.io) {
      global.io.emit('proactive_message', {
        from: 'EQUIPO',
        message: `🤝 Decisión colectiva (${synthesis.alignment_percentage}% consenso):\n${synthesis.decision}`,
        timestamp: new Date().toISOString()
      });
    }
  }

  async _escalateHuddleToNeiky(huddleId, synthesis, topic) {
    const message = `🤝 El equipo discutió "${topic}" pero no llegó a consenso (${synthesis.alignment_percentage}%).\n\nRecomendación: ${synthesis.recommendation_for_neiky}\n\nPreocupaciones: ${(synthesis.main_concerns || []).join(', ')}\n\n¿Cuál es tu decisión, nene?`;

    if (global.io) {
      global.io.emit('proactive_message', {
        from: 'EQUIPO',
        message,
        timestamp: new Date().toISOString()
      });
    }
    console.log(`[HuddleSystem] 📣 Escalado a Neiky: ${topic}`);
  }

  async _handleConflictHuddle(payload) {
    await this.convokeHuddle({
      topic: `Conflicto: ${payload.conflict_type}`,
      decisionNeeded: `Resolver desacuerdo entre ${payload.agent_a} y ${payload.agent_b}`,
      triggerReason: 'conflict_detected',
      participants: [payload.agent_a, payload.agent_b, 'mariana'].filter(Boolean),
      context: payload.context || {},
      options: ['Propuesta de ' + payload.agent_a, 'Propuesta de ' + payload.agent_b, 'Solución híbrida']
    });
  }

  /**
   * Obtener huddles activos
   */
  async getActiveHuddles() {
    const { data, count } = await this.supabase
      .from('virtual_huddles')
      .select('*', { count: 'exact' })
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(5);
    return { huddles: data || [], count: count || 0 };
  }
}

module.exports = HuddleSystem;
