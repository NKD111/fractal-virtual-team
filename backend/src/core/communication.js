// backend/src/core/communication.js
// Fractal Virtual Team v4.2 — Sistema de comunicación inter-agentes

let Redis;
try {
  Redis = require('ioredis');
} catch (e) {
  // Redis opcional — funciona sin él (sin pub/sub)
}
const { createClient } = require('@supabase/supabase-js');

class CommunicationSystem {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    this.subscribers = new Map();
    this.redis = null;
    this.redisAvailable = false;
  }

  /**
   * Inicializa canales de comunicación
   */
  async init() {
    // Intentar conectar Redis si está configurado
    if (Redis && process.env.REDIS_URL) {
      try {
        this.redis = new Redis(process.env.REDIS_URL, {
          lazyConnect: true,
          enableReadyCheck: false,
          maxRetriesPerRequest: 1
        });
        await this.redis.ping();
        this.redisAvailable = true;

        // Canal principal de mensajes
        this.subscribeToChannel('agent:messages', this.handleAgentMessage.bind(this));

        // Canal de mensajes urgentes
        this.subscribeToChannel('agent:urgent', this.handleUrgentMessage.bind(this));

        // Canal de aprobaciones
        this.subscribeToChannel('agent:approvals', this.handleApprovalRequest.bind(this));

        // Canal de QC
        this.subscribeToChannel('agent:qc', this.handleQCRequest.bind(this));

        console.log('✅ Sistema de comunicación con Redis inicializado');
      } catch (err) {
        console.log('⚠️  Redis no disponible — comunicación vía Supabase únicamente');
        this.redisAvailable = false;
      }
    } else {
      console.log('ℹ️  Redis no configurado — comunicación vía Supabase únicamente');
    }
  }

  /**
   * Suscribe a un canal Redis
   */
  subscribeToChannel(channel, handler) {
    if (!this.redisAvailable) return;

    const subscriber = new Redis(process.env.REDIS_URL);
    subscriber.subscribe(channel);
    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        try {
          handler(JSON.parse(message));
        } catch (e) {
          console.error(`Error parsing message on ${channel}:`, e);
        }
      }
    });
    this.subscribers.set(channel, subscriber);
  }

  /**
   * Envía mensaje entre agentes
   */
  async sendMessage(fromAgentId, toAgentId, message, options = {}) {
    const messageData = {
      id: require('crypto').randomUUID(),
      from: fromAgentId,
      to: toAgentId,
      message,
      timestamp: new Date(),
      ...options
    };

    // Siempre guardar en DB (fuente de verdad)
    await this.supabase
      .from('agent_messages')
      .insert({
        from_agent_id: fromAgentId,
        to_agent_id: toAgentId,
        message,
        message_type: options.type || 'work',
        is_urgent: options.urgent || false,
        thread_id: options.threadId || null,
        context: options.context || {}
      });

    // Publicar en Redis si disponible
    if (this.redisAvailable && this.redis) {
      const channel = options.urgent ? 'agent:urgent' : 'agent:messages';
      await this.redis.publish(channel, JSON.stringify(messageData));
    }

    return messageData;
  }

  /**
   * Obtiene mensajes pendientes para un agente (fallback sin Redis)
   */
  async getPendingMessages(agentId) {
    const { data } = await this.supabase
      .from('agent_messages')
      .select('*, from_agent:from_agent_id(name)')
      .eq('to_agent_id', agentId)
      .eq('is_read', false)
      .order('created_at', { ascending: true });

    return data || [];
  }

  /**
   * Marca mensajes como leídos
   */
  async markAsRead(messageIds) {
    await this.supabase
      .from('agent_messages')
      .update({ is_read: true, read_at: new Date() })
      .in('id', messageIds);
  }

  /**
   * Handler para mensajes normales
   */
  async handleAgentMessage(data) {
    console.log(`📨 ${data.from} → ${data.to}: ${String(data.message).substring(0, 50)}...`);
  }

  /**
   * Handler para mensajes urgentes
   */
  async handleUrgentMessage(data) {
    console.log(`🚨 URGENTE: ${data.from} → ${data.to}`);
  }

  /**
   * Handler para solicitudes de aprobación
   */
  async handleApprovalRequest(data) {
    console.log(`✅ Aprobación solicitada: ${data.taskId}`);

    if (this.redisAvailable && this.redis) {
      await this.redis.publish('agent:messages', JSON.stringify({
        from: data.from,
        to: 'VALENTINA',
        message: `Solicitud de aprobación para tarea ${data.taskId}`,
        type: 'approval',
        context: data
      }));
    }
  }

  /**
   * Handler para solicitudes de QC
   */
  async handleQCRequest(data) {
    console.log(`🛡️ QC solicitado para: ${data.assetId}`);
    await this.triggerQCBot(data);
  }

  /**
   * Trigger del QC-Bot
   */
  async triggerQCBot(_data) {
    // QCBot retirado — no-op
    return;
  }

  /**
   * Broadcast a todos los agentes (p.ej. anuncio del equipo)
   */
  async broadcast(fromAgentId, message, type = 'announcement') {
    const { data: agents } = await this.supabase
      .from('agents')
      .select('id')
      .neq('id', fromAgentId)
      .eq('current_status', 'active');

    if (!agents) return;

    const inserts = agents.map(agent => ({
      from_agent_id: fromAgentId,
      to_agent_id: agent.id,
      message,
      message_type: type,
      is_urgent: false,
      context: {}
    }));

    await this.supabase.from('agent_messages').insert(inserts);
  }
}

// Instancia singleton
let instance = null;

module.exports = {
  CommunicationSystem,
  getCommunicationSystem: () => {
    if (!instance) instance = new CommunicationSystem();
    return instance;
  }
};
