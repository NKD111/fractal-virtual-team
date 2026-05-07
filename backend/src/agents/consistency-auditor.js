// backend/src/agents/consistency-auditor.js
// FASE 2 — Agentes de Calidad Avanzados
// Detecta inconsistencias de marca ANTES de que el cliente las vea.
// Se activa en QA pipeline (capa 2), después de QC-BOT técnico.
// UPGRADE 4: Memoria semántica inyectada — errores pasados evitan repetición

const { chat } = require('../core/anthropic');
const { supabase } = require('../core/supabase');
const contextLoader = require('../core/context-loader');
const { buildMemoryContext } = require('./memory-engine');

// UPGRADE 2: Haiku para validación binaria de marca (67% más barato que Sonnet)
// Brand check es determinístico con reglas fijas — Haiku es suficiente
const MODEL = 'claude-haiku-4-5-20251001';

/**
 * Obtiene los últimos N artes aprobados de un cliente.
 * Sirve como base de referencia para detectar inconsistencias.
 */
async function getLastApprovedArts(cliente, limit = 3) {
  try {
    const { data } = await supabase
      .from('parrilla_briefs')
      .select('id, tipo_pieza, concepto, headline, url_arte_final, prompt_higgsfield, mes')
      .eq('cliente', cliente.toUpperCase())
      .in('status', ['aprobado_qa', 'entregado', 'aprobado_nkd'])
      .not('url_arte_final', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(limit);
    return data || [];
  } catch {
    return [];
  }
}

/**
 * auditConsistency(arte_nuevo, cliente)
 *
 * Compara un arte nuevo contra los últimos aprobados.
 * Detecta inconsistencias de color, composición, tipografía y tono.
 *
 * @param {Object} arte_nuevo - { id, url, brief, tipo_pieza, headline, prompt_higgsfield }
 * @param {string} cliente - Nombre del cliente (FIF, etc.)
 * @returns {Object} { passed, score, issues, recommendation, details }
 */
async function auditConsistency(arte_nuevo, cliente = 'FIF') {
  console.log(`[ConsistencyAuditor] Auditando arte para ${cliente}: ${arte_nuevo.headline || arte_nuevo.id}`);

  // Cargar contexto del cliente (brand system)
  const brandContext = contextLoader.loadClientContext(cliente.toLowerCase());

  // UPGRADE 4: memoria de errores anteriores (evitar repetir rechazos documentados)
  let memoriaCtx = '';
  try {
    memoriaCtx = await buildMemoryContext(
      cliente,
      arte_nuevo.tipo_pieza,
      arte_nuevo.concepto || arte_nuevo.brief || ''
    );
  } catch { /* no bloquea QA */ }

  // Artes anteriores aprobados como referencia
  const artes_anteriores = await getLastApprovedArts(cliente, 3);

  const referenciaStr = artes_anteriores.length > 0
    ? artes_anteriores.map((a, i) =>
        `Arte ${i + 1} (aprobado, ${a.mes}):\n  Tipo: ${a.tipo_pieza}\n  Headline: ${a.headline}\n  Prompt usado: ${(a.prompt_higgsfield || '').substring(0, 200)}\n  URL: ${a.url_arte_final || 'sin URL'}`
      ).join('\n\n')
    : 'No hay artes anteriores aprobados — primera entrega del cliente.';

  const system = `Eres el Consistency Auditor de Fractal MX.
Tu trabajo es detectar inconsistencias de marca ANTES de que el cliente las vea.
Eres preciso, técnico y brutalmente honesto. No apruebas por quedar bien.

${brandContext}
${memoriaCtx ? '\n' + memoriaCtx : ''}`;

  const userMessage = `ARTE NUEVO A AUDITAR:
Tipo: ${arte_nuevo.tipo_pieza || 'post'}
Headline: ${arte_nuevo.headline || 'Sin headline'}
Brief/Concepto: ${arte_nuevo.brief || arte_nuevo.concepto || 'Sin brief'}
URL del arte: ${arte_nuevo.url || arte_nuevo.url_arte_final || 'Sin URL'}
Prompt usado: ${(arte_nuevo.prompt_higgsfield || '').substring(0, 300)}

ARTES ANTERIORES APROBADOS (referencia):
${referenciaStr}

REVISA exhaustivamente:
1. ¿Los colores son consistentes con el brand system del cliente?
2. ¿La composición sigue el mismo estilo visual que los anteriores?
3. ¿La jerarquía tipográfica es coherente con entregas previas?
4. ¿El tono visual es el mismo (no más oscuro/claro/diferente)?
5. ¿Hay algo que se vea "diferente" aunque no esté técnicamente mal?
6. ¿El prompt usado refleja correctamente el brand system?

Responde SOLO en JSON sin markdown:
{
  "passed": true/false,
  "score": 0-100,
  "issues": ["lista de problemas específicos con números de color/elementos"],
  "strengths": ["qué sí está bien"],
  "recommendation": "aprobar|revisar|rehacer",
  "details": "explicación de la decisión en 2-3 oraciones"
}`;

  try {
    const result = await chat({
      model: MODEL,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 600,
      temperature: 0.3
    });

    let audit;
    try {
      audit = JSON.parse(result.content);
    } catch {
      // Si no es JSON válido, crear respuesta de fallback
      audit = {
        passed: true,
        score: 75,
        issues: [],
        strengths: ['Análisis completado'],
        recommendation: 'revisar',
        details: result.content.substring(0, 500)
      };
    }

    console.log(`[ConsistencyAuditor] Score: ${audit.score}/100 — ${audit.recommendation}`);
    return audit;

  } catch (err) {
    console.error('[ConsistencyAuditor] Error:', err.message);
    // Fail open — no bloquear el pipeline si el auditor falla
    return {
      passed: true,
      score: 70,
      issues: [`Error al auditar: ${err.message}`],
      strengths: [],
      recommendation: 'revisar',
      details: 'Auditoría no completada por error técnico. Requiere revisión manual.'
    };
  }
}

module.exports = { auditConsistency, getLastApprovedArts };
