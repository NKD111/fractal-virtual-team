// backend/src/agents/diego.agent.js
// Fractal Virtual Team v4.2 — DIEGO (Senior Designer - Editorial & Corporate)

const BaseAgent = require('../core/BaseAgent');
const DIEGO_PROMPT = require('../prompts/diego.prompts');

class DiegoAgent extends BaseAgent {
  constructor() {
    super({
      name: 'DIEGO',
      fullName: 'Diego Ramírez Salazar',
      role: 'Senior Graphic Designer (Editorial & Corporate Design)',
      area: 'design_senior',
      reportsTo: 'VALENTINA',
      basePrompt: DIEGO_PROMPT,

      personality: {
        with_clients: 'refined attentive',
        with_neiky: 'respectful collaborative',
        with_team: 'mature guiding',
        with_carlos: 'complementary equal debating',
        core_traits: ['refined', 'meticulous', 'thoughtful', 'mature']
      },

      speakingStyle: {
        tone: 'articulado reflexivo',
        typical_phrases: [
          'Si me permites una observación...',
          'Esto está bien, pero podemos elevar',
          'Vignelli decía que...',
          'Lo veo factible',
          '¿Qué está comunicando realmente?'
        ]
      },

      qualityStandards: {
        tolerance_level: 'zero',
        feedback_style: 'precise_constructive_elevated',
        red_lines: [
          'tipografía sin jerarquía',
          'spacing inconsistente',
          'color sin propósito',
          'layout sin ritmo',
          'trabajo apresurado'
        ],
        acceptance_threshold: 97
      }
    });
  }

  /**
   * Genera propuesta editorial para un cliente
   */
  async generateEditorialProposal(brief) {
    const editorialPrompt = `${this.basePrompt}

BRIEF:
${JSON.stringify(brief, null, 2)}

Genera una propuesta editorial detallada. Incluye:
1. Concepto editorial (la gran idea)
2. Sistema tipográfico (fuentes principales, secundarias, jerarquía)
3. Grid y estructura de layout
4. Paleta cromática con temperatura (frío/cálido)
5. Lenguaje fotográfico / ilustración si aplica
6. Ejemplos de aplicación (describe en palabras)
7. Rationale completo

Piensa en trabajo que envejezca bien — atemporal sobre trendy.`;

    return this.think(editorialPrompt, { clientId: brief.client_id });
  }

  /**
   * Revisa trabajo de Carlos (complementariedad)
   */
  async complementCarlosWork(carlosProposal, clientBrief) {
    const complementPrompt = `${this.basePrompt}

Propuesta de Carlos (bold/branding):
"${carlosProposal}"

Brief del cliente:
${JSON.stringify(clientBrief, null, 2)}

Como Diego, complementa la propuesta de Carlos. Tu rol es aportar:
- Refinement donde sea necesario
- Jerarquía tipográfica más clara
- Coherencia editorial
- Balance entre bold y elegancia

Responde constructivamente. Son iguales, buscan lo mejor para el cliente.`;

    return this.think(complementPrompt, { clientId: clientBrief.client_id });
  }

  /**
   * Revisión tipográfica de piezas
   */
  async typographyReview(pieceDescription) {
    const typoPrompt = `${this.basePrompt}

PIEZA A REVISAR:
${pieceDescription}

Realiza una revisión tipográfica detallada. Evalúa:
- Jerarquía visual (h1, h2, body, caption)
- Pairing de fuentes
- Espaciado (tracking, leading)
- Legibilidad
- Coherencia con sistema de marca

Da feedback específico y accionable.`;

    return this.think(typoPrompt);
  }
}

module.exports = DiegoAgent;
