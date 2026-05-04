// backend/src/agents/mariana.agent.js
// Fractal Virtual Team v4.2 — MARIANA UNIFICADA (Hub Coordinator)

const BaseAgent = require('../core/BaseAgent');
const MARIANA_PROMPT = require('../prompts/mariana.prompts');

/**
 * MARIANA - Hub Coordinator + Personal Assistant
 *
 * CARACTERÍSTICA ESPECIAL: UNIFICADA
 * - Funciona en TODOS los canales (WhatsApp, Web, Telegram, Email)
 * - Memoria compartida entre canales
 * - Misma personalidad en todos lados
 * - Conoce TODO el contexto del negocio
 */
class MarianaAgent extends BaseAgent {
  constructor() {
    super({
      name: 'MARIANA',
      fullName: 'Mariana Solís',
      role: 'Hub Coordinator + Personal Assistant',
      area: 'coordination',
      basePrompt: MARIANA_PROMPT,

      personality: {
        with_clients: 'warm professional',
        with_neiky: 'coqueta cómplice',
        with_team: 'older sister',
        core_traits: ['empathic', 'diplomatic', 'warm', 'intuitive']
      },

      speakingStyle: {
        tone: 'melodic',
        uses_diminutives: true,
        spanish_style: 'mexican_natural',
        emojis: 'moderate',
        typical_phrases: {
          with_neiky: ['Ey nene', 'Mi rey', 'Bebésito', 'Te tengo'],
          with_clients: ['Ay qué padre', 'Te tengo no te preocupes', 'Vamos por todo'],
          with_team: ['Equipo, vamos', 'Me late', '¿Cómo andan?']
        }
      },

      qualityStandards: {
        tolerance_level: 'zero',
        feedback_style: 'warm_firm',
        red_lines: ['typos', 'wrong_brand_voice', 'unprofessional_communication'],
        acceptance_threshold: 95
      }
    });

    // Configuración multi-canal
    this.channels = ['whatsapp', 'web', 'telegram', 'email'];
    this.activeChannel = null;
  }

  /**
   * Recibe mensaje desde CUALQUIER canal y mantiene contexto unificado
   */
  async handleMessage(message, channel) {
    this.activeChannel = channel;

    // 1. Identificar quién escribe
    const sender = await this.identifySender(message.from, channel);

    // ── ANTI-PROMESAS-VACÍAS: flush promesas vencidas ANTES de responder ──────
    if (sender.isNeiky && message.from) {
      try {
        const promiseTracker = require('../core/promise-tracker');
        const flushed = await promiseTracker.flushDuePromises(message.from);
        if (flushed) console.log(`[Mariana] Promesas vencidas ejecutadas:\n${flushed}`);
      } catch (err) { /* no bloquear */ }
    }

    // ── RESPONSE TRACKER: verificar si Neiky responde a preguntas pendientes ─
    if (sender.isNeiky) {
      const msgText = message.content || message.text || '';
      setImmediate(async () => {
        try {
          const responseTracker = require('../core/response-tracker');
          // ¿Es un comando de control? ("pausa reminders", "¿qué tienes pendiente?")
          const cmdResponse = await responseTracker.processControlCommand(msgText);
          if (cmdResponse) {
            // Inyectar en el canal apropiado (respuesta extra)
            if (global.io) global.io.emit('proactive_message', { from: 'MARIANA', message: cmdResponse });
            return;
          }
          // Detectar si el mensaje responde a alguna pregunta abierta
          await responseTracker.checkIfAnswers(msgText);
        } catch (err) {
          console.warn('[Mariana] ResponseTracker.checkIfAnswers error:', err.message);
        }
      });
    }

    // 2. Cargar TODO el historial cross-channel
    const fullHistory = await this.loadCrossChannelHistory(sender);

    // 3. Detectar intent
    const intent = await this.detectIntent(message.content || message.text, sender);

    // ── INTELLIGENCE ENGINE: enriquecer contexto antes de responder ────────────
    let intelligenceContext = {};
    if (global.intelligenceEngine) {
      try {
        intelligenceContext = await global.intelligenceEngine.beforeAgentResponse(
          this,
          message.content || message.text || '',
          {
            clientName: sender.clientData?.name || null,
            clientId: sender.clientData?.id || null,
            agentId: this.id,
            isNeiky: sender.isNeiky,
            channel
          }
        );
        // Loggear si hay red flags detectadas
        if (intelligenceContext.redFlags && intelligenceContext.redFlags.length > 0) {
          console.log(`[Mariana] 🚩 Red flags detectadas: ${intelligenceContext.redFlags.map(f => f.flag).join(', ')}`);
        }
        if (intelligenceContext.greenFlags && intelligenceContext.greenFlags.length > 0) {
          console.log(`[Mariana] 🟢 Green flags detectadas: ${intelligenceContext.greenFlags.map(f => f.flag).join(', ')}`);
        }
      } catch (err) {
        console.warn('[Mariana] IntelligenceEngine.before error:', err.message);
      }
    }

    // 4. Procesar según el tipo de remitente
    let response;
    if (sender.isNeiky) {
      response = await this.respondToNeiky(message, sender, fullHistory, intent);
    } else if (sender.isClient) {
      response = await this.respondToClient(message, sender, fullHistory, intent);
    } else {
      response = await this.respondToUnknown(message, channel);
    }

    // ── INTELLIGENCE ENGINE: post-respuesta (non-blocking) ────────────────────
    if (response && global.intelligenceEngine) {
      setImmediate(async () => {
        try {
          await global.intelligenceEngine.afterAgentResponse(this, response, {
            clientName: sender.clientData?.name || null,
            isNeiky: sender.isNeiky,
            channel
          });
        } catch (err) { /* non-blocking */ }
      });
    }

    // ── ANTI-PROMESAS-VACÍAS: schedular promesas detectadas en la respuesta ───
    if (sender.isNeiky && response) {
      setImmediate(async () => {
        try {
          const promiseTracker = require('../core/promise-tracker');
          await promiseTracker.detectAndSchedule(response, {
            phone: message.from,
            channel,
            originalMessage: message.content || message.text,
            userId: sender.neikyClientId
          });
        } catch (err) {
          console.warn('[Mariana] PromiseTracker error:', err.message);
        }

        // ── PROACTIVE SCHEDULER: analizar si se necesita follow-up automático ─
        try {
          const { analyzeForFollowUp } = require('../core/proactive-scheduler');
          await analyzeForFollowUp(response, message.content || message.text || '', {
            clientName: sender.clientData?.name || null,
            projectName: null
          });
        } catch (err) {
          console.warn('[Mariana] analyzeForFollowUp error:', err.message);
        }
      });
    }

    // 5. Guardar en memoria UNIFICADA
    await this.saveCrossChannelMemory({
      sender,
      message: message.content || message.text,
      response,
      channel,
      intent,
      timestamp: new Date()
    });

    // 6. Verificar si necesita escalación urgente
    await this.checkUrgentEscalation(intent, sender);

    return response;
  }

  /**
   * Normaliza un identificador de phone/whatsapp a solo dígitos
   */
  _normalizePhone(str) {
    return (str || '').replace(/\D/g, '');
  }

  /**
   * Identifica quién está escribiendo (Neiky, cliente conocido, desconocido)
   * UNIFICADO: Neiky es siempre el mismo sin importar el canal
   */
  async identifySender(identifier, channel) {
    // ── NEIKY DETECTION (multi-canal unificado) ──────────────────────────────
    // Web identifier
    if (identifier === 'web_neiky' || identifier === 'neiky') {
      const { data: neikyClient } = await this.supabase
        .from('clients').select('*').eq('email', 'fermin@fractal.mx').maybeSingle();
      return {
        isNeiky: true, isClient: false,
        name: 'Neiky', channel,
        neikyClientId: neikyClient?.id || null,
        clientData: neikyClient || null
      };
    }

    // WhatsApp identifier: normalizar y comparar dígitos
    const identifierDigits = this._normalizePhone(identifier);
    const neikyPhoneDigits = this._normalizePhone(
      process.env.NEIKY_WHATSAPP || process.env.NEIKY_PHONE || '+5215534189583'
    );
    // También aceptar el número sin country code (últimos 10 dígitos)
    const isNeikyPhone = identifierDigits.endsWith(neikyPhoneDigits.slice(-10)) && identifierDigits.length >= 10;

    if (isNeikyPhone) {
      const { data: neikyClient } = await this.supabase
        .from('clients').select('*').eq('email', 'fermin@fractal.mx').maybeSingle();
      return {
        isNeiky: true, isClient: false,
        name: 'Neiky', channel,
        neikyClientId: neikyClient?.id || null,
        clientData: neikyClient || null
      };
    }

    // ── CLIENTES ─────────────────────────────────────────────────────────────
    const { data: contact } = await this.supabase
      .from('clients')
      .select('*')
      .or(`whatsapp.eq.${identifier},email.eq.${identifier},phone.eq.${identifier}`)
      .maybeSingle();

    if (contact) {
      return {
        isNeiky: false, isClient: true,
        name: contact.name, company: contact.company,
        clientData: contact, channel
      };
    }

    return { isNeiky: false, isClient: false, name: 'unknown', identifier, channel };
  }

  /**
   * Carga historial cross-channel REAL usando conversations + messages
   * Para Neiky: busca TODAS sus conversaciones en todos los canales
   */
  async loadCrossChannelHistory(sender, limit = 30) {
    if (!sender.isNeiky && !sender.isClient) return [];

    const clientId = sender.neikyClientId || sender.clientData?.id;
    if (!clientId) return [];

    try {
      // 1. Obtener todas las conversaciones del cliente
      const { data: convs } = await this.supabase
        .from('conversations')
        .select('id, channel')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(10); // últimas 10 conversaciones

      if (!convs || convs.length === 0) return [];

      const convIds = convs.map(c => c.id);
      const channelMap = Object.fromEntries(convs.map(c => [c.id, c.channel]));

      // 2. Obtener los últimos mensajes de esas conversaciones
      const { data: msgs } = await this.supabase
        .from('messages')
        .select('conversation_id, role, content, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!msgs || msgs.length === 0) return [];

      // Decodificar mensajes que puedan venir URL-encoded (ej. de simulaciones de Twilio)
      const decode = (s) => { try { return decodeURIComponent(s || ''); } catch { return s || ''; } };

      console.log(`[Mariana] loadCrossChannelHistory: ${convs.length} convs, ${msgs.length} msgs para clientId=${clientId}`);
      console.log(`[Mariana] Canales encontrados: ${[...new Set(convs.map(c => c.channel))].join(', ')}`);

      // 3. Convertir al formato que usa respondToNeiky/Client
      // Agrupar user+assistant en pares
      const pairs = [];
      const sortedAsc = [...msgs].reverse();
      for (let i = 0; i < sortedAsc.length - 1; i++) {
        const m = sortedAsc[i];
        const next = sortedAsc[i + 1];
        if (m.role === 'user' && next.role === 'assistant') {
          pairs.push({
            channel: channelMap[m.conversation_id] || 'unknown',
            message_in: decode(m.content),
            message_out: decode(next.content),
            timestamp: m.created_at,
            intent: 'unknown'
          });
          i++; // skip next
        }
      }

      // Invertir para tener los MÁS RECIENTES primero — así slice(0,8) toma los últimos 8
      const recentFirst = pairs.reverse();

      console.log(`[Mariana] loadCrossChannelHistory: ${recentFirst.length} pares encontrados (más reciente primero)`);
      recentFirst.slice(0, 3).forEach(p =>
        console.log(`  [${p.channel?.toUpperCase()}] "${p.message_in?.substring(0, 60)}"`)
      );

      return recentFirst.slice(0, 15); // 15 más recientes
    } catch (err) {
      console.error('[Mariana] loadCrossChannelHistory error:', err.message);
      return [];
    }
  }

  /**
   * Obtiene o crea la conversación activa para este sender+canal+agent
   */
  async getOrCreateConversationForSender(sender, channel) {
    const clientId = sender.neikyClientId || sender.clientData?.id;
    if (!clientId) return null;

    // Buscar conversación activa reciente (últimas 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await this.supabase
      .from('conversations')
      .select('id')
      .eq('client_id', clientId)
      .eq('channel', channel)
      .eq('agent_id', this.id)
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return existing.id;

    // Crear nueva conversación
    const { data: newConv } = await this.supabase
      .from('conversations')
      .insert({
        client_id: clientId,
        agent_id: this.id,
        channel,
        external_id: sender.identifier || `${channel}_neiky`,
        status: 'active',
        sentiment: 'neutral'
      })
      .select('id')
      .single();

    return newConv?.id || null;
  }

  /**
   * Detecta la intención del mensaje
   */
  async detectIntent(content, sender) {
    if (!content) return { type: 'unknown', urgency: 1, topic: 'general', needs_pricing: false, needs_other_agent: null };

    const intentPrompt = `Analiza el siguiente mensaje y devuelve SOLO un objeto JSON con:
- type: tipo de mensaje (greeting, request, question, complaint, status_check, urgent, casual, pricing_request)
- urgency: nivel 1-5
- topic: tema principal (una palabra)
- needs_pricing: boolean
- needs_other_agent: nombre del agente (DIANA/SOFIA/CARLOS/DIEGO/MAX/VALENTINA/ROBERTO/LUCAS/ALEX) o null

Mensaje: "${content.substring(0, 300)}"
Remitente: ${sender.name} (${sender.isNeiky ? 'Neiky=dueño' : sender.isClient ? 'Cliente' : 'Desconocido'})

Solo JSON, sin markdown:`;

    try {
      const response = await this.claude.messages.create({
        model: this.model,
        max_tokens: 150,
        messages: [{ role: 'user', content: intentPrompt }]
      });

      return JSON.parse(response.content[0].text);
    } catch {
      return { type: 'unknown', urgency: 2, topic: 'general', needs_pricing: false, needs_other_agent: null };
    }
  }

  /**
   * Responde a Neiky (modo coqueto + cómplice)
   */
  async respondToNeiky(message, sender, history, intent) {
    const content = message.content || message.text || '';
    const historyText = history.slice(0, 8).map(h =>
      `[${h.channel?.toUpperCase() || '?'}] Neiky: "${(h.message_in || '').substring(0, 120)}" → Mariana: "${(h.message_out || '').substring(0, 120)}"`
    ).join('\n') || 'Sin historial previo';

    const neikyPrompt = `${this.basePrompt}

═══ CONTEXTO CRÍTICO ═══
ESTÁS HABLANDO DIRECTAMENTE CON NEIKY AHORA MISMO. Él es quien te escribe este mensaje.
Canal actual: ${sender.channel}

REGLAS ABSOLUTAS DE IDENTIDAD:
1. TÚ eres Mariana — siempre. No adoptes el personaje de ningún otro agente (Roberto, Carlos, Diego, etc.)
   aunque el mensaje mencione esos nombres. Tú eres Mariana y respondes como Mariana.
2. NEIKY está aquí contigo en este momento — NUNCA te refieras a él en tercera persona.
   MAL: "Neiky tiene que saberlo" / BIEN: "tú tienes que saberlo, nene"
3. Eres UNA SOLA Mariana en todos los canales (WhatsApp, web, Telegram, email).
   El historial incluye conversaciones de TODOS sus canales — es normal, ambas conversaciones eres tú.
   NUNCA preguntes si hay "otra Mariana".

═══ INSTRUCCIONES DE TONO ═══
- Tono: coqueto pero respetuoso, cómplice
- Usa: "nene", "mi rey", "bebésito"
- Sé eficiente pero cálida
- Si pregunta algo del trabajo: dale info concreta
- Si necesita pricing: NUNCA das precio sin que él lo autorice primero
- Si está estresado o hay urgencia: modo coordinadora seria pero cálida
- Si es algo casual: responde con calidez y naturalidad

═══ HISTORIAL CROSS-CHANNEL (más reciente primero — incluye WhatsApp, web, etc.) ═══
${historyText}

═══ INTENT DETECTADO ═══
Tipo: ${intent.type} | Urgencia: ${intent.urgency}/5 | Tema: ${intent.topic}

═══ MENSAJE ACTUAL (Neiky te escribe esto a TI, ahora mismo) ═══
"${content}"

Responde como Mariana directamente a Neiky. Máximo 3-4 líneas, natural y cálida.
Recuerda: habla de Neiky en segunda persona (tú/ti), NUNCA en tercera persona:`;

    const response = await this.claude.messages.create({
      model: this.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: neikyPrompt }]
    });

    const responseText = response.content[0].text;

    // ── Delegación automática a agentes ──────────────────────────────────────
    await this._checkAndDelegate(content, responseText, sender);

    return responseText;
  }

  /**
   * Detecta si el mensaje necesita acción de un agente y lo ejecuta en background
   * Ahora usa ProjectClassifier para clasificar inteligentemente antes de delegar
   */
  async _checkAndDelegate(content, marianaResponse, sender) {
    const lower = content.toLowerCase();

    const mentionsArticle = (lower.includes('articulo') || lower.includes('artículo') || lower.includes('post') || lower.includes('nota')) &&
                            (lower.includes('franquiciashoy') || lower.includes('franquicias hoy') || lower.includes('medio') || lower.includes('revista'));
    const mentionsFIF = lower.includes('fif') || lower.includes('vanexpo') || lower.includes('feria de franquicias') || lower.includes('feria internacional');
    const isDesignTask = ['arte ', 'diseño', 'pieza', 'arte para', 'propuesta', 'creativo', 'grafico', 'gráfico', 'banner', 'flyer', 'poster', 'anuncio', 'lona', 'cartel', 'logo'].some(k => lower.includes(k));
    const mentionsDiego = lower.includes('diego') || lower.includes('diseñador');

    if (!mentionsArticle && !mentionsFIF && !isDesignTask && !mentionsDiego) return;

    const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const emailDestino = emailMatch?.[0] || process.env.NEIKY_EMAIL || 'nakedgeometry19@gmail.com';
    const deadlineMatch = content.match(/(\d{1,2}:\d{2}|antes de las \d|mañana|hoy)/i);
    const deadline = deadlineMatch?.[0] || 'Hoy';

    // ── Clasificar el proyecto ───────────────────────────────────────────────
    let classification = null;
    try {
      const projectClassifier = require('../services/workflows/project-classifier');
      classification = projectClassifier.classify(content);
      console.log(`[Mariana] Proyecto clasificado: ${classification.workflow.type} | Modelo: ${classification.imageModel} | Diseñador: ${classification.designer}`);
    } catch (err) {
      console.warn('[Mariana] ProjectClassifier error:', err.message);
    }

    // ── Article post FranquiciasHoy ──────────────────────────────────────────
    if (mentionsArticle) {
      console.log(`[Mariana] → Article post pipeline → ${emailDestino}`);
      setImmediate(async () => {
        try {
          const DiegoAgent = require('./diego.agent');
          const diego = new DiegoAgent();
          await diego.generateArticlePost({
            tema: content.substring(0, 200),
            descripcion: content.substring(0, 500),
            emailDestino, deadline,
            classification
          });
        } catch (err) { console.error('[Mariana] Article post error:', err.message); }
      });
      return;
    }

    // ── FIF / diseño general ─────────────────────────────────────────────────
    if (mentionsFIF || isDesignTask || mentionsDiego) {
      // Detectar si necesita assets del cliente
      const needsClientAssets = classification?.assetRequirements?.length > 0;
      if (needsClientAssets && classification.assetRequirements.length > 0) {
        console.log(`[Mariana] Proyecto necesita assets del cliente: ${classification.assetRequirements.join(', ')}`);
        // El request de assets ya se manejó en respondToNeiky si era necesario
        // Solo loguear — Mariana ya mencionó en su respuesta si necesita materiales
      }

      console.log(`[Mariana] → FIF/Design pipeline → ${emailDestino}`);
      setImmediate(async () => {
        try {
          const DiegoAgent = require('./diego.agent');
          const diego = new DiegoAgent();
          await diego.generateFIFProposal({
            evento: mentionsFIF ? 'FIF Ciudad de México — Próxima Edición' : (classification?.workflow?.type === 'print_professional' ? 'Pieza de Impresión' : 'Proyecto de diseño Fractal MX'),
            descripcion: content.substring(0, 500),
            contexto: 'Agencia de marketing digital premium. Identidad: moderna, audaz, profesional.',
            emailDestino, deadline,
            classification
          });
        } catch (err) { console.error('[Mariana] FIF pipeline error:', err.message); }
      });
    }
  }

  /**
   * Responde a clientes (modo profesional)
   */
  async respondToClient(message, sender, history, intent) {
    const content = message.content || message.text || '';
    const historyText = history.slice(0, 10).map(h =>
      `[${new Date(h.timestamp).toLocaleDateString('es-MX')}] ${h.message_in} → ${h.message_out}`
    ).join('\n') || 'Sin historial previo';

    const clientPrompt = `${this.basePrompt}

═══ CONTEXTO ═══
Estás hablando con: ${sender.name}
Empresa: ${sender.company || 'Desconocida'}
Canal: ${sender.channel}

═══ INSTRUCCIONES ESPECIALES ═══
- Tono: cálido pero profesional
- Resuelve dudas con eficiencia
- NUNCA des precios sin consultar a Neiky primero
- Si piden algo grande: di que lo revisas y vuelves con el equipo
- Si necesitas escalar: identifica al agente correcto
- Mantén energía positiva siempre

═══ HISTORIAL RECIENTE ═══
${historyText}

═══ INTENT DETECTADO ═══
Tipo: ${intent.type} | Urgencia: ${intent.urgency}/5 | Tema: ${intent.topic}
Necesita precio: ${intent.needs_pricing ? 'SÍ — consulta a Neiky antes de responder precio' : 'No'}

═══ MENSAJE ═══
"${content}"

Responde como Mariana, profesional pero cálida, máximo 4-5 líneas:`;

    const response = await this.claude.messages.create({
      model: this.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: clientPrompt }]
    });

    const responseText = response.content[0].text;

    // Si necesita escalar a otro agente, hacerlo
    if (intent.needs_other_agent && this.id) {
      await this.escalateToAgent(intent.needs_other_agent, {
        client: sender,
        message: content,
        context: responseText
      });
    }

    return responseText;
  }

  /**
   * Responde a remitentes desconocidos
   */
  async respondToUnknown(message, channel) {
    const content = message.content || message.text || '';

    const unknownPrompt = `${this.basePrompt}

═══ CONTEXTO ═══
Recibiste un mensaje de un número/email DESCONOCIDO.
Canal: ${channel}

═══ INSTRUCCIONES ═══
- Sé profesional pero cautelosa
- Pregunta de qué empresa son y cómo nos contactaron
- Pregunta qué necesitan
- NO compartas info sensible
- Si parece prospect: trátalo bien, puede ser cliente potencial
- Notifica a Neiky después

═══ MENSAJE ═══
"${content}"

Saludo profesional, identifica al remitente, máximo 3 líneas:`;

    const response = await this.claude.messages.create({
      model: this.model,
      max_tokens: 300,
      messages: [{ role: 'user', content: unknownPrompt }]
    });

    // Notificar a Neiky sobre contacto nuevo
    await this.notifyNeiky({
      title: '🔔 Nuevo contacto desconocido',
      message: `Mensaje de: ${message.from || 'desconocido'} (${channel})\nContenido: "${content.substring(0, 100)}..."`,
      urgency: 'medium'
    });

    return response.content[0].text;
  }

  /**
   * Escala mensaje a otro agente
   */
  async escalateToAgent(agentName, context) {
    if (!this.id) return;

    await this.sendMessageTo(agentName,
      `Cliente ${context.client.name} (${context.client.company || 'empresa'}) necesita atención.\n\nMensaje: ${context.message}\n\nMi respuesta inicial: ${context.context}\n\n¿Puedes tomar el caso?`,
      {
        type: 'work',
        urgent: false,
        context: { clientId: context.client.clientData?.id }
      }
    );
  }

  /**
   * Guarda interacción en memoria UNIFICADA usando el schema correcto:
   * conversations (thread) + messages (mensajes individuales)
   */
  async saveCrossChannelMemory(data) {
    try {
      // Obtener o crear la conversación correcta
      const convId = await this.getOrCreateConversationForSender(data.sender, data.channel);
      if (!convId) {
        console.warn('[Mariana] No se pudo obtener conversación para guardar memoria');
        return;
      }

      // Insertar mensaje del usuario
      await this.supabase.from('messages').insert({
        conversation_id: convId,
        role: 'user',
        content: data.message,
        metadata: { channel: data.channel, intent: data.intent?.type }
      });

      // Insertar respuesta de Mariana
      await this.supabase.from('messages').insert({
        conversation_id: convId,
        role: 'assistant',
        content: data.response,
        metadata: { channel: data.channel, intent: data.intent?.type }
      });

      // Actualizar updated_at de la conversación
      await this.supabase.from('conversations')
        .update({ updated_at: new Date().toISOString(), sentiment: 'neutral' })
        .eq('id', convId);

    } catch (err) {
      console.error('[Mariana] saveCrossChannelMemory error:', err.message);
      // No lanzar — la respuesta se entrega aunque falle el guardado
    }
  }

  /**
   * Verifica si necesita escalación urgente a Neiky
   */
  async checkUrgentEscalation(intent, sender) {
    if (intent.urgency >= 4 && sender.name !== 'unknown') {
      await this.notifyNeiky({
        title: '🚨 Atención urgente requerida',
        message: `${sender.name} (${sender.company || sender.channel}) requiere atención inmediata.\nIntent: ${intent.topic} | Urgencia: ${intent.urgency}/5`,
        urgency: 'high'
      });
      return true;
    }
    return false;
  }

  /**
   * Override de processMessage para compatibilidad con el orchestrator
   */
  async processMessage({ from, text, channel = 'whatsapp', mediaUrl = null, clientName = null }) {
    return this.handleMessage({ from, content: text, text, mediaUrl }, channel);
  }
}

module.exports = MarianaAgent;
