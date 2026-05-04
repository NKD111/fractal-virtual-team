// backend/src/nervous-system/conflict-detector.js
// Fractal Virtual Team — Fase 5 MEGAZORD
// Sistema 5: Detección de Conflictos — Diego y Carlos alineados, prioridades coordinadas

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

class ConflictDetector {
  constructor(channelBus) {
    this.bus = channelBus;
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    this._recentEvents = new Map(); // Cache para detectar conflictos entre eventos
    this._subscribed = false;
  }

  subscribe() {
    if (this._subscribed) return;
    this._subscribed = true;

    this.bus.on('agent:events').subscribe(async event => {
      if (this._couldGenerateConflict(event)) {
        setImmediate(() => this.checkForConflict(event).catch(err =>
          console.warn('[ConflictDetector] error:', err.message)
        ));
      }
      // Guardar evento reciente para comparación
      this._trackEvent(event);
    });

    console.log('[ConflictDetector] ✅ Suscrito a agent:events');
  }

  _couldGenerateConflict(event) {
    return ['design_proposal', 'priority_assignment', 'resource_assignment'].includes(event.type);
  }

  _trackEvent(event) {
    const key = `${event.type}:${event.payload?.project_id || 'general'}`;
    if (!this._recentEvents.has(key)) {
      this._recentEvents.set(key, []);
    }
    const events = this._recentEvents.get(key);
    events.push(event);
    // Limpiar eventos viejos (> 5 min)
    const cutoff = Date.now() - 5 * 60 * 1000;
    this._recentEvents.set(key, events.filter(e => new Date(e.emitted_at).getTime() > cutoff));
  }

  /**
   * Verificar si un evento crea conflicto con eventos previos
   */
  async checkForConflict(event) {
    const key = `${event.type}:${event.payload?.project_id || 'general'}`;
    const recentEvents = this._recentEvents.get(key) || [];

    // Buscar eventos del mismo tipo, mismo proyecto, pero agente diferente
    const conflictingEvents = recentEvents.filter(e =>
      e.emitted_by !== event.emitted_by &&
      e.id !== event.id
    );

    if (!conflictingEvents.length) return;

    for (const other of conflictingEvents) {
      const isConflict = await this._areEventsConflicting(event, other);
      if (isConflict) {
        await this.handleConflict({
          type: event.type === 'design_proposal' ? 'design_disagreement' : 'priority_clash',
          agent_a: event.emitted_by,
          agent_b: other.emitted_by,
          context: {
            project_id: event.payload?.project_id,
            event_a: event.payload,
            event_b: other.payload
          }
        });
        break; // Solo un conflicto a la vez
      }
    }
  }

  async _areEventsConflicting(eventA, eventB) {
    try {
      const response = await this.claude.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `¿Estos dos eventos del equipo Fractal MX son conflictivos?
Evento A (${eventA.emitted_by}): ${JSON.stringify(eventA.payload).substring(0, 200)}
Evento B (${eventB.emitted_by}): ${JSON.stringify(eventB.payload).substring(0, 200)}
Solo responde: true o false`
        }]
      });
      return response.content[0].text.trim().toLowerCase().includes('true');
    } catch {
      return false;
    }
  }

  /**
   * Manejar un conflicto detectado
   */
  async handleConflict(conflict) {
    console.log(`[ConflictDetector] ⚡ Conflicto: ${conflict.type} entre ${conflict.agent_a} y ${conflict.agent_b}`);

    // Registrar en DB
    const { data: record } = await this.supabase
      .from('agent_conflicts')
      .insert({
        agent_a: null, // No tenemos UUIDs aquí
        agent_b: null,
        conflict_type: conflict.type,
        agent_a_position: conflict.context?.event_a?.summary || JSON.stringify(conflict.context?.event_a || {}).substring(0, 200),
        agent_b_position: conflict.context?.event_b?.summary || JSON.stringify(conflict.context?.event_b || {}).substring(0, 200),
        context: {
          ...conflict.context,
          agent_a_slug: conflict.agent_a,
          agent_b_slug: conflict.agent_b
        },
        related_project: conflict.context?.project_id || null
      })
      .select()
      .single();

    // Determinar método de resolución
    const method = this._determineResolutionMethod(conflict);

    if (method === 'auto_resolve') {
      await this.autoResolveConflict(record, conflict);
    } else if (method === 'huddle') {
      // Emitir evento para que HuddleSystem lo maneje
      await this.bus.emit('conflict:detected', {
        type: 'conflict_needs_huddle',
        payload: {
          conflict_id: record?.id,
          conflict_type: conflict.type,
          agent_a: conflict.agent_a,
          agent_b: conflict.agent_b,
          context: conflict.context
        }
      }).catch(() => {});
    } else {
      await this._escalateToNeiky(record, conflict);
    }
  }

  _determineResolutionMethod(conflict) {
    if (conflict.type === 'design_disagreement') return 'huddle';
    if (conflict.type === 'priority_clash') return 'auto_resolve';
    if (conflict.type === 'resource_conflict') return 'escalate';
    return 'huddle';
  }

  /**
   * Auto-resolución con criterio de negocio
   */
  async autoResolveConflict(record, conflict) {
    try {
      const response = await this.claude.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Conflicto en equipo Fractal MX:
Tipo: ${conflict.type}
${conflict.agent_a}: "${JSON.stringify(conflict.context?.event_a || {}).substring(0, 150)}"
${conflict.agent_b}: "${JSON.stringify(conflict.context?.event_b || {}).substring(0, 150)}"

Resuelve considerando: mejor para el cliente, eficiencia del equipo, calidad.
Decisión final en 2 líneas máximo.`
        }]
      });

      const resolution = response.content[0].text;

      if (record?.id) {
        await this.supabase.from('agent_conflicts').update({
          resolution_method: 'auto_resolved',
          resolution,
          resolved_at: new Date().toISOString()
        }).eq('id', record.id);
      }

      // Notificar a ambos agentes
      await Promise.allSettled([
        this.bus.emit('agent:events', {
          type: 'conflict_resolved',
          intended_for: [conflict.agent_a, conflict.agent_b],
          payload: { resolution, method: 'auto_resolved', conflict_type: conflict.type }
        })
      ]);

      console.log(`[ConflictDetector] ✅ Auto-resuelto: ${resolution.substring(0, 80)}...`);
    } catch (err) {
      console.warn('[ConflictDetector] autoResolve error:', err.message);
    }
  }

  async _escalateToNeiky(record, conflict) {
    const message = `⚡ Conflicto entre ${conflict.agent_a} y ${conflict.agent_b} (${conflict.type}) — necesita tu decisión, nene.`;
    if (global.io) {
      global.io.emit('proactive_message', { from: 'SISTEMA', message, timestamp: new Date().toISOString() });
    }
    console.log(`[ConflictDetector] 📣 Escalado a Neiky: ${conflict.type}`);

    if (record?.id) {
      await this.supabase.from('agent_conflicts').update({
        resolution_method: 'escalated_to_neiky'
      }).eq('id', record.id);
    }
  }

  /**
   * Obtener conflictos sin resolver
   */
  async getUnresolvedConflicts() {
    const { data, count } = await this.supabase
      .from('agent_conflicts')
      .select('*', { count: 'exact' })
      .is('resolved_at', null)
      .order('detected_at', { ascending: false })
      .limit(10);
    return { conflicts: data || [], count: count || 0 };
  }
}

module.exports = ConflictDetector;
