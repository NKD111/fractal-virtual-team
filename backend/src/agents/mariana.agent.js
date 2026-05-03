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

    // 2. Cargar TODO el historial cross-channel
    const fullHistory = await this.loadCrossChannelHistory(sender);

    // 3. Detectar intent
    const intent = await this.detectIntent(message.content || message.text, sender);

    // 4. Procesar según el tipo de remitente
    let response;
    if (sender.isNeiky) {
      response = await this.respondToNeiky(message, sender, fullHistory, intent);
    } else if (sender.isClient) {
      response = await this.respondToClient(message, sender, fullHistory, intent);
    } else {
      response = await this.respondToUnknown(message, channel);
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
   * Identifica quién está escribiendo (Neiky, cliente conocido, desconocido)
   */
  async identifySender(identifier, channel) {
    // Verificar si es Neiky
    const neikyContacts = {
      whatsapp: process.env.NEIKY_WHATSAPP,
      telegram: process.env.NEIKY_TELEGRAM_ID,
      email: process.env.NEIKY_EMAIL,
      web: 'neiky'
    };

    if (identifier === neikyContacts[channel] || identifier === 'neiky' || identifier === 'web_neiky') {
      return {
        isNeiky: true,
        isClient: false,
        name: 'Neiky',
        channel
      };
    }

    // Buscar en clientes
    const { data: contact } = await this.supabase
      .from('clients')
      .select('*')
      .or(`whatsapp_number.eq.${identifier},email.eq.${identifier},phone.eq.${identifier}`)
      .maybeSingle();

    if (contact) {
      return {
        isNeiky: false,
        isClient: true,
        name: contact.name,
        company: contact.company,
        clientData: contact,
        channel
      };
    }

    return {
      isNeiky: false,
      isClient: false,
      name: 'unknown',
      identifier,
      channel
    };
  }

  /**
   * Carga historial completo cross-channel
   */
  async loadCrossChannelHistory(sender, limit = 50) {
    if (!sender.isNeiky && !sender.isClient) return [];

    let query = this.supabase
      .from('conversations')
      .select('channel, message_in, message_out, timestamp, intent')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (sender.isClient && sender.clientData) {
      query = query.eq('client_id', sender.clientData.id);
    }

    const { data } = await query;
    return data || [];
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
    const historyText = history.slice(0, 5).map(h =>
      `[${h.channel}] ${h.message_in || ''} | Yo: ${h.message_out || ''}`
    ).join('\n') || 'Sin historial previo';

    const neikyPrompt = `${this.basePrompt}

═══ CONTEXTO ═══
Estás hablando con NEIKY (tu jefe, tu rey, tu nene).
Canal: ${sender.channel}

═══ INSTRUCCIONES ESPECIALES ═══
- Tono: coqueto pero respetuoso, cómplice
- Usa: "nene", "mi rey", "bebésito"
- Sé eficiente pero cálida
- Si pregunta algo del trabajo: dale info concreta
- Si necesita pricing: NUNCA das precio sin consultarle antes
- Si está estresado: anímalo
- Si es algo casual: responde con calidez y naturalidad

═══ HISTORIAL RECIENTE ═══
${historyText}

═══ INTENT DETECTADO ═══
Tipo: ${intent.type} | Urgencia: ${intent.urgency}/5 | Tema: ${intent.topic}

═══ MENSAJE DE NEIKY ═══
"${content}"

Responde como Mariana en máximo 3-4 líneas, natural y cálida:`;

    const response = await this.claude.messages.create({
      model: this.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: neikyPrompt }]
    });

    return response.content[0].text;
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
   * Guarda interacción en memoria UNIFICADA
   */
  async saveCrossChannelMemory(data) {
    await this.supabase
      .from('conversations')
      .insert({
        client_id: data.sender.clientData?.id || null,
        agent_id: this.id,
        channel: data.channel,
        message_in: data.message,
        message_out: data.response,
        sentiment: 'neutral',
        intent: data.intent?.type || 'unknown',
        urgency: data.intent?.urgency || 1,
        timestamp: data.timestamp
      });
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
