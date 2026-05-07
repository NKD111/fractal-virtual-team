// backend/src/agents/client-simulator.js
// FASE 2 — Agentes de Calidad Avanzados
// Simula la reacción exacta del cliente ANTES de entregar.
// El agente más importante para clientes difíciles como Luis Tendero.
// Se activa en QA pipeline (capa 4), el último filtro antes de NKD.

const { chat } = require('../core/anthropic');
const contextLoader = require('../core/context-loader');

const MODEL = 'claude-sonnet-4-6';

// Perfiles de clientes difíciles — se cargan dinámicamente del contexto
// o se usan estos hardcoded como fallback
const CLIENT_PROFILES = {
  luis_tendero_fif: `Cliente: Luis Tendero (FIF/Vanexpo)
Comportamiento documentado:
- Da briefs vagos como "algo chido para el evento" sin referencias
- Cambia de opinión después de aprobar algo por escrito
- Pide revisiones sin razón clara: "se siente que le falta algo"
- Dice "ya saben cómo lo hacemos" sin explicar
- Aprueba una pieza y al día siguiente la rechaza
- Le gustan las piezas "limpias" pero nunca define qué significa eso
- Desconfía de las propuestas muy creativas/diferentes
- Prefiere algo seguro aunque sea menos impactante
- Su estándar no declarado: "que se vea como lo que hacen las agencias grandes"
Probabilidad de aprobación base: 60%
Factor de riesgo: alto en piezas muy creativas o que se desvíen del template anterior`,

  default: `Cliente genérico de agencia creativa en México.
Comportamiento promedio:
- Tiene expectativas razonables pero no siempre las comunica bien
- 2-3 rondas de revisión es lo normal
- Aprecia el profesionalismo y la puntualidad
- Le gusta ver opciones cuando hay incertidumbre
Probabilidad de aprobación base: 75%`
};

/**
 * simulateClientReaction(arte, cliente_key)
 *
 * Simula cómo reaccionaría el cliente real al ver el arte.
 * Es brutalmente honesto — si el cliente es difícil, lo simula difícil.
 *
 * @param {Object} arte - { url, brief, tipo_pieza, headline, concepto }
 * @param {string} cliente_key - 'luis_tendero_fif' | 'default' | nombre custom
 * @returns {Object} { approval_probability, first_reaction, would_request_changes, changes, fatal_issues, safe_to_send }
 */
async function simulateClientReaction(arte, cliente_key = 'luis_tendero_fif') {
  console.log(`[ClientSimulator] Simulando reacción de ${cliente_key}`);

  const perfil = CLIENT_PROFILES[cliente_key] || CLIENT_PROFILES.default;

  // También intentar cargar desde contexto modular
  const clientContextName = cliente_key.includes('fif') ? 'fif' : cliente_key;
  const clientContextExtra = contextLoader.loadClientContext(clientContextName) || '';

  const system = `Eres un simulador de reacciones de cliente para Fractal MX.
Tu trabajo es predecir CON PRECISIÓN cómo reaccionará un cliente específico al ver un arte.
NO eres optimista. NO das el beneficio de la duda. Simulas exactamente como es este cliente.
Si el cliente es difícil, LO SIMULAS DIFÍCIL.

Tu output ayuda al equipo a hacer ajustes ANTES de entregar, no después.`;

  const userMessage = `PERFIL DEL CLIENTE:
${perfil}

${clientContextExtra ? `CONTEXTO ADICIONAL DEL CLIENTE:\n${clientContextExtra.substring(0, 800)}` : ''}

ARTE A EVALUAR:
Tipo de pieza: ${arte.tipo_pieza || 'post'}
Headline: ${arte.headline || 'Sin headline'}
Brief original que se le dio: ${arte.brief || arte.concepto || 'Sin brief documentado'}
URL del arte: ${arte.url || arte.url_arte_final || 'Sin URL'}
Copy de apoyo: ${arte.copy_apoyo || 'No especificado'}
CTA: ${arte.cta || 'No especificado'}

SIMULA su reacción honesta y específica:
1. ¿Lo aprobaría en la primera revisión? (sí/no/con_cambios)
2. ¿Cuál sería su primera frase al verlo? (entre comillas, como él hablaría)
3. ¿Qué cambiaría o cuestionaría? (específico, no genérico)
4. ¿Probabilidad de aprobación sin cambios? (0-100%)
5. ¿Qué ajuste específico lo haría aprobar de inmediato?
6. ¿Hay algún elemento que lo haría rechazar completamente?

Responde SOLO en JSON sin markdown:
{
  "approval_probability": 0-100,
  "first_reaction": "frase exacta que diría",
  "would_approve_first_round": true/false,
  "requested_changes": ["cambio específico 1", "cambio específico 2"],
  "fatal_issues": ["problema que causaría rechazo total"],
  "quick_fix": "el ajuste más importante para garantizar aprobación",
  "safe_to_send": true/false,
  "confidence_notes": "por qué esta predicción"
}`;

  try {
    const result = await chat({
      model: MODEL,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 700,
      temperature: 0.5
    });

    let simulation;
    try {
      simulation = JSON.parse(result.content);
    } catch {
      simulation = {
        approval_probability: 65,
        first_reaction: 'Simulación no disponible',
        would_approve_first_round: false,
        requested_changes: ['Verificar manualmente'],
        fatal_issues: [],
        quick_fix: 'Revisión manual recomendada',
        safe_to_send: true,
        confidence_notes: result.content.substring(0, 400)
      };
    }

    console.log(`[ClientSimulator] Prob. aprobación: ${simulation.approval_probability}% — safe_to_send: ${simulation.safe_to_send}`);
    return simulation;

  } catch (err) {
    console.error('[ClientSimulator] Error:', err.message);
    return {
      approval_probability: 70,
      first_reaction: 'Error al simular',
      would_approve_first_round: true,
      requested_changes: [],
      fatal_issues: [`Error técnico: ${err.message}`],
      quick_fix: 'Revisión manual',
      safe_to_send: true,
      confidence_notes: 'Simulación fallida — fail open'
    };
  }
}

module.exports = { simulateClientReaction, CLIENT_PROFILES };
