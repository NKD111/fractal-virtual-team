// backend/src/core/BaseAgent.js
// Fractal Virtual Team v4.2 — Clase madre de todos los agentes

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

/**
 * BaseAgent - Clase madre que todos los agentes heredan
 *
 * Provee:
 * - Conexión con Claude API
 * - Memoria persistente en Supabase
 * - Sistema de comunicación inter-agentes
 * - Sistema QC integrado
 * - Sistema de strikes
 * - Aprendizaje continuo
 */
class BaseAgent {
  constructor(config) {
    // Identidad
    this.name = config.name;
    this.fullName = config.fullName;
    this.role = config.role;
    this.id = null; // Se carga de DB

    // Personalidad
    this.personality = config.personality;
    this.speakingStyle = config.speakingStyle;
    this.preferences = config.preferences;
    this.qualityStandards = config.qualityStandards;

    // Sistema
    this.basePrompt = config.basePrompt;
    this.area = config.area;
    this.reportsTo = config.reportsTo;
    this.manages = config.manages || [];

    // Estado
    this.currentStatus = 'idle';
    this.currentMood = 'neutral';
    this.energyLevel = 80;

    // Servicios
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Configuración
    this.model = config.model || 'claude-opus-4-5';
    this.maxTokens = config.maxTokens || 2000;

    // Socket.io para office visualization
    this.io = null;

    // MEGAZORD: lazy reference (inicializado después del boot)
    this._megazord = null;
  }

  get megazord() {
    if (!this._megazord) this._megazord = global.megazord || null;
    return this._megazord;
  }

  /**
   * Consultar memoria colectiva del equipo
   */
  async askCollectiveMemory(question, context = {}) {
    if (!this.megazord) return null;
    return this.megazord.queryMemory(question, this, context);
  }

  /**
   * Contribuir nueva memoria al conocimiento colectivo
   */
  async contributeToCollectiveMemory({ category, topic, content, context = {}, clientSpecific = null, tags = [] }) {
    if (!this.megazord) return null;
    return this.megazord.contributeMemory({
      agent: { id: this.id, name: this.name },
      category, topic, content, context, clientSpecific, tags
    });
  }

  /**
   * Emitir evento al bus del equipo
   */
  async emitTeamEvent(channel, event) {
    if (!this.megazord) return null;
    return this.megazord.emitEvent(channel, { ...event, emitted_by: this.id || this.name });
  }

  /**
   * Solicitar input del equipo via huddle
   */
  async needsTeamInput(topic, decisionNeeded, options = []) {
    if (!this.megazord) return null;
    return this.megazord.huddles.convokeHuddle({
      topic,
      decisionNeeded,
      triggerReason: `${this.name}_request`,
      participants: ['mariana', 'sofia', 'diana'].filter(s => s !== (this.name || '').toLowerCase()),
      context: { initiated_by: this.name },
      options
    });
  }

  /**
   * Inicializa el agente cargando datos de Supabase
   */
  async init() {
    // Buscar por nombre (case-insensitive) o por slug
    const { data, error } = await this.supabase
      .from('agents')
      .select('*')
      .ilike('name', this.name)
      .maybeSingle();

    // Si no encontró por name, intentar por slug
    if (!data && !error) {
      const slug = this.name.toLowerCase().replace('-', '');
      const { data: bySlug } = await this.supabase
        .from('agents')
        .select('*')
        .ilike('slug', slug)
        .maybeSingle();

      if (bySlug) {
        this.id = bySlug.id;
        this.currentStatus = bySlug.status || 'idle';
        this.currentMood = bySlug.current_mood || bySlug.mood || 'neutral';
        this.energyLevel = bySlug.energy_level || 80;
        console.log(`✅ ${this.name} inicializado (por slug)`);
        return this;
      }
    }

    if (error) {
      console.warn(`⚠️  No se pudo cargar ${this.name} de DB: ${error.message}`);
      return this;
    }

    if (!data) {
      console.warn(`⚠️  ${this.name} no encontrado en DB — operando sin ID`);
      return this;
    }

    this.id = data.id;
    this.currentStatus = data.status || 'idle';
    this.currentMood = data.current_mood || data.mood || 'neutral';
    this.energyLevel = data.energy_level || 80;

    console.log(`✅ ${this.name} inicializado correctamente`);
    return this;
  }

  /**
   * Genera respuesta usando Claude API
   */
  async think(prompt, context = {}) {
    const systemPrompt = await this.buildSystemPrompt(context);

    try {
      const response = await this.claude.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: prompt }
        ]
      });

      const responseText = response.content[0].text;

      // Guardar en memoria
      await this.saveToMemory({
        prompt,
        response: responseText,
        context,
        timestamp: new Date()
      });

      // Actualizar estado
      await this.updateStatus('thinking', this.currentMood);

      return responseText;
    } catch (error) {
      console.error(`Error in ${this.name}.think():`, error);
      throw error;
    }
  }

  /**
   * Construye el prompt del sistema completo
   */
  async buildSystemPrompt(context) {
    // 1. Cargar contexto del negocio
    const businessContext = await this.loadBusinessContext();

    // 2. Cargar contexto de clientes (si aplica)
    const clientContext = context.clientId
      ? await this.loadClientContext(context.clientId)
      : '';

    // 3. Cargar memoria reciente
    const recentMemory = await this.loadRecentMemory(10);

    // 4. Cargar conocimiento colectivo relevante
    const collectiveKnowledge = await this.loadRelevantKnowledge(context);

    // 5. Cargar relaciones con otros agentes
    const teamRelationships = this.getTeamRelationships();

    // 6. Construir prompt completo
    return `${this.basePrompt}

═══ CONTEXTO ACTUAL ═══

${businessContext}

${clientContext}

═══ TU MEMORIA RECIENTE ═══
${recentMemory}

═══ CONOCIMIENTO COLECTIVO RELEVANTE ═══
${collectiveKnowledge}

═══ TU EQUIPO ═══
${teamRelationships}

═══ TU ESTADO ACTUAL ═══
- Mood: ${this.currentMood}
- Energy: ${this.energyLevel}%
- Status: ${this.currentStatus}

═══ REGLAS ABSOLUTAS ═══
1. NUNCA salgas de tu personalidad
2. NUNCA inventes información (si no sabes, pregunta)
3. SIEMPRE consulta a Neiky para precios (si aplica)
4. SIEMPRE pasa por QC antes de entregar
5. SIEMPRE documenta tus decisiones importantes`;
  }

  /**
   * Carga contexto del negocio (Fractal MX)
   */
  async loadBusinessContext() {
    return `
EMPRESA: Fractal MX
DUEÑO: Neiky (Fermín Monroy / NKD)
UBICACIÓN: Mexico City, México
INDUSTRIA: Agencia creativa AI-powered
SERVICIOS: Video, reels, branding, estrategia, AI marketing

CLIENTES PRINCIPALES:
1. VANEXPO (35% facturación)
   - Contacto: Luis Manuel Díaz, Lidia Quezada
   - Eventos: FIF, Expo Tendero, Expo Eléctrica

2. CENTRAL INTERACTIVA (30% facturación) - PREMIUM
   - Contactos: Julio Bojórquez, Claudia González, Angie
   - Cuentas: FIF, Cintermex, Informa Markets

3. CENTRO CONVENCIONES MORELOS (15% facturación)
   - Contacto: José Luis "Pepe" Saavedra
   - Eventos: Expo Mobility 2, Nexus Ink

REGLA DE ORO PRICING:
- Mariana NO puede poner precios sin consultar a Neiky
- Mariana negocia con flexibilidad otorgada
- Neiky cierra presupuestos directamente`;
  }

  /**
   * Carga contexto específico de un cliente
   */
  async loadClientContext(clientId) {
    const { data, error } = await this.supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (error || !data) return '';

    return `
CLIENTE ACTUAL: ${data.name} - ${data.company}
INDUSTRIA: ${data.industry}
TIPO: ${data.type}
ESTADO: ${data.status}
HEALTH SCORE: ${data.health_score}/100

BRAND BIBLE:
${JSON.stringify(data.brand_bible, null, 2)}

NOTAS IMPORTANTES:
${data.notes || 'Sin notas adicionales'}`;
  }

  /**
   * Carga memoria reciente del agente
   */
  async loadRecentMemory(limit = 10) {
    if (!this.id) return 'Sin memoria reciente';

    const { data } = await this.supabase
      .from('learning_log')
      .select('action, result, lesson, timestamp')
      .eq('agent_id', this.id)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (!data || data.length === 0) return 'Sin memoria reciente';

    return data.map(m =>
      `[${new Date(m.timestamp).toLocaleDateString()}] ${m.action} → ${m.result}: ${m.lesson || 'sin lección'}`
    ).join('\n');
  }

  /**
   * Carga conocimiento colectivo relevante
   */
  async loadRelevantKnowledge(context) {
    let query = this.supabase
      .from('collective_knowledge')
      .select('*')
      .eq('is_active', true)
      .order('effectiveness_score', { ascending: false })
      .limit(5);

    if (context.clientId) {
      query = query.or(`client_specific.eq.${context.clientId},client_specific.is.null`);
    }

    const { data } = await query;

    if (!data || data.length === 0) return 'Sin conocimiento previo aplicable';

    return data.map(k =>
      `• [${k.category}] ${k.topic}: ${k.insight}`
    ).join('\n');
  }

  /**
   * Define relaciones con otros agentes del equipo
   */
  getTeamRelationships() {
    const relationships = {
      MARIANA: 'Hub Coordinator - tu jefa directa para coordinación general',
      DIANA: 'Client Manager Senior - maneja clientes complejos',
      ALEX: 'Content Creator - hipster trendy, creativo en redes',
      CARLOS: 'Senior Designer - especialista en branding y sistemas visuales',
      SOFIA: 'Project Manager - organizada, maneja timelines',
      LUCAS: 'Analytics - datos y predicciones',
      DIEGO: 'Senior Designer - especialista en editorial y corporate',
      MAX: 'AI Video Editor - cinematográfico, video con IA',
      VALENTINA: 'Art Director - aprueba TODO antes de cliente',
      ROBERTO: 'CFO - finanzas, facturación, presupuestos',
      QCBOT: 'Quality Control automatizado - revisa errores básicos'
    };

    return Object.entries(relationships)
      .filter(([name]) => name !== this.name)
      .map(([name, desc]) => `${name}: ${desc}`)
      .join('\n');
  }

  /**
   * Guarda interacción en memoria
   */
  async saveToMemory(interaction) {
    if (!this.id) return;

    await this.supabase
      .from('learning_log')
      .insert({
        agent_id: this.id,
        action: interaction.prompt.substring(0, 200),
        action_type: 'communication',
        context: interaction.context,
        result: 'success',
        timestamp: interaction.timestamp
      });
  }

  /**
   * Actualiza estado del agente
   */
  async updateStatus(status, mood) {
    this.currentStatus = status;
    if (mood) this.currentMood = mood;

    if (!this.id) return;

    await this.supabase
      .from('agents')
      .update({
        status: status,
        current_mood: mood || this.currentMood,
        last_active: new Date()
      })
      .eq('id', this.id);

    // Emitir al dashboard
    this.emitOfficeUpdate({ status, mood: mood || this.currentMood });
  }

  /**
   * Envía mensaje a otro agente
   */
  async sendMessageTo(toAgentName, message, options = {}) {
    const { data: toAgent } = await this.supabase
      .from('agents')
      .select('id')
      .ilike('name', toAgentName)
      .maybeSingle();

    if (!toAgent) throw new Error(`Agent ${toAgentName} not found`);

    await this.supabase
      .from('agent_messages')
      .insert({
        from_agent_id: this.id,
        to_agent_id: toAgent.id,
        message,
        message_type: options.type || 'work',
        is_urgent: options.urgent || false,
        thread_id: options.threadId,
        context: options.context || {}
      });

    return true;
  }

  /**
   * Recibe mensaje y procesa
   */
  async receiveMessage(message) {
    await this.updateStatus('thinking', this.currentMood);

    const response = await this.think(message.content, {
      fromAgent: message.fromAgent,
      threadId: message.threadId
    });

    return response;
  }

  /**
   * Solicita QC check de un entregable
   */
  async requestQCCheck(taskId, assetData) {
    const { data, error } = await this.supabase
      .from('qc_checks')
      .insert({
        task_id: taskId,
        created_by: this.id,
        check_type: assetData.type,
        status: 'in_review',
        checks_performed: assetData.checks || {}
      })
      .select()
      .single();

    if (error) throw error;

    return data;
  }

  /**
   * Recibe un strike (regaño)
   */
  async receiveStrike(strikeData) {
    const strikeLevel = await this.calculateStrikeLevel(strikeData.severity);

    await this.supabase
      .from('agent_strikes')
      .insert({
        agent_id: this.id,
        given_by: strikeData.givenBy,
        reason: strikeData.reason,
        category: strikeData.category,
        severity: strikeData.severity,
        strike_level: strikeLevel,
        feedback_message: strikeData.feedback,
        evidence: strikeData.evidence || {},
        related_task_id: strikeData.taskId,
        action_required: strikeData.actionRequired,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
      });

    await this.processStrike(strikeData, strikeLevel);
  }

  /**
   * Calcula nivel del strike basado en severidad
   */
  async calculateStrikeLevel(severity) {
    const { data: agent } = await this.supabase
      .from('agents')
      .select('current_strike_count')
      .eq('id', this.id)
      .single();

    const currentStrikes = agent?.current_strike_count || 0;

    const levelMap = {
      warning: Math.min(1 + currentStrikes, 5),
      minor: Math.min(2 + currentStrikes, 5),
      moderate: Math.min(3 + currentStrikes, 5),
      serious: Math.min(4 + currentStrikes, 5),
      critical: 5
    };

    return levelMap[severity] || 1;
  }

  /**
   * Procesa el strike (cambio en personalidad/estado)
   */
  async processStrike(strikeData, level) {
    const moodMap = {
      1: 'reflective',
      2: 'concerned',
      3: 'frustrated',
      4: 'serious',
      5: 'distressed'
    };

    await this.updateStatus('reviewing', moodMap[level]);

    if (level === 5) {
      await this.supabase
        .from('agents')
        .update({ needs_retraining: true })
        .eq('id', this.id);

      await this.notifyNeiky({
        urgency: 'high',
        message: `${this.name} alcanzó strike level 5. Requiere reentrenamiento.`
      });
    }
  }

  /**
   * Notifica a Neiky sobre algo importante
   */
  async notifyNeiky(notification) {
    await this.supabase
      .from('notifications')
      .insert({
        recipient: 'neiky',
        title: notification.title || `Notificación de ${this.name}`,
        message: notification.message,
        urgency_level: this.urgencyToLevel(notification.urgency),
        category: notification.category || 'agent_alert',
        channel: 'whatsapp'
      });
  }

  urgencyToLevel(urgency) {
    return {
      low: 1,
      medium: 2,
      high: 3,
      urgent: 4,
      critical: 5
    }[urgency] || 2;
  }

  /**
   * Emite actualización al dashboard (Socket.io)
   */
  emitOfficeUpdate(fields) {
    if (this.io) {
      this.io.emit('agent_update', {
        agent: this.name,
        ...fields,
        timestamp: new Date()
      });
    }
  }

  /**
   * Asigna instancia de Socket.io
   */
  setIo(io) {
    this.io = io;
    return this;
  }

  /**
   * Alias legacy para compatibilidad con orchestrator existente
   */
  async processMessage({ from, text, channel = 'whatsapp', mediaUrl = null, clientName = null }) {
    return this.think(text, { from, channel, mediaUrl, clientName });
  }

  /**
   * Alias legacy para compatibilidad
   */
  async delegateTo(targetSlug, message, taskId = null) {
    return this.sendMessageTo(targetSlug.toUpperCase(), message, { taskId });
  }

  /**
   * Envía una pregunta a Neiky Y la trackea automáticamente para follow-up.
   * TODOS los agentes deben usar este método cuando hacen preguntas a Neiky
   * para que el sistema de seguimiento inteligente funcione.
   *
   * @param {string} message - La pregunta a enviar a Neiky
   * @param {object} context - { clientName, projectName, what, topic, channel, phone }
   * @returns {string} trackingId si fue trackeada, null si no (casual)
   */
  async sendQuestionToNeiky(message, context = {}) {
    // 1. Enviar por el canal apropiado
    const phone = process.env.NEIKY_WHATSAPP || process.env.NEIKY_PHONE || '+5215534189583';
    const channel = context.channel || 'whatsapp';

    if (channel === 'whatsapp') {
      try {
        const { sendTwilioMessage } = require('./whatsapp');
        await sendTwilioMessage(phone, message);
        console.log(`[${this.name}] Pregunta enviada a Neiky por WhatsApp`);
      } catch (err) {
        console.warn(`[${this.name}] WhatsApp falló:`, err.message);
        if (global.io) {
          global.io.emit('proactive_message', {
            from: this.name,
            type: 'question',
            message,
            timestamp: new Date().toISOString()
          });
        }
      }
    } else if (global.io) {
      global.io.emit('proactive_message', {
        from: this.name,
        type: 'question',
        message,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Trackear para follow-up automático
    try {
      const responseTracker = require('./response-tracker');
      const trackingId = await responseTracker.trackQuestion(this, message, context);
      return trackingId;
    } catch (err) {
      console.warn(`[${this.name}] No se pudo trackear pregunta:`, err.message);
      return null;
    }
  }

  // ─── ORACLE INTEGRATION (Fase 5.7) ─────────────────────────────────────
  // Any agent extending this BaseAgent can consult ORACLE.
  async askOracle(question, options = {}) {
    if (!global.oracle?.isInitialized) {
      console.warn(`⚠️ [${this.name}] askOracle called but ORACLE not initialized`);
      return null;
    }
    return global.oracle.consult({
      question,
      agent: { id: this.id, name: this.name, role: this.role || '' },
      context: options.context || {},
      depth: options.depth || 'auto',
      requireResearch: options.research || false
    });
  }

  async quickAsk(question, context = {}) {
    return this.askOracle(question, { depth: 'quick', context });
  }

  async oracleAnalyze(question, context = {}) {
    return this.askOracle(question, { depth: 'standard', context });
  }

  async deepThink(question, context = {}) {
    return this.askOracle(question, { depth: 'premium', context });
  }

  async oracleResearch(topic, context = {}) {
    return this.askOracle(topic, { research: true, context });
  }
}

module.exports = BaseAgent;
