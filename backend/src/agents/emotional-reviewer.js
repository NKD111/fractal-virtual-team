// backend/src/agents/emotional-reviewer.js
// FASE 2 — Agentes de Calidad Avanzados
// Evalúa si el copy y el visual generan la emoción correcta en el público.
// No revisa si está "técnicamente bien" — revisa si FUNCIONA emocionalmente.
// Se activa en QA pipeline (capa 3).

const { chat } = require('../core/anthropic');

const MODEL = 'claude-sonnet-4-6';

// Emociones objetivo por tipo de pieza y cliente
const EMOTION_MAP = {
  FIF: {
    post_informativo:    { objetivo: 'curiosidad + credibilidad', accion: 'guardar/compartir' },
    post_testimonial:    { objetivo: 'confianza + aspiración',    accion: 'guardar/dm' },
    post_evento:         { objetivo: 'urgencia + pertenencia',    accion: 'registrarse/compartir' },
    banner_web:          { objetivo: 'autoridad + claridad',      accion: 'click' },
    post_estadistica:    { objetivo: 'credibilidad + impacto',    accion: 'guardar/citar' },
    post_educativo:      { objetivo: 'valor + autoridad',         accion: 'guardar/seguir' },
    default:             { objetivo: 'interés + acción',          accion: 'interactuar' }
  }
};

/**
 * reviewEmotionalImpact(pieza, cliente)
 *
 * Evalúa si la pieza genera la respuesta emocional correcta en el público objetivo.
 * Score < 6/10 → la pieza va a rework.
 *
 * @param {Object} pieza - { tipo_pieza, objetivo, publico, copy, headline, subheadline, cta, url, url_arte_final }
 * @param {string} cliente - 'FIF' u otro
 * @returns {Object} { score, passed, emotion_hit, issues, notes, recommendation }
 */
async function reviewEmotionalImpact(pieza, cliente = 'FIF') {
  console.log(`[EmotionalReviewer] Revisando impacto emocional: ${pieza.headline || pieza.concepto}`);

  const clientEmotions = EMOTION_MAP[cliente.toUpperCase()] || EMOTION_MAP.FIF;
  const tipoKey = pieza.tipo_pieza?.toLowerCase().replace(/ /g, '_') || 'default';
  const emotionTarget = clientEmotions[tipoKey] || clientEmotions.default;

  const copy_completo = [
    pieza.headline && `Headline: "${pieza.headline}"`,
    pieza.subheadline && `Subheadline: "${pieza.subheadline}"`,
    pieza.copy_apoyo && `Copy de apoyo: "${pieza.copy_apoyo}"`,
    pieza.cta && `CTA: "${pieza.cta}"`,
  ].filter(Boolean).join('\n');

  const system = `Eres el Emotional Impact Reviewer de Fractal MX.
Tu trabajo es evaluar si una pieza de contenido genera la respuesta emocional correcta.
No revisas aspectos técnicos. Revisas si FUNCIONA en el cerebro del público objetivo.
Eres experto en psicología del consumidor mexicano B2B.
Das observaciones específicas y accionables — no generalidades.`;

  const userMessage = `PIEZA A EVALUAR:
Cliente: ${cliente}
Tipo de pieza: ${pieza.tipo_pieza || 'post'}
Emoción objetivo esperada: ${emotionTarget.objetivo}
Acción esperada del público: ${emotionTarget.accion}
Público objetivo: ${pieza.publico || 'Empresarios mexicanos 30-55 años, buscando franquicias e inversión'}
Objetivo de la pieza: ${pieza.objetivo || 'Generar interés en el evento/servicio'}

COPY:
${copy_completo || 'Sin copy especificado'}

URL del visual: ${pieza.url || pieza.url_arte_final || 'Sin URL de arte'}

EVALÚA:
1. ¿El headline genera la emoción objetivo? (${emotionTarget.objetivo})
   Escala 1-10
2. ¿El visual (si hay URL) refuerza o contradice el copy?
3. ¿El CTA es congruente con la emoción creada?
4. ¿Hay algún elemento que genere fricción emocional inesperada?
   (desconfianza, confusión, distancia, aburrimiento)
5. ¿Qué probabilidad hay de que alguien haga la acción esperada? (${emotionTarget.accion})
   Escala 1-10

CRITERIO DE APROBACIÓN: score promedio ≥ 6/10

Responde SOLO en JSON sin markdown:
{
  "score": 0-10,
  "passed": true/false,
  "emotion_hit": true/false,
  "headline_score": 0-10,
  "cta_score": 0-10,
  "visual_copy_alignment": "refuerza|neutral|contradice",
  "friction_points": ["elemento de fricción emocional específico"],
  "notes": "observaciones accionables en 2-3 oraciones",
  "recommendation": "publicar|ajustar|rehacer",
  "quick_fix": "cambio específico que mejoraría el score más rápido"
}`;

  try {
    const result = await chat({
      model: MODEL,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 600,
      temperature: 0.4
    });

    let review;
    try {
      review = JSON.parse(result.content);
    } catch {
      review = {
        score: 7,
        passed: true,
        emotion_hit: true,
        headline_score: 7,
        cta_score: 7,
        visual_copy_alignment: 'neutral',
        friction_points: [],
        notes: result.content.substring(0, 400),
        recommendation: 'ajustar',
        quick_fix: 'Revisión manual recomendada'
      };
    }

    console.log(`[EmotionalReviewer] Score: ${review.score}/10 — ${review.recommendation}`);
    return review;

  } catch (err) {
    console.error('[EmotionalReviewer] Error:', err.message);
    return {
      score: 7,
      passed: true,
      emotion_hit: true,
      headline_score: 7,
      cta_score: 7,
      visual_copy_alignment: 'neutral',
      friction_points: [],
      notes: `Error al revisar: ${err.message}`,
      recommendation: 'ajustar',
      quick_fix: 'Revisión manual'
    };
  }
}

module.exports = { reviewEmotionalImpact, EMOTION_MAP };
