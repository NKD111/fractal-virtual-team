// backend/src/agents/sofia.agent.js
// Fractal Virtual Team v4.2 — SOFÍA (Project Manager)

const BaseAgent = require('../core/BaseAgent');
const SOFIA_PROMPT = require('../prompts/sofia.prompts');

class SofiaAgent extends BaseAgent {
  constructor() {
    super({
      name: 'SOFIA',
      fullName: 'Sofía Hernández Vega',
      role: 'Project Manager',
      area: 'project_management',
      reportsTo: 'MARIANA',
      basePrompt: SOFIA_PROMPT,

      personality: {
        with_clients: 'clear organized',
        with_neiky: 'structured direct',
        with_team: 'supportive accountable',
        core_traits: ['organized', 'calm', 'direct', 'solutions_oriented']
      },

      speakingStyle: {
        tone: 'clara estructurada',
        typical_phrases: [
          '¿Quién tiene eso y para cuándo?',
          'Necesito que lo confirmes antes de las 5',
          'Scope creep detectado',
          'Esto tiene dependencias, checamos juntos'
        ]
      },

      qualityStandards: {
        tolerance_level: 'low',
        red_lines: [
          'promises_without_consulting',
          'undocumented_scope_changes',
          'unescalated_blockers'
        ],
        acceptance_threshold: 95
      }
    });
  }

  /**
   * Crea timeline para un proyecto
   */
  async createTimeline(projectData) {
    const timelinePrompt = `${this.basePrompt}

PROYECTO:
${JSON.stringify(projectData, null, 2)}

Crea un timeline detallado. Incluye:
- Milestones principales con fechas
- Tareas por área (diseño, video, contenido, revisión)
- Dependencias entre tareas
- Tiempo buffer para revisiones del cliente
- Fechas críticas (deadline inamovible)
- Riesgos identificados y plan B

Formato: Lista estructurada con responsables y fechas.`;

    return this.think(timelinePrompt, { clientId: projectData.client_id });
  }

  /**
   * Detecta y documenta scope creep
   */
  async detectScopeCreep(originalScope, requestedChanges) {
    const scopePrompt = `${this.basePrompt}

SCOPE ORIGINAL:
${originalScope}

CAMBIOS SOLICITADOS:
${requestedChanges}

Analiza si hay scope creep. Si lo hay:
1. Identifica exactamente qué está fuera del scope
2. Calcula el impacto en tiempo (horas)
3. Sugiere cómo documentarlo y presentarlo al cliente
4. Proporciona el texto para notificar al cliente profesionalmente

Si no hay scope creep, confirma que está dentro del alcance.`;

    return this.think(scopePrompt);
  }

  /**
   * Genera reporte de estado del proyecto
   */
  async generateStatusReport(projectId, weekData) {
    const reportPrompt = `${this.basePrompt}

PROYECTO ID: ${projectId}
DATOS DE LA SEMANA:
${JSON.stringify(weekData, null, 2)}

Genera un reporte de estado semanal que incluya:
- % de avance general
- Completado esta semana
- En progreso
- Bloqueado (y por qué)
- Próxima semana
- Alertas o riesgos
- Acción requerida de cliente (si aplica)

Formato: Ejecutivo, claro, máximo 1 página.`;

    return this.think(reportPrompt);
  }
}

module.exports = SofiaAgent;
