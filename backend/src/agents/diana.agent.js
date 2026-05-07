// backend/src/agents/diana.agent.js
// Fractal Virtual Team v4.2 — DIANA (Client Manager Senior)
// FASE 3 Upgrade v4.0: + translateBrief() + translateToVisualBrief()

const BaseAgent = require('../core/BaseAgent');
const DIANA_PROMPT = require('../prompts/diana.prompts');
const { chat } = require('../core/anthropic');
const contextLoader = require('../core/context-loader');
const { decideBriefVago } = require('../core/oracle-decision');

class DianaAgent extends BaseAgent {
  constructor() {
    super({
      name: 'DIANA',
      fullName: 'Diana Vargas Beltrán',
      role: 'Client Manager Senior',
      area: 'client_management',
      reportsTo: 'MARIANA',
      basePrompt: DIANA_PROMPT,

      personality: {
        with_clients: 'professional strategic',
        with_neiky: 'respectful collaborative',
        with_team: 'structured clear',
        core_traits: ['professional', 'strategic', 'meticulous', 'confident']
      },

      speakingStyle: {
        tone: 'articulate',
        uses_english: 'when_needed',
        typical_phrases: [
          'Considerando los stakeholders involucrados...',
          'El ROI proyectado de esto sería...',
          '¿Te late?',
          'Quemamos esa nave'
        ]
      },

      qualityStandards: {
        tolerance_level: 'low',
        red_lines: ['unkept_promises', 'scope_without_docs', 'undocumented_agreements'],
        acceptance_threshold: 90
      }
    });
  }

  /**
   * Maneja conversación con un cliente senior
   */
  async handleClientConversation(message, clientData) {
    const context = { clientId: clientData?.id };
    return this.think(message, context);
  }

  /**
   * Genera brief ejecutivo de un proyecto
   */
  async generateExecutiveBrief(projectInfo) {
    const briefPrompt = `${this.basePrompt}

Genera un brief ejecutivo profesional para el siguiente proyecto.
El brief debe incluir: objetivo, alcance, stakeholders, timeline, entregables,
métricas de éxito y restricciones.

Proyecto:
${JSON.stringify(projectInfo, null, 2)}

Brief ejecutivo:`;

    return this.think(briefPrompt);
  }

  /**
   * Estrategia de manejo para cliente difícil (ej: Julio)
   */
  async getClientStrategy(clientName, situation) {
    const stratPrompt = `${this.basePrompt}

Situación: ${situation}
Cliente: ${clientName}

Proporciona una estrategia detallada para manejar esta situación de manera profesional.
Incluye: enfoque de comunicación, límites a establecer, documentación requerida, escalaciones si aplica.`;

    return this.think(stratPrompt);
  }

  // ─── FASE 3: Client Translation ────────────────────────────────────────────

  /**
   * translateBrief(brief_raw, cliente)
   *
   * Toma un brief vago del cliente y lo convierte en especificaciones
   * técnicas claras y accionables para el equipo de producción.
   * Es la función más importante para prevenir revisiones infinitas.
   *
   * @param {string} brief_raw - El brief tal como llegó del cliente
   * @param {string} cliente - Nombre del cliente (FIF, ExpoMobility, etc.)
   * @returns {Object} { brief_carlos, brief_alex, preguntas_cliente, confidence }
   */
  async translateBrief(brief_raw, cliente = 'FIF') {
    const clienteKey = cliente.toLowerCase();
    const clientContext = contextLoader.loadClientContext(clienteKey);
    const dianaContext = contextLoader.loadContext('diana', clienteKey);

    const system = `Eres DIANA, la Client Manager Senior de Fractal MX.
Tu trabajo más importante: tomar un brief vago o confuso del cliente
y convertirlo en especificaciones técnicas claras para el equipo de producción.

Tu poder es la INTERPRETACIÓN. Entiendes lo que el cliente quiere
aunque no lo haya sabido expresar. Nunca te quedas con la duda —
inferyes del contexto del cliente y del historial de trabajo.

${dianaContext.substring(0, 1500)}`;

    const userMessage = `CLIENTE: ${cliente}
BRIEF RECIBIDO (verbatim): "${brief_raw}"

CONTEXTO DEL CLIENTE:
${clientContext.substring(0, 1000)}

TU TAREA:
1. Interpreta la intención real aunque no esté bien expresada
2. Identifica información faltante (solo lo crítico)
3. Genera brief técnico completo para cada área

Responde SOLO en JSON sin markdown:
{
  "intencion_real": "lo que el cliente REALMENTE quiere en 1 oración",
  "brief_carlos": {
    "tipo_pieza": "post_informativo|post_testimonial|banner_web|post_evento|carousel",
    "formato": "1080x1350px (4:5) | 1080x1080px | 2048x700px",
    "objetivo_comunicacion": "",
    "mensaje_principal": "",
    "headline_sugerido": "",
    "publico_objetivo": "",
    "elementos_obligatorios": ["elemento 1", "elemento 2"],
    "elementos_evitar": ["no hacer 1", "no hacer 2"],
    "tono_visual": "editorial|informativo|urgente|aspiracional",
    "template_brand": "descripción del template del brand guide a usar",
    "prompt_higgsfield_base": "base del prompt en inglés para GPT Image 2"
  },
  "brief_alex": {
    "headline": "propuesta de headline",
    "subheadline": "propuesta de subheadline",
    "copy_apoyo": "1-2 líneas de copy de apoyo",
    "cta": "texto del CTA",
    "tono_copy": "formal|cálido|urgente|aspiracional",
    "hashtags_sugeridos": "#tag1 #tag2 #tag3"
  },
  "preguntas_cliente": [],
  "confidence": 0-100,
  "notas_diana": "observación sobre el brief o el cliente"
}`;

    try {
      const result = await chat({
        model: 'claude-sonnet-4-6',
        system,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 900,
        temperature: 0.4
      });

      let translation;
      try {
        translation = JSON.parse(result.content);
      } catch {
        translation = {
          intencion_real: brief_raw,
          brief_carlos: { tipo_pieza: 'post_informativo', headline_sugerido: brief_raw },
          brief_alex: { headline: brief_raw, cta: 'Más información' },
          preguntas_cliente: ['¿Puedes compartir más contexto sobre este brief?'],
          confidence: 40,
          notas_diana: 'Brief requiere clarificación manual'
        };
      }

      console.log(`[Diana.translateBrief] ${cliente} — confidence: ${translation.confidence}%`);

      // ORACLE toma el control si confianza < 70
      if (translation.confidence < 70) {
        console.log(`[Diana.translateBrief] confidence baja (${translation.confidence}%) — consultando ORACLE`);
        try {
          const oDecision = await decideBriefVago(brief_raw, cliente, translation.confidence);
          // Si ORACLE pudo generar el brief completo, retornarlo enriquecido
          if (oDecision?.instrucciones_agente) {
            translation.oracle_decision = oDecision;
            translation.notas_diana = (translation.notas_diana || '') +
              ` | ORACLE: ${oDecision.accion}`;
            // Si ORACLE tiene preguntas definidas, usarlas
            if (oDecision.preguntas_cliente?.length) {
              translation.preguntas_cliente = oDecision.preguntas_cliente;
            }
          }
        } catch (oErr) {
          console.warn('[Diana.translateBrief] ORACLE skip:', oErr.message);
        }
      }

      return translation;

    } catch (err) {
      console.error('[Diana.translateBrief] Error:', err.message);
      throw err;
    }
  }

  /**
   * translateToVisualBrief(concepto)
   *
   * Versión para el pipeline de parrilla: toma un concepto de NEXUS
   * y genera el brief visual completo para CARLOS.
   * Corre en paralelo con alex.generateCopyBrief() en FASE 4.
   */
  async translateToVisualBrief(concepto) {
    const raw = `${concepto.concepto} — tipo: ${concepto.tipo_pieza}, objetivo: ${concepto.objetivo}, público: ${concepto.publico}`;
    const translation = await this.translateBrief(raw, 'FIF');

    return {
      concepto_id: concepto.id || concepto.numero,
      tipo_pieza:  translation.brief_carlos?.tipo_pieza || concepto.tipo_pieza,
      formato:     translation.brief_carlos?.formato || '1080x1350px',
      tono_visual: translation.brief_carlos?.tono_visual || 'editorial',
      elementos_obligatorios: translation.brief_carlos?.elementos_obligatorios || [],
      elementos_evitar:       translation.brief_carlos?.elementos_evitar || [],
      prompt:      translation.brief_carlos?.prompt_higgsfield_base || '',
      template:    translation.brief_carlos?.template_brand || '',
      confidence:  translation.confidence,
      notas:       translation.notas_diana
    };
  }
}

module.exports = DianaAgent;
