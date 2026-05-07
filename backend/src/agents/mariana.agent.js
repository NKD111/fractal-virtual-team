// backend/src/agents/mariana.agent.js
// Fractal Virtual Team v4.2 — MARIANA UNIFICADA (Hub Coordinator)
// BLOQUE C: Transparencia IA + Protocolo de Brief

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

    // 4. Detectar comandos de control de NKD (Panel de Control por WhatsApp)
    if (sender.isNeiky) {
      const cmdResult = await this.executeNKDCommand(message.content || message.text || '', message);
      if (cmdResult !== null) {
        // Fue un comando — respuesta directa, no pasar por LLM
        return cmdResult;
      }
    }

    // 5. Procesar según el tipo de remitente
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

    // 6. Verificar si necesita escalación urgente (non-blocking — nunca bloquear la respuesta)
    this.checkUrgentEscalation(intent, sender).catch(err =>
      console.warn('[Mariana] checkUrgentEscalation:', err.message)
    );

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
      const neikyEmails = ['fermin@fractal.mx', process.env.NEIKY_EMAIL || 'nakedgeometry19@gmail.com'];
      let neikyClient = null;
      for (const email of neikyEmails) {
        const { data } = await this.supabase.from('clients').select('*').eq('email', email).maybeSingle();
        if (data) { neikyClient = data; break; }
      }
      return {
        isNeiky: true, isClient: false,
        name: 'Neiky', channel,
        identifier,
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
      // Buscar el perfil de Neiky por múltiples emails posibles
      const neikyEmails = ['fermin@fractal.mx', process.env.NEIKY_EMAIL || 'nakedgeometry19@gmail.com'];
      let neikyClient = null;
      for (const email of neikyEmails) {
        const { data } = await this.supabase
          .from('clients').select('*').eq('email', email).maybeSingle();
        if (data) { neikyClient = data; break; }
      }
      // También intentar por número de teléfono en clients
      if (!neikyClient) {
        const { data } = await this.supabase
          .from('clients').select('*')
          .or(`phone.eq.${identifier},whatsapp.eq.${identifier}`)
          .maybeSingle();
        if (data) neikyClient = data;
      }
      return {
        isNeiky: true, isClient: false,
        name: 'Neiky', channel,
        identifier,
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

    try {
      let convs;

      if (clientId) {
        // Búsqueda por client_id (preferido, cross-channel completo)
        const { data } = await this.supabase
          .from('conversations')
          .select('id, channel')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(10);
        convs = data;
      }

      // Fallback: buscar por external_id (phone number) si no hay clientId o no se encontraron convs
      if ((!convs || convs.length === 0) && sender.identifier) {
        const phone = this._normalizePhone(sender.identifier);
        const { data } = await this.supabase
          .from('conversations')
          .select('id, channel')
          .or(`external_id.eq.${sender.identifier},external_id.eq.whatsapp:${sender.identifier},external_id.ilike.%${phone.slice(-10)}%`)
          .order('created_at', { ascending: false })
          .limit(10);
        convs = data;
        console.log(`[Mariana] loadCrossChannelHistory: fallback por phone=${phone}, encontradas ${convs?.length || 0} convs`);
      }

      if (!convs || convs.length === 0) {
        console.log('[Mariana] loadCrossChannelHistory: sin historial previo para este sender');
        return [];
      }

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
  /**
   * Limpia Unicode inválido (surrogates sueltos) que causa JSON 400 en la API
   * Los caracteres Unicode mal formados vienen de mensajes de WhatsApp en Supabase
   */
  _sanitizeText(str) {
    if (!str) return '';
    // Reemplazar surrogate pairs inválidos y caracteres de control problemáticos
    return String(str)
      .replace(/[\uD800-\uDFFF]/g, '')  // surrogate pairs sueltos
      .replace(/ /g, '')            // null bytes
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars (excepto \n, \t, \r)
      .substring(0, 300);  // limitar longitud para evitar tokens excesivos
  }

  async respondToNeiky(message, sender, history, intent) {
    const rawContent = message.content || message.text || '';
    const content = this._sanitizeText(rawContent);

    // ── Interceptar preguntas sobre el equipo ANTES de llamar Haiku ───────────
    // Si Haiku responde a "qué hace el equipo?" sin datos reales, inventa. Evitamos eso.
    if (this._isTeamStatusQuery(rawContent)) {
      try {
        console.log('[Mariana] respondToNeiky → interceptando query de equipo');
        return await this._cmdEquipoStatus(false);
      } catch (err) {
        console.error('[Mariana] team status query fallthrough:', err.message);
        // Si falla, deja pasar al LLM pero con instrucción de honestidad
      }
    }

    // eslint-disable-next-line no-unused-vars
    const _content_already_set = true; // content está definido arriba
    const historyText = history.slice(0, 6).map(h =>
      `[${h.channel?.toUpperCase() || '?'}] Neiky: "${this._sanitizeText(h.message_in || '')}" → Mariana: "${this._sanitizeText(h.message_out || '')}"`
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

    // Usar Haiku para conversaciones con Neiky: rápido, económico, suficiente para chat natural
    const CONVERSATIONAL_MODEL = 'claude-haiku-4-5-20251001';

    let responseText;
    try {
      const response = await this.claude.messages.create({
        model: CONVERSATIONAL_MODEL,
        max_tokens: 500,
        system: this.basePrompt,
        messages: [{
          role: 'user',
          content: `${content}\n\n[Canal: ${sender.channel || 'whatsapp'} | Historial:\n${historyText}]\n\nResponde como Mariana, coqueta y cómplice, máximo 3-4 líneas:`
        }]
      });
      responseText = response.content[0].text;
      console.log(`[Mariana] respondToNeiky OK (${CONVERSATIONAL_MODEL}): "${responseText.substring(0, 60)}..."`);
    } catch (err) {
      console.error('[Mariana] respondToNeiky LLM error:', err.message);
      // Solo como último recurso — indica problema de configuración
      responseText = `Ey nene, hubo un error técnico rapidito pero ya lo checamos. Escríbeme de nuevo 🙏`;
    }

    // ── Delegación automática a agentes ──────────────────────────────────────
    try { await this._checkAndDelegate(content, responseText, sender); } catch (_) {}

    return responseText;
  }

  /**
   * Detecta si el mensaje necesita acción de un agente y lo ejecuta en background
   * Ahora usa ProjectClassifier para clasificar inteligentemente antes de delegar
   *
   * DESACTIVADO POR DEFAULT (Fase 8.5+): el task-runner pipeline
   * (/api/task/dispatch + cross-channel bridge en orchestrator) maneja la
   * delegación explícita y controlada. Este auto-delegate disparaba emails
   * de Diego cada vez que Neiky mencionaba "vanexpo/fif/diseño" en un mensaje
   * casual — generaba spam sin contexto real.
   * Para reactivar: set LEGACY_AUTODELEGATE=1 en env.
   */
  async _checkAndDelegate(content, marianaResponse, sender) {
    if (process.env.LEGACY_AUTODELEGATE !== '1') {
      console.log('[Mariana] _checkAndDelegate skipped (legacy disabled, task-runner handles delegation)');
      return;
    }
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

  // ─── BLOQUE C: TRANSPARENCIA IA ─────────────────────────────────────────────

  /**
   * Verifica si es el PRIMER contacto con este remitente (nunca ha habido historial)
   */
  isFirstContact(history) {
    return !history || history.length === 0;
  }

  /**
   * Genera el mensaje de identificación obligatorio para primer contacto
   * Daniel Carreón: "La gente no es tonta. Nunca intentes hacerte pasar por humana."
   */
  buildTransparencyGreeting(clientName = null) {
    const nombre = clientName ? ` ${clientName}` : '';
    return `Hola${nombre} 👋 Soy Mariana, la asistente virtual de Fractal MX 🤖 Estoy aquí para ayudarte con lo que necesites.\n¿En qué te puedo apoyar?`;
  }

  /**
   * Protocolo de Brief — Recoge información antes de producir
   * REGLA: NUNCA iniciar producción sin brief confirmado por escrito
   */
  async collectBrief(message, sender, history) {
    const content = message.content || message.text || '';
    const historyText = history.slice(0, 5).map(h =>
      `Cliente: "${(h.message_in || '').substring(0, 100)}" → Mariana: "${(h.message_out || '').substring(0, 100)}"`
    ).join('\n') || '';

    const briefPrompt = `${this.basePrompt}

═══ PROTOCOLO DE BRIEF (OBLIGATORIO) ═══
El cliente necesita un servicio. ANTES de producir cualquier cosa,
debes completar este brief haciéndole preguntas clave.

PREGUNTAS QUE DEBES HACER (si no están respondidas):
1. ¿Qué necesitas exactamente?
2. ¿Cuál es la fecha límite?
3. ¿Tienes referencias visuales (imágenes, URLs)?
4. ¿Hay restricciones de contenido o cosas que NO debe incluir?

Cuando tengas TODAS las respuestas, confirma el brief así:
"Perfecto, déjame confirmar lo que necesitas: [resumen del brief]. ¿Es correcto?"

Solo cuando el cliente confirme → escalar a NKD para aprobación de producción.
NUNCA iniciar producción sin esta confirmación por escrito.

═══ HISTORIAL ═══
${historyText}

═══ MENSAJE ACTUAL ═══
"${content}"

¿Qué preguntas del brief faltan? Halas de forma natural y amable.
Si ya tienes toda la info, presenta el brief para confirmación del cliente.
Tono: profesional CDMX, cálido, directo:`;

    const response = await this.claude.messages.create({
      model: this.model,
      max_tokens: 400,
      messages: [{ role: 'user', content: briefPrompt }]
    });

    return response.content[0].text;
  }

  /**
   * Responde a clientes (modo profesional)
   * BLOQUE C: incluye identificación IA en primer contacto + protocolo de brief
   */
  async respondToClient(message, sender, history, intent) {
    const content = message.content || message.text || '';
    const historyText = history.slice(0, 10).map(h =>
      `[${new Date(h.timestamp).toLocaleDateString('es-MX')}] ${h.message_in} → ${h.message_out}`
    ).join('\n') || 'Sin historial previo';

    // ── BLOQUE C: PRIMER CONTACTO — Identificación obligatoria como IA ─────────
    if (this.isFirstContact(history)) {
      return this.buildTransparencyGreeting(sender.name !== 'unknown' ? sender.name : null);
    }

    // ── BLOQUE C: Si el cliente pide precio — escalar a NKD, no dar precio ─────
    if (intent.needs_pricing) {
      await this.notifyNeiky({
        title: '💰 Cliente solicita precio',
        message: `${sender.name} (${sender.company || sender.channel}) pregunta por precios.\nMensaje: "${content.substring(0, 150)}"`,
        urgency: 'medium'
      });
    }

    // ── BLOQUE C: Si es una solicitud de producción — usar protocolo de brief ──
    const isProductionRequest = ['request', 'pricing_request'].includes(intent.type) ||
      ['diseño', 'arte', 'parrilla', 'video', 'logo', 'contenido', 'branding'].some(k =>
        content.toLowerCase().includes(k));

    if (isProductionRequest) {
      return this.collectBrief(message, sender, history);
    }

    const clientPrompt = `${this.basePrompt}

═══ CONTEXTO ═══
Estás hablando con: ${sender.name}
Empresa: ${sender.company || 'Desconocida'}
Canal: ${sender.channel}

═══ INSTRUCCIONES ESPECIALES (BLOQUE C) ═══
- Tono: cálido pero profesional
- Resuelve dudas con eficiencia
- NUNCA des precios sin consultar a Neiky primero
- Si preguntan si eres humana: CONFIRMAR que eres IA sin dudar. NUNCA mentir.
- Si piden hablar con persona real: escalar a Neiky inmediatamente
- Si piden algo de producción: iniciar protocolo de brief antes de producir
- Mantén energía positiva siempre

═══ HISTORIAL RECIENTE ═══
${historyText}

═══ INTENT DETECTADO ═══
Tipo: ${intent.type} | Urgencia: ${intent.urgency}/5 | Tema: ${intent.topic}
Necesita precio: ${intent.needs_pricing ? 'SÍ — di que lo consultas y vuelves' : 'No'}

═══ MENSAJE ═══
"${content}"

Responde como Mariana, profesional pero cálida, máximo 4-5 líneas:`;

    const response = await this.claude.messages.create({
      model: this.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: clientPrompt }]
    });

    const responseText = response.content[0].text;

    // Si necesita escalar a otro agente, hacerlo (non-blocking)
    if (intent.needs_other_agent && this.id) {
      this.escalateToAgent(intent.needs_other_agent, {
        client: sender,
        message: content,
        context: responseText
      }).catch(err => console.warn(`[Mariana] escalateToAgent(${intent.needs_other_agent}): ${err.message}`));
    }

    return responseText;
  }

  /**
   * Responde a remitentes desconocidos
   * BLOQUE C: SIEMPRE se identifica como IA en el primer mensaje
   */
  async respondToUnknown(message, channel) {
    const content = message.content || message.text || '';

    // ── BLOQUE C: Primer contacto = identificación obligatoria como IA ─────────
    // Daniel Carreón: "La gente no es tonta. Nunca intentes hacerte pasar por humana."
    const unknownPrompt = `${this.basePrompt}

═══ CONTEXTO ═══
Recibiste un mensaje de un número/email DESCONOCIDO.
Canal: ${channel}

═══ REGLA OBLIGATORIA (BLOQUE C) ═══
SIEMPRE comenzar identificándote como IA de Fractal MX en el PRIMER mensaje:
"Hola 👋 Soy Mariana, la asistente virtual de Fractal MX 🤖"
NUNCA pretender ser humana. NUNCA fingir tener emociones para manipular.
Si preguntan si eres IA o humana: CONFIRMAR que eres IA sin dudar.
Si piden hablar con persona real: decir que lo conectas con el equipo humano.

═══ INSTRUCCIONES ═══
- Sé profesional pero cautelosa
- Incluye la identificación IA obligatoria al inicio
- Pregunta de qué empresa son y cómo nos contactaron
- Pregunta qué necesitan
- NO compartas info sensible
- Si parece prospect: trátalo bien, puede ser cliente potencial
- Notifica a Neiky después

═══ MENSAJE ═══
"${content}"

Saludo profesional con identificación IA, identifica al remitente, máximo 3 líneas:`;

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

  // ─── VISION (Fase 6.5) ─────────────────────────────────────────────────
  // Mariana extracts a brief from a client-provided reference URL.
  // Auto-detects style/colors/mood and generates 2-3 smart follow-up questions.
  async extractBriefFromReference({ contactPhone = null, referenceUrl, conversationId = null }) {
    if (!referenceUrl) throw new Error('extractBriefFromReference: referenceUrl required');
    console.log(`📱 MARIANA: extrayendo brief de referencia visual ${referenceUrl}...`);

    const visual = await this.see(referenceUrl, 'general');
    if (!visual || visual.error) return { error: true, message: visual?.message || 'no_analysis' };

    const smartQuestions = await this.quickAsk(
      `El cliente mandó esta referencia: ${referenceUrl}

Lo que vi en ella:
- Estilo: ${visual.style?.aesthetic || 'sin definir'}
- Mood: ${visual.style?.mood || 'sin definir'}
- Colores dominantes: ${(visual.colors?.palette || []).slice(0, 5).join(', ')}
- Keywords: ${(visual.keywords || []).slice(0, 6).join(', ')}

¿Qué 2-3 preguntas inteligentes le haría al cliente para completar el brief, sabiendo ya lo que vi?
EVITA preguntar lo obvio que ya está en la imagen.
Tono: amable, profesional, español mexicano. Devuelve solo las preguntas en formato lista (- ...).`,
      { contact_phone: contactPhone, conversation_id: conversationId }
    );

    return {
      visual_reference: visual,
      smart_questions: smartQuestions?.answer || null,
      auto_detected: {
        style: visual.style?.aesthetic || null,
        mood: visual.style?.mood || null,
        colors: visual.colors?.palette || [],
        keywords: visual.keywords || []
      }
    };
  }

  // ─── PANEL DE CONTROL NKD — WhatsApp Commands ─────────────────────────────
  // NKD puede controlar todo el sistema desde WhatsApp con comandos simples.
  // Solo se activa cuando el número remitente es el de NKD (+5215534189583).
  //
  // Comandos soportados:
  //   estado                          → resumen del sistema
  //   apruebo [número]               → aprueba brief en parrilla_briefs
  //   rechazo [número] [razón]       → rechaza brief, ORACLE genera instrucciones
  //   genera parrilla fif [mes]      → lanza fase1_nexusAnalysis
  //   prospecto top                  → top 5 prospectos AXIOM con mensaje
  //   cuánto va el mes               → revenue vs meta con proyección
  //   axiom scan                     → lanza scan manual de AXIOM
  //   oracle consejo                 → observación estratégica de ORACLE
  //   SI                             → confirmar upsell pendiente
  //
  // Retorna string si fue un comando, null si no lo reconoce.

  async executeNKDCommand(text = '', message = {}) {
    const t = text.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    // ─── "estado" ─────────────────────────────────────────────────────────────
    if (t === 'estado' || t === 'status' || t === 'sistema') {
      return this._cmdEstado();
    }

    // ─── "apruebo N" ──────────────────────────────────────────────────────────
    const aprueboMatch = t.match(/^apruebo\s+(\d+|[a-f0-9-]{8,})$/i);
    if (aprueboMatch) {
      return this._cmdApruebo(aprueboMatch[1]);
    }

    // ─── "rechazo N razón" ────────────────────────────────────────────────────
    const rechazoMatch = t.match(/^rechazo\s+(\d+|[a-f0-9-]{8,})\s+(.+)$/i);
    if (rechazoMatch) {
      return this._cmdRechazo(rechazoMatch[1], rechazoMatch[2]);
    }

    // ─── "genera parrilla fif [mes]" ──────────────────────────────────────────
    const parrillaMatch = t.match(/^genera\s+parrilla\s+fif(?:\s+(\d{4}-\d{2}|\w+))?$/i);
    if (parrillaMatch) {
      const mes = parrillaMatch[1] || new Date().toISOString().substring(0, 7);
      return this._cmdGeneraParrilla('FIF', mes);
    }

    // ─── "prospecto top" ──────────────────────────────────────────────────────
    if (t === 'prospecto top' || t === 'prospectos top' || t === 'top prospectos') {
      return this._cmdProspectoTop();
    }

    // ─── "cuánto va el mes" ───────────────────────────────────────────────────
    // Solo captura si la intención es explícitamente preguntar por revenue
    // t === 'revenue' evita que "habla del revenue con el cliente" lo intercepte
    if (t.includes('cuanto va') || t.includes('cuanto lleva') || t === 'revenue' || t.includes('como va el mes') || t.includes('cuanto llevamos')) {
      return this._cmdRevenueMes();
    }

    // ─── "axiom scan" ─────────────────────────────────────────────────────────
    if (t === 'axiom scan' || t === 'scan axiom' || t === 'escanear') {
      return this._cmdAxiomScan();
    }

    // ─── "oracle consejo" ─────────────────────────────────────────────────────
    if (t === 'oracle consejo' || t === 'consejo oracle' || t === 'oracle' || t === 'que dice oracle') {
      return this._cmdOracleConsejo();
    }

    // ─── "SI" — confirmar upsell pendiente ────────────────────────────────────
    // Solo "si"/"sí" solos Y con upsell pendiente en oracle_memory.
    // "ok", "dale", "yes" son demasiado casuales para interceptar.
    if (t === 'si' || t === 'sí') {
      const r = await this._cmdConfirmarUpsell(message);
      if (r !== null) return r;
      // No había upsell pendiente → dejar pasar al LLM normalmente
    }

    // ─── "equipo" — status real del equipo ───────────────────────────────────
    if (t === 'equipo' || t === 'team' || t === 'status equipo' || t === 'que hace el equipo'
        || t === 'que esta haciendo el equipo' || t === 'como va el equipo'
        || t === 'que estan haciendo' || t.includes('status del equipo')
        || t.includes('que hace') && t.includes('equipo')) {
      return this._cmdEquipoStatus(false);
    }

    // ─── "asigna trabajo" — fuerza auto-investigación a todos los idle ───────
    if (t === 'asigna trabajo' || t === 'ponlos a trabajar' || t === 'asigna investigacion'
        || t === 'asigna tareas' || t.includes('ponlos a investigar')) {
      return this._cmdEquipoStatus(true);
    }

    // ─── "ayuda" ──────────────────────────────────────────────────────────────
    if (t === 'ayuda' || t === 'help' || t === 'comandos' || t === '?') {
      return this._cmdAyuda();
    }

    return null; // No es un comando — procesar normalmente
  }

  // ─── _cmdEquipoStatus ─────────────────────────────────────────────────────
  async _cmdEquipoStatus(forceAssign = false) {
    const { getTeamStatus, assignAutoWork, formatTeamStatusMessage } = require('../core/agent-work-manager');
    try {
      const teamStatus = await getTeamStatus();
      const idleAgents = teamStatus.filter(a => a.status === 'idle');
      let newWork = [];

      if (forceAssign || idleAgents.length > 0) {
        // Asignar trabajo real a todos los idle (máximo 4)
        newWork = await assignAutoWork(idleAgents.slice(0, 4).map(a => a.agent));
      }

      return formatTeamStatusMessage(teamStatus, newWork);
    } catch (err) {
      console.error('[Mariana] _cmdEquipoStatus:', err.message);
      return '⚠️ No pude consultar el status del equipo en este momento. Intenta en un segundo.';
    }
  }

  async _cmdEstado() {
    try {
      const { supabase } = require('../core/supabase');
      const mes = new Date().toISOString().substring(0, 7);

      const [parrillaRes, revenueRes, prospectoRes, healthRes] = await Promise.allSettled([
        supabase.from('parrilla_briefs').select('status').eq('cliente', 'FIF').eq('mes', mes),
        supabase.from('metric_snapshots').select('revenue_month, api_cost_today, health_score').order('date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('prospects').select('nombre_empresa, score').order('score', { ascending: false }).limit(1).maybeSingle(),
        Promise.resolve(null)
      ]);

      const briefs = parrillaRes.status === 'fulfilled' ? (parrillaRes.value?.data || []) : [];
      const snap   = revenueRes.status === 'fulfilled' ? revenueRes.value?.data : null;
      const top    = prospectoRes.status === 'fulfilled' ? prospectoRes.value?.data : null;

      const pendientes = briefs.filter(b => b.status === 'aprobado_qa').length;
      const entregados = briefs.filter(b => b.status === 'entregado').length;
      const diaActual  = Math.min(new Date().getDate(), 20);
      const revenueMes = snap?.revenue_month || 0;
      const meta       = 5000;
      const pct        = Math.round((revenueMes / meta) * 100);
      const health     = snap?.health_score;
      const healthEmoji = health >= 80 ? '🟢' : health >= 60 ? '🟡' : health ? '🔴' : '⬜';

      return `🤖 *ESTADO DEL SISTEMA*
${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}

📋 *Pipeline FIF:* Día ${diaActual}/20
  · ${pendientes} artes esperando tu revisión
  · ${entregados} entregados a Claudia
  · ${briefs.length} piezas totales del mes

💰 *Revenue:* $${Math.round(revenueMes).toLocaleString()} / $${meta.toLocaleString()} USD (${pct}%)
💸 *Costo API hoy:* $${(snap?.api_cost_today || 0).toFixed(2)} USD
${health ? `${healthEmoji} *Health Score:* ${health}/100` : ''}

🎯 *Top prospecto AXIOM:* ${top ? `${top.nombre_empresa} (score: ${top.score})` : 'Sin datos'}

Responde "ayuda" para ver todos los comandos.`;
    } catch (e) {
      return `⚠️ No pude obtener el estado completo: ${e.message}`;
    }
  }

  async _cmdApruebo(identificador) {
    try {
      const { supabase } = require('../core/supabase');
      // Buscar por número de pieza o por UUID parcial
      let query = supabase.from('parrilla_briefs').select('id, headline, tipo_pieza, status, cliente');
      if (identificador.length > 8) {
        query = query.ilike('id', `${identificador}%`);
      } else {
        // Buscar por número de pieza dentro del mes
        const mes = new Date().toISOString().substring(0, 7);
        const { data: all } = await supabase.from('parrilla_briefs').select('id, headline, tipo_pieza, status, cliente').eq('mes', mes).order('created_at');
        const idx = parseInt(identificador) - 1;
        if (all?.[idx]) {
          const brief = all[idx];
          await supabase.from('parrilla_briefs').update({ status: 'aprobado', aprobado_por: 'NKD_WA' }).eq('id', brief.id);
          // Registrar en memoria
          try { const { learnFromApproval } = require('../core/memory-engine'); await learnFromApproval(brief.id); } catch {}
          return `✅ *APROBADO* — Pieza #${identificador}\n"${brief.headline || brief.tipo_pieza}" (${brief.cliente})\n\nEstatus actualizado a 'aprobado'. Carlos puede proceder a producción.`;
        }
        return `❌ No encontré la pieza #${identificador} en la parrilla de este mes.`;
      }

      const { data } = await query.single();
      if (!data) return `❌ No encontré el brief con ID: ${identificador}`;

      await supabase.from('parrilla_briefs').update({ status: 'aprobado', aprobado_por: 'NKD_WA' }).eq('id', data.id);
      try { const { learnFromApproval } = require('../core/memory-engine'); await learnFromApproval(data.id); } catch {}
      return `✅ *APROBADO*\n"${data.headline || data.tipo_pieza}" (${data.cliente})\nID: ${data.id.substring(0, 8)}...\n\nEstatus actualizado a 'aprobado'.`;
    } catch (e) {
      return `❌ Error al aprobar: ${e.message}`;
    }
  }

  async _cmdRechazo(identificador, razon) {
    try {
      const { supabase } = require('../core/supabase');
      const mes = new Date().toISOString().substring(0, 7);
      const { data: all } = await supabase.from('parrilla_briefs').select('*').eq('mes', mes).order('created_at');

      const idx = parseInt(identificador) - 1;
      const brief = all?.[idx] || null;

      if (!brief) return `❌ No encontré la pieza #${identificador} en la parrilla de este mes.`;

      // Actualizar status
      await supabase.from('parrilla_briefs').update({ status: 'rework', razon_rechazo: razon }).eq('id', brief.id);

      // ORACLE genera instrucciones de corrección
      let instrucciones = razon;
      try {
        const { decideArteRechazado } = require('../core/oracle-decision');
        const oDecision = await decideArteRechazado(brief, 'nkd_revision', razon);
        instrucciones = oDecision?.instrucciones_agente || oDecision?.mensaje_carlos || razon;
      } catch {}

      // Registrar en memoria
      try { const { learnFromRejection } = require('../core/memory-engine'); await learnFromRejection(brief.id, razon); } catch {}

      return `❌ *RECHAZADO* — Pieza #${identificador}\n"${brief.headline || brief.tipo_pieza}"\n\nRazón: ${razon}\n\nInstrucciones para Carlos:\n${instrucciones}\n\nEstatus: rework. Carlos será notificado.`;
    } catch (e) {
      return `❌ Error al rechazar: ${e.message}`;
    }
  }

  async _cmdGeneraParrilla(cliente, mes) {
    try {
      const { supabase } = require('../core/supabase');
      // Notificar que se lanzó
      setImmediate(async () => {
        try {
          const { fase1_nexusAnalysis } = require('../routines/parrilla-pipeline');
          await fase1_nexusAnalysis(mes);
        } catch (e) {
          console.error('[Mariana CMD] genera parrilla error:', e.message);
        }
      });
      return `🚀 *Parrilla ${cliente} lanzada para ${mes}*\n\nFase 1 (análisis NEXUS) iniciada en background.\nRecibirás el plan en ~5 minutos por WhatsApp.\n\nCrons del pipeline:\n· Día 5: Desarrollo de briefs\n· Día 7: Aprobación NKD\n· Día 10: Producción Carlos/Diego\n· Día 17: Revisión final NKD\n· Día 20: Entrega a Claudia`;
    } catch (e) {
      return `❌ Error lanzando parrilla: ${e.message}`;
    }
  }

  async _cmdProspectoTop() {
    try {
      const { supabase } = require('../core/supabase');
      const { data } = await supabase
        .from('prospects')
        .select('nombre_empresa, score, servicio_sugerido, status, mensaje_sugerido')
        .order('score', { ascending: false })
        .limit(5);

      if (!data?.length) return '📊 Sin prospectos en el pipeline de AXIOM actualmente.';

      const lista = data.map((p, i) =>
        `${i + 1}. *${p.nombre_empresa}* — Score: ${p.score}\n   Servicio: ${p.servicio_sugerido || 'por definir'}\n   ${p.mensaje_sugerido ? `Mensaje: "${p.mensaje_sugerido.substring(0, 80)}..."` : ''}`
      ).join('\n\n');

      return `🎯 *TOP 5 PROSPECTOS AXIOM*\n\n${lista}\n\nResponde "axiom scan" para actualizar la lista.`;
    } catch (e) {
      return `❌ Error obteniendo prospectos: ${e.message}`;
    }
  }

  async _cmdRevenueMes() {
    try {
      const { supabase } = require('../core/supabase');
      const mes = new Date().toISOString().substring(0, 7);

      const [snapRes, salesRes, invoicesRes] = await Promise.allSettled([
        supabase.from('metric_snapshots').select('revenue_month, revenue_today').order('date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('digital_products_sales').select('precio_usd').gte('fecha_venta', `${mes}-01`),
        supabase.from('invoices').select('total, status').gte('created_at', `${mes}-01`).eq('status', 'paid')
      ]);

      const snap      = snapRes.status === 'fulfilled' ? snapRes.value?.data : null;
      const sales     = salesRes.status === 'fulfilled' ? (salesRes.value?.data || []) : [];
      const invoices  = invoicesRes.status === 'fulfilled' ? (invoicesRes.value?.data || []) : [];

      const revenueProductos = sales.reduce((s, r) => s + (r.precio_usd || 0), 0);
      const revenueServicios = invoices.reduce((s, r) => s + (r.total || 0), 0);
      const revenueMes = (snap?.revenue_month || 0) + revenueProductos;
      const meta = 5000;
      const pct  = Math.round((revenueMes / meta) * 100);
      const diaActual = new Date().getDate();
      const proyeccion = Math.round((revenueMes / diaActual) * 31);

      const emoji = pct >= 80 ? '🟢' : pct >= 50 ? '🟡' : '🔴';

      return `💰 *REVENUE ${mes.replace('-', '/')}*\n\n${emoji} *Actual:* $${Math.round(revenueMes).toLocaleString()} USD\n📊 *Meta:* $${meta.toLocaleString()} USD\n📈 *Avance:* ${pct}%\n📅 *Proyección al 31:* ~$${proyeccion.toLocaleString()} USD\n\n*Hoy:* $${Math.round(snap?.revenue_today || 0)} USD\n*Productos digitales:* $${Math.round(revenueProductos)} USD\n*Servicios (facturas):* $${Math.round(revenueServicios).toLocaleString()} MXN`;
    } catch (e) {
      return `❌ Error obteniendo revenue: ${e.message}`;
    }
  }

  async _cmdAxiomScan() {
    try {
      // Lanzar en background, confirmar inmediatamente
      setImmediate(async () => {
        try {
          const { runAxiomScan } = require('../routines/axiom-scanner');
          const result = await runAxiomScan();
          const { notifyNeiky } = require('../core/whatsapp');
          await notifyNeiky(`✅ *AXIOM Scan completado*\n${result.inserted} nuevos prospectos insertados.\nResponde "prospecto top" para ver los mejores.`);
        } catch (e) {
          console.error('[Mariana CMD] axiom scan error:', e.message);
        }
      });
      return `🔍 *AXIOM Scan iniciado*\n\nAnalizando LinkedIn, Google My Business y otras fuentes...\nTe aviso en ~2 minutos con los resultados.`;
    } catch (e) {
      return `❌ Error lanzando AXIOM scan: ${e.message}`;
    }
  }

  async _cmdOracleConsejo() {
    try {
      const { oracleDecide } = require('../core/oracle-decision');
      const { supabase } = require('../core/supabase');

      const mes = new Date().toISOString().substring(0, 7);
      const [briefs, snap, prospects] = await Promise.allSettled([
        supabase.from('parrilla_briefs').select('status').eq('mes', mes),
        supabase.from('metric_snapshots').select('*').order('date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('prospects').select('score').order('score', { ascending: false }).limit(5)
      ]);

      const contexto = {
        pipeline_briefs: briefs.status === 'fulfilled' ? briefs.value?.data?.length : 0,
        revenue_month: snap.status === 'fulfilled' ? snap.value?.data?.revenue_month : 0,
        top_score: prospects.status === 'fulfilled' ? prospects.value?.data?.[0]?.score : 0,
        dia_del_mes: new Date().getDate()
      };

      const decision = await oracleDecide('consejo_estrategico', contexto, 2);
      return `🔮 *ORACLE DICE:*\n\n${decision?.accion || decision?.razon || 'Sin observación disponible.'}`;
    } catch (e) {
      return `❌ Error consultando ORACLE: ${e.message}`;
    }
  }

  async _cmdConfirmarUpsell(message) {
    // Busca el último upsell pendiente enviado a NKD
    // El mensaje de upsell tiene formato: [upsell:clientId:servicio]
    // No hay contexto del mensaje previo aquí — verificar oracle_memory
    try {
      const { supabase } = require('../core/supabase');
      const { data: lastUpsell } = await supabase
        .from('oracle_memory')
        .select('contenido, created_at')
        .eq('tipo', 'aprendizaje')
        .order('created_at', { ascending: false })
        .limit(5);

      const upsellMemory = (lastUpsell || []).find(m => {
        try { return JSON.parse(m.contenido)?.tipo === 'upsell_detectado'; } catch { return false; }
      });

      if (!upsellMemory) {
        // No hay upsell pendiente — no interceptar, dejar pasar a conversación normal
        return null;
      }

      const data = JSON.parse(upsellMemory.contenido);
      setImmediate(async () => {
        try {
          // Aquí activaríamos a Mariana para preparar la propuesta formal
          const { notifyNeiky } = require('../core/whatsapp');
          await notifyNeiky(`📄 *Preparando propuesta para ${data.cliente}*\n\nServicio: ${data.servicio}\nMariana está redactando la propuesta formal.\nTe la mando lista en ~3 minutos.`);
          // TODO: trigger de generación de propuesta formal via MARIANA
        } catch {}
      });

      return `✅ *¡Activado!*\nMariana está preparando la propuesta formal para *${data.cliente}* — ${data.servicio}.\n\nTe la mando en unos minutos. 🚀`;
    } catch (e) {
      console.warn('[Mariana] _cmdConfirmarUpsell error:', e.message);
      return null; // Error de DB → no interceptar, dejar pasar a LLM
    }
  }

  _cmdAyuda() {
    return `🤖 *COMANDOS DISPONIBLES:*

📊 *estado* — Resumen del sistema
👥 *equipo* — Status real del equipo (qué está haciendo cada uno)
💼 *asigna trabajo* — Poner a investigar a los que estén idle
💰 *cuánto va el mes* — Revenue vs meta
🎯 *prospecto top* — Top 5 AXIOM con mensajes
🔍 *axiom scan* — Lanzar scan manual
🔮 *oracle consejo* — Observación estratégica

✅ *apruebo [N]* — Aprobar arte #N
❌ *rechazo [N] [razón]* — Rechazar arte #N
🚀 *genera parrilla fif [mes]* — Lanzar pipeline FIF

*SI* — Confirmar upsell pendiente
*ayuda* — Esta lista`;
  }

  // ─── Detector de intent "equipo" para respuestas naturales ───────────────
  // Usado por respondToNeiky para interceptar ANTES de llamar Haiku
  _isTeamStatusQuery(text = '') {
    const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const patterns = [
      /qu[eé]\s+(est[aá](n|s)?\s+)?(haciendo|trabajando|ocupados?)/,
      /c[oó]mo\s+va\s+(el\s+)?equipo/,
      /status\s+(del\s+)?equipo/,
      /qu[eé]\s+hace\s+(el\s+)?equipo/,
      /en\s+qu[eé]\s+(est[aá](n|s)?|andan)\s+/,
      /qu[eé]\s+tiene[ns]?\s+pendiente/,
      /qu[eé]\s+(hace|hacen|tiene[ns]?)\s+(carlos|alex|diego|max|valentina|sofia|diana|lucas|roberto|nexus)/,
      /est[aá](n)?\s+(trabajando|ocupados?|disponibles?|libres?)/,
      /tienen\s+(trabajo|tareas?|algo\s+asignado)/
    ];
    return patterns.some(p => p.test(t));
  }
}

module.exports = MarianaAgent;
