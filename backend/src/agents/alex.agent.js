// backend/src/agents/alex.agent.js
// Fractal Virtual Team v4.2 — ALEX (Content Creator & Social Media)

const BaseAgent = require('../core/BaseAgent');
const ALEX_PROMPT = require('../prompts/alex.prompts');

class AlexAgent extends BaseAgent {
  constructor() {
    super({
      name: 'ALEX',
      fullName: 'Alex Torres Medina',
      role: 'Content Creator & Social Media Strategist',
      area: 'content',
      reportsTo: 'VALENTINA',
      basePrompt: ALEX_PROMPT,

      personality: {
        with_clients: 'casual trendy',
        with_neiky: 'entusiasta directo',
        with_team: 'collaborative creative',
        core_traits: ['trendy', 'creative', 'strategic', 'cultural_radar']
      },

      speakingStyle: {
        tone: 'casual espontáneo',
        typical_phrases: [
          'Esto ya está muy dated',
          'El algoritmo está premiando esto ahorita',
          'No mames, esto va a pegar',
          '¿Le damos un vibe más editorial?'
        ]
      },

      qualityStandards: {
        tolerance_level: 'medium',
        red_lines: ['plagiarism', 'generic_content', 'wrong_tone_of_voice'],
        acceptance_threshold: 85
      }
    });
  }

  /**
   * Genera parrilla editorial para un mes
   */
  async generateEditorialGrid(clientData, platforms, month) {
    const gridPrompt = `${this.basePrompt}

CLIENTE: ${clientData.name} (${clientData.company})
PLATAFORMAS: ${platforms.join(', ')}
MES: ${month}

Genera una parrilla editorial de 30 días. Para cada pieza incluye:
- Día y fecha
- Plataforma
- Tipo de contenido (reel, carrusel, historia, post estático)
- Copy principal (máximo 150 chars)
- Hook de apertura
- CTA
- Hashtags (máximo 10, relevantes)
- Visual brief (describe la imagen/video en 2 líneas)

Varía los tipos de contenido. Mix de: educativo, entretenimiento, venta, comunidad.
Mantén el tono de voz de la marca.`;

    return this.think(gridPrompt, { clientId: clientData.id });
  }

  /**
   * Genera copy para una pieza específica
   */
  async generateCopy(brief, platform, type) {
    const copyPrompt = `${this.basePrompt}

BRIEF: ${brief}
PLATAFORMA: ${platform}
TIPO: ${type}

Genera el copy completo para esta pieza. Incluye:
- Hook (primera línea que para el scroll)
- Cuerpo del mensaje
- CTA específico
- Hashtags
- Nota para el diseñador (qué imagen/video necesita)

El copy tiene que sonar HUMANO, no corporativo.`;

    return this.think(copyPrompt);
  }

  /**
   * Analiza tendencias relevantes para un cliente
   */
  async analyzeTrends(industry, currentMonth) {
    const trendsPrompt = `${this.basePrompt}

INDUSTRIA: ${industry}
MES: ${currentMonth}

¿Qué tendencias de contenido son relevantes ahora para esta industria?
Lista 5-7 tendencias con:
- Nombre de la tendencia
- Por qué está pegando
- Cómo aplicarla para este cliente
- Duración estimada (flash/mensual/trimestral)
- Nivel de riesgo (conservador/moderado/experimental)`;

    return this.think(trendsPrompt);
  }
}

module.exports = AlexAgent;
