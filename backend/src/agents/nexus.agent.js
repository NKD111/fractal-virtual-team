// backend/src/agents/nexus.agent.js
// Fractal Virtual Team v4.2 — NEXUS Strategic Content AI

const BaseAgent = require('../core/BaseAgent');
const NEXUS_PROMPT = require('../prompts/nexus.prompts');

class NexusAgent extends BaseAgent {
  constructor() {
    super({
      name: 'NEXUS',
      fullName: 'NEXUS Strategic Content AI',
      role: 'Strategic Content Planner',
      area: 'strategy',
      reportsTo: 'MARIANA',
      basePrompt: NEXUS_PROMPT,

      personality: {
        with_clients: 'analytical structured',
        with_neiky: 'data-driven concise',
        with_team: 'clear directive',
        core_traits: ['strategic', 'systematic', 'data-driven', 'editorial']
      },

      speakingStyle: {
        tone: 'analítico estructurado',
        typical_phrases: [
          'NEXUS: Análisis completado',
          'Distribución óptima para este mes:',
          'Priorizando audiencias por conversión:',
          'Brief maestro generado para el equipo'
        ]
      },

      qualityStandards: {
        tolerance_level: 'high',
        red_lines: ['incomplete_brief', 'missing_data', 'incoherent_narrative'],
        acceptance_threshold: 95
      }
    });
  }

  /**
   * Genera la estrategia editorial mensual completa para FIF
   * @param {Object} params
   * @param {string} params.month - Mes objetivo (e.g. "Mayo 2026")
   * @param {Object} params.eventData - Datos del evento (fecha, sede, precios, URL)
   * @param {string} params.registrationPhase - Fase de registro activa (null si no hay)
   * @param {string[]} params.priorityAudiences - Audiencias prioritarias del mes
   * @param {string} params.clientNotes - Notas adicionales del cliente
   * @returns {Promise<string>} Plan editorial estructurado
   */
  async generateParrillaFIF({ month, eventData, registrationPhase, priorityAudiences, clientNotes }) {
    const prompt = `${this.basePrompt}

═══ GENERA PARRILLA MENSUAL FIF ═══

MES: ${month}
FASE DE REGISTRO ACTIVA: ${registrationPhase || 'No especificada'}
AUDIENCIAS PRIORITARIAS: ${(priorityAudiences || []).join(', ') || 'General'}
NOTAS DEL CLIENTE: ${clientNotes || 'Sin notas adicionales'}

DATOS DEL EVENTO:
${JSON.stringify(eventData || {}, null, 2)}

Genera el plan editorial completo con:
1. Estrategia del mes (2-3 líneas de narrativa)
2. Mix de piezas justificado (8-10 piezas)
3. Brief individual por pieza en el formato estándar
4. Asignación de agentes
5. Calendario de distribución semanal

El plan debe ser accionable por el equipo creativo sin preguntas adicionales.`;

    return this.think(prompt, { client: 'fif', month });
  }

  /**
   * Genera brief individual para una pieza específica
   * @param {Object} pieceData - Datos de la pieza a generar
   * @returns {Promise<string>} Brief detallado para el agente creativo
   */
  async generatePieceBrief(pieceData) {
    const prompt = `${this.basePrompt}

GENERA BRIEF INDIVIDUAL PARA:
${JSON.stringify(pieceData, null, 2)}

Produce el brief completo en el formato estándar (PIEZA #N).
Incluye instrucciones específicas para el agente asignado.
Referencia explícita al brand system FIF donde aplique.`;

    return this.think(prompt, { client: 'fif' });
  }

  /**
   * Evalúa coherencia del mes editorial completo
   * @param {Object[]} pieces - Array de piezas del mes
   * @returns {Promise<string>} Reporte de coherencia y sugerencias
   */
  async evaluateMonthlyCoherence(pieces) {
    const prompt = `${this.basePrompt}

EVALÚA LA COHERENCIA EDITORIAL DEL MES:
${JSON.stringify(pieces, null, 2)}

Revisa:
1. ¿Las audiencias están balanceadas a lo largo del mes?
2. ¿Hay una narrativa progresiva (de awareness a conversión)?
3. ¿El mix de formatos es adecuado?
4. ¿Hay repetición de mensajes o audiencias?
5. ¿Alguna pieza falta o sobra?

Devuelve: diagnóstico + ajustes recomendados.`;

    return this.think(prompt, { client: 'fif' });
  }
}

module.exports = NexusAgent;
