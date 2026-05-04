// backend/src/nervous-system/channel-bus.js
// Fractal Virtual Team — Fase 5 MEGAZORD
// Sistema 1: Channel Bus — Redis Pub/Sub avanzado con prioridades

const Redis = require('ioredis');
const { Subject } = require('rxjs');
const { filter } = require('rxjs/operators');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const CHANNELS = [
  'project:updates',      // Updates de proyectos
  'knowledge:share',      // Compartir aprendizajes
  'urgent:alerts',        // Alertas críticas
  'team:huddles',         // Convocatorias a huddle
  'agent:events',         // Eventos generales
  'collaboration:invite', // Invitaciones a colaborar
  'conflict:detected',    // Conflictos
  'pattern:learned'       // Nuevos patrones
];

class ChannelBus {
  constructor() {
    this.publisher = null;
    this.subscriber = null;
    this.subjects = {};
    this.isRedisAvailable = false;
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // RxJS Subjects por canal (funciona SIN Redis también)
    for (const ch of CHANNELS) {
      this.subjects[ch] = new Subject();
    }
  }

  async initialize() {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;
    if (!redisUrl) {
      console.warn('[ChannelBus] Sin REDIS_URL — modo in-process (sin persistencia cross-instance)');
      return;
    }

    try {
      this.publisher = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
      this.subscriber = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });

      await this.publisher.connect();
      await this.subscriber.connect();

      // Suscribirse a todos los canales en Redis
      await this.subscriber.subscribe(...CHANNELS);
      this.subscriber.on('message', (channel, message) => {
        try {
          const event = JSON.parse(message);
          if (this.subjects[channel]) {
            this.subjects[channel].next(event);
          }
        } catch (err) {
          console.error('[ChannelBus] Error parsing message:', err.message);
        }
      });

      this.isRedisAvailable = true;
      console.log('[ChannelBus] ✅ Redis Pub/Sub activo — 8 canales suscritos');
    } catch (err) {
      console.warn('[ChannelBus] Redis no disponible, usando in-process subjects:', err.message);
      this.isRedisAvailable = false;
    }
  }

  /**
   * Emitir evento en un canal con prioridad
   */
  async emit(channel, event) {
    if (!this.subjects[channel]) {
      console.warn(`[ChannelBus] Canal desconocido: ${channel}`);
      return null;
    }

    const enriched = {
      id: uuidv4(),
      channel,
      ...event,
      emitted_at: new Date().toISOString(),
      priority: event.priority || 3
    };

    // Persistir en Supabase (non-blocking)
    this._persistEvent(channel, enriched).catch(err =>
      console.warn('[ChannelBus] Supabase persist error:', err.message)
    );

    // Publicar en Redis si disponible, si no → solo in-process
    if (this.isRedisAvailable && this.publisher) {
      try {
        await this.publisher.publish(channel, JSON.stringify(enriched));
      } catch (err) {
        // Fallback a in-process
        this.subjects[channel].next(enriched);
      }
    } else {
      // In-process directo
      this.subjects[channel].next(enriched);
    }

    console.log(`📡 [${channel}] ${event.type || 'event'} priority=${enriched.priority}`);
    return enriched;
  }

  /**
   * Emitir alerta urgente (prioridad 5)
   */
  async emitUrgent(event) {
    return this.emit('urgent:alerts', { ...event, priority: 5, requires_immediate_action: true });
  }

  /**
   * Suscribirse a un canal con filtro opcional
   * Retorna Observable de rxjs
   */
  on(channel, filterFn = null) {
    if (!this.subjects[channel]) {
      console.warn(`[ChannelBus] Canal desconocido: ${channel}`);
      return new Subject().asObservable();
    }

    let stream = this.subjects[channel].asObservable();
    if (filterFn) {
      stream = stream.pipe(filter(filterFn));
    }
    return stream;
  }

  /**
   * Marcar eventos como consumidos por un agente
   */
  async acknowledge(eventId, agentId) {
    try {
      await this.supabase.rpc('array_append_if_not_exists', {
        table_name: 'channel_events',
        row_id: eventId,
        column_name: 'acknowledged_by',
        value: agentId
      });
    } catch {
      // best effort
    }
  }

  async _persistEvent(channel, event) {
    await this.supabase.from('channel_events').insert({
      channel,
      event_type: event.type || 'unknown',
      priority: event.priority,
      emitted_by: event.emitted_by || null,
      intended_for: event.intended_for || null,
      payload: event.payload || {},
      context: event.context || null,
      emitted_at: event.emitted_at,
      expires_at: event.expires_at || null
    });
  }

  /**
   * Stats del bus
   */
  async getStats() {
    const { count } = await this.supabase
      .from('channel_events')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    return {
      redis_available: this.isRedisAvailable,
      active_channels: CHANNELS.length,
      active_events: count || 0
    };
  }
}

// Singleton
let instance = null;
function getChannelBus() {
  if (!instance) instance = new ChannelBus();
  return instance;
}

module.exports = { ChannelBus, getChannelBus };
