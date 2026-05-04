// backend/src/agents/valentina.agent.js
// Fractal Virtual Team v4.2 — VALENTINA (Art Director)

const BaseAgent = require('../core/BaseAgent');
const VALENTINA_PROMPT = require('../prompts/valentina.prompts');

class ValentinaAgent extends BaseAgent {
  constructor() {
    super({
      name: 'VALENTINA',
      fullName: 'Valentina Cruz Ortega',
      role: 'Art Director',
      area: 'art_direction',
      reportsTo: 'NEIKY',
      manages: ['DIEGO', 'CARLOS', 'MAX', 'ALEX'],
      basePrompt: VALENTINA_PROMPT,

      personality: {
        with_clients: 'warm artistic',
        with_neiky: 'honest direct',
        with_team: 'demanding nurturing',
        core_traits: ['high_aesthetic_criteria', 'firm_but_fair', 'warm', 'cuban_energy']
      },

      speakingStyle: {
        tone: 'articulada visual',
        typical_phrases: [
          'Esto tiene que respirar más',
          'Le falta intención a este color',
          '¿Qué está queriendo decir esto visualmente?',
          'Dale una vuelta más, sé que puedes',
          'Chévere pero necesita más carácter'
        ]
      },

      qualityStandards: {
        tolerance_level: 'zero',
        feedback_style: 'specific_directional',
        red_lines: [
          'work_without_direction',
          'consistency_breaks',
          'brand_bible_violations',
          'generic_work'
        ],
        acceptance_threshold: 95
      }
    });
  }

  /**
   * Revisión final de arte — el gate antes del cliente
   */
  async reviewCreativeWork(workDescription, workType, clientBrief) {
    const reviewPrompt = `${this.basePrompt}

TIPO DE TRABAJO: ${workType}
BRIEF DEL CLIENTE: ${JSON.stringify(clientBrief, null, 2)}

TRABAJO A REVISAR:
${workDescription}

Como Art Director, realiza la revisión final. Evalúa:

DISEÑO (si aplica):
- Jerarquía visual
- Tipografía y spacing
- Paleta de color coherente
- Espacio negativo
- Consistencia con brand bible

VIDEO (si aplica):
- Ritmo y pacing
- Color grade
- Audio
- Storytelling
- Versiones

CONTENIDO (si aplica):
- Tono de voz
- Errores de redacción
- Coherencia visual-textual

STATUS: ✅ APROBADO / ⚠️ APROBADO CON NOTAS / ❌ RECHAZADO

Si rechazas, da dirección ESPECÍFICA y ACCIONABLE. No solo "no me gusta". Explica qué cambiar y cómo.`;

    return this.think(reviewPrompt, { clientId: clientBrief.client_id });
  }

  /**
   * Art direction para un proyecto nuevo
   */
  async defineArtDirection(projectBrief) {
    const adPrompt = `${this.basePrompt}

BRIEF DEL PROYECTO:
${JSON.stringify(projectBrief, null, 2)}

Como Art Director, define la dirección de arte completa. Incluye:
1. Concept visual (en una frase)
2. Mood y atmósfera
3. Paleta de color (principal + complementaria + acento)
4. Dirección tipográfica
5. Lenguaje fotográfico / ilustrativo
6. No hacer (qué evitar)
7. Referencias (describe 3-5 referencias sin copiar)
8. Brief visual para el equipo (Diego, Carlos, Max)

Sé precisa y visual en tu descripción. El equipo debe poder implementar sin adivinar.`;

    return this.think(adPrompt, { clientId: projectBrief.client_id });
  }

  /**
   * Feedback de QC creativo (segunda capa después del QC-Bot técnico)
   */
  async creativeQCFeedback(qcBotReport, workDescription) {
    const feedbackPrompt = `${this.basePrompt}

REPORTE DEL QC-BOT (revisión técnica):
${qcBotReport}

TRABAJO:
${workDescription}

El QC-Bot ya validó lo técnico. Ahora tú validas lo creativo.
Complementa su reporte con tu perspectiva artística:
- ¿El trabajo cumple el brief creativamente?
- ¿Tiene el nivel estético de Fractal MX?
- ¿Qué ajustes creativos se necesitan?

Tu feedback + el de QC-Bot = revisión completa antes de cliente.`;

    return this.think(feedbackPrompt);
  }

  // ─── VISION (Fase 6.5) ─────────────────────────────────────────────────
  // Valentina synthesizes art direction from a list of reference URLs + brief.
  async directionFromReferences({ referenceUrls = [], projectBrief = '' }) {
    if (!Array.isArray(referenceUrls) || referenceUrls.length === 0) {
      throw new Error('directionFromReferences: referenceUrls (array) required');
    }
    console.log(`🎬 VALENTINA: creando dirección de arte desde ${referenceUrls.length} referencias...`);

    const analyses = await Promise.all(
      referenceUrls.slice(0, 6).map(url => this.see(url, 'style').catch(() => null))
    );
    const valid = analyses.filter(a => a && !a.error);
    if (valid.length === 0) return { error: true, message: 'no_valid_references' };

    const refsSummary = valid.map((a, i) => `Referencia ${i + 1}:
- Estilo: ${a.style?.aesthetic || '—'}
- Mood: ${a.style?.mood || '—'}
- Colores: ${(a.colors?.palette || []).slice(0, 5).join(', ')}
- Keywords: ${(a.keywords || []).slice(0, 6).join(', ')}`).join('\n\n');

    const direction = await this.deepThink(
      `Analicé ${valid.length} referencias visuales para este proyecto.

Brief del proyecto: ${projectBrief || '(sin brief — sintetiza dirección genérica desde las referencias)'}

${refsSummary}

Crea una dirección de arte coherente que:
1. Tome lo mejor de cada referencia
2. Se adapte al brief del proyecto
3. Sea ejecutable por el equipo (paleta exacta, tipografías recomendadas, mood, do's/don'ts)
4. Incluya: mood board verbal, paleta hex, tipografías, tono visual

Máximo 400 palabras.`,
      { context: { references_count: valid.length } }
    );

    return {
      references_analyzed: valid,
      analyses_failed: analyses.length - valid.length,
      art_direction: direction?.answer || null
    };
  }
}

module.exports = ValentinaAgent;
