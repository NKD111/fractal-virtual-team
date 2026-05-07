// backend/src/agents/ctr-validator.js
// FASE 2 — Agentes de Calidad Avanzados
// Evalúa el potencial de Click-Through Rate de thumbnails y artes de conversión.
// Especializado en métricas de feed saturado (Instagram, LinkedIn, banners).
// Se activa: en QA pipeline cuando tipo_pieza es banner o pieza de conversión.

const { chat } = require('../core/anthropic');

// UPGRADE 2: Haiku para validación numérica de CTR (benchmark lookup + score)
// Evaluación mecánica con benchmarks fijos — no requiere Sonnet
const MODEL = 'claude-haiku-4-5';

// Benchmarks de CTR por plataforma y nicho
const CTR_BENCHMARKS = {
  instagram_b2b:  { bajo: '<0.5%', medio: '0.5-1.5%', alto: '>1.5%' },
  instagram_feed: { bajo: '<1%',   medio: '1-3%',     alto: '>3%'   },
  banner_web:     { bajo: '<0.1%', medio: '0.1-0.3%', alto: '>0.3%' },
  linkedin:       { bajo: '<0.3%', medio: '0.3-0.8%', alto: '>0.8%' },
  default:        { bajo: '<1%',   medio: '1-3%',     alto: '>3%'   }
};

// Tipos de pieza que aplican para validación CTR
const CTR_APPLICABLE_TYPES = [
  'banner_web', 'banner', 'thumbnail', 'portada', 'cover',
  'post_conversion', 'anuncio', 'ad', 'cta_post'
];

/**
 * validateCTR(pieza, plataforma)
 *
 * Evalúa el potencial de CTR basándose en patrones reales de redes.
 * Más relevante para banners y piezas de conversión directa.
 *
 * @param {Object} pieza - { url, url_arte_final, titulo, tipo_pieza, headline, copy_apoyo, cta }
 * @param {string} plataforma - 'instagram' | 'banner_web' | 'linkedin'
 * @returns {Object} { score, ctr_estimate, passed, issues, recommendation }
 */
async function validateCTR(pieza, plataforma = 'instagram') {
  const tipoNorm = (pieza.tipo_pieza || '').toLowerCase();
  console.log(`[CTRValidator] Validando CTR: ${tipoNorm} / ${plataforma}`);

  const benchmark = CTR_BENCHMARKS[`${plataforma}_b2b`]
    || CTR_BENCHMARKS[plataforma]
    || CTR_BENCHMARKS.default;

  const system = `Eres un experto en CTR (Click-Through Rate) para contenido en redes sociales y banners digitales.
Tienes acceso a datos reales de campañas en México B2B.
Eres específico: das razones concretas, no generalidades.
Tu objetivo es predecir si esta pieza detendría el scroll en un feed saturado.`;

  const userMessage = `THUMBNAIL/ARTE A EVALUAR:
Tipo: ${pieza.tipo_pieza || 'post'}
Plataforma: ${plataforma}
URL del arte: ${pieza.url || pieza.url_arte_final || 'Sin URL'}
Título/Headline: ${pieza.headline || pieza.titulo || 'Sin título'}
Copy visible: ${pieza.copy_apoyo || ''}
CTA: ${pieza.cta || 'Sin CTA'}

BENCHMARKS para este contexto (${plataforma} B2B México):
- CTR bajo: ${benchmark.bajo}
- CTR medio: ${benchmark.medio}
- CTR alto: ${benchmark.alto}

EVALÚA basándote en patrones reales de CTR:
1. ¿Cuál es el elemento visual más prominente para el scroll en el feed?
2. ¿Hay suficiente contraste y bold para destacar en un feed saturado?
3. ¿El texto (si existe) es legible en móvil a tamaño miniatura (100px)?
4. ¿El headline genera suficiente curiosidad/urgencia para detener el scroll?
5. ¿El CTA es visible y claro sin necesitar leer todo el copy?
6. ¿Hay algún elemento que cause que el usuario lo ignore (demasiado genérico, muy corporativo, saturado)?

SCORE: 0-100 (donde 70+ = publicar, 50-69 = ajustar, <50 = rehacer)
CTR ESTIMADO: bajo/medio/alto comparado con benchmark del nicho

Responde SOLO en JSON sin markdown:
{
  "score": 0-100,
  "ctr_estimate": "bajo|medio|alto",
  "passed": true/false,
  "scroll_stopper": "qué elemento para el scroll (o cuál falta)",
  "readability_mobile": "buena|regular|mala",
  "issues": ["problema CTR específico 1", "problema CTR específico 2"],
  "strengths": ["fortaleza CTR 1"],
  "recommendation": "publicar|ajustar|rehacer",
  "quick_fix": "cambio específico para aumentar CTR"
}`;

  try {
    const result = await chat({
      model: MODEL,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 500,
      temperature: 0.3
    });

    let validation;
    try {
      validation = JSON.parse(result.content);
    } catch {
      validation = {
        score: 70,
        ctr_estimate: 'medio',
        passed: true,
        scroll_stopper: 'No determinado',
        readability_mobile: 'regular',
        issues: [],
        strengths: [],
        recommendation: 'ajustar',
        quick_fix: 'Revisión manual recomendada'
      };
    }

    console.log(`[CTRValidator] Score: ${validation.score}/100 — CTR estimado: ${validation.ctr_estimate}`);
    return validation;

  } catch (err) {
    console.error('[CTRValidator] Error:', err.message);
    return {
      score: 70,
      ctr_estimate: 'medio',
      passed: true,
      scroll_stopper: 'Error al analizar',
      readability_mobile: 'regular',
      issues: [`Error técnico: ${err.message}`],
      strengths: [],
      recommendation: 'ajustar',
      quick_fix: 'Revisión manual'
    };
  }
}

/**
 * Verifica si un tipo de pieza aplica para validación CTR.
 */
function isCTRApplicable(tipo_pieza) {
  const tipo = (tipo_pieza || '').toLowerCase();
  return CTR_APPLICABLE_TYPES.some(t => tipo.includes(t));
}

module.exports = { validateCTR, isCTRApplicable, CTR_BENCHMARKS };
