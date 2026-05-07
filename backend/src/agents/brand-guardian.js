// backend/src/agents/brand-guardian.js
// FASE 6 — Agentes Estratégicos
// Revisa coherencia global de TODO lo producido en la semana.
// No revisa piezas individuales — revisa el CONJUNTO.
// Cron: viernes 6 PM → 0 18 * * 5

const { chat } = require('../core/anthropic');
const { supabase } = require('../core/supabase');
const contextLoader = require('../core/context-loader');

const MODEL = 'claude-sonnet-4-6';

/**
 * Obtiene todas las piezas producidas en la última semana.
 */
async function getWeeklyOutput() {
  const semanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data } = await supabase
      .from('parrilla_briefs')
      .select('id, cliente, tipo_pieza, headline, copy_apoyo, status, url_arte_final, prompt_higgsfield, updated_at')
      .gte('updated_at', semanaAtras)
      .not('status', 'in', '("pendiente_aprobacion_nkd","rework")')
      .order('updated_at', { ascending: false })
      .limit(20);
    return data || [];
  } catch { return []; }
}

/**
 * weeklyBrandAudit()
 *
 * Auditoría semanal de coherencia de marca.
 * Evalúa el CONJUNTO, no piezas individuales.
 * Se activa cada viernes a las 6 PM.
 *
 * @returns {Object} { scores_por_cliente, inconsistencias, recomendaciones, alertas }
 */
async function weeklyBrandAudit() {
  console.log('[BrandGuardian] Iniciando auditoría semanal de marca...');

  const piezas = await getWeeklyOutput();

  if (piezas.length === 0) {
    console.log('[BrandGuardian] Sin piezas esta semana — skip');
    return { skipped: true, reason: 'Sin producción esta semana' };
  }

  // Agrupar por cliente
  const porCliente = piezas.reduce((acc, p) => {
    const c = p.cliente || 'UNKNOWN';
    if (!acc[c]) acc[c] = [];
    acc[c].push(p);
    return acc;
  }, {});

  const clientesStr = Object.entries(porCliente)
    .map(([cliente, ps]) =>
      `=== ${cliente} (${ps.length} piezas) ===\n` +
      ps.map(p => `  - [${p.tipo_pieza}] "${p.headline}" | ${p.status} | URL: ${p.url_arte_final || 'sin imagen'}`).join('\n')
    ).join('\n\n');

  // Cargar brand contexts para referencias
  const brandContextFIF = contextLoader.loadFile('visual/brand-FIF.md') || '';

  const system = `Eres el Brand Guardian de Fractal MX.
Tu trabajo es vigilar que TODO lo que produce el sistema sea coherente.
No revisas piezas individuales. Revisas el CONJUNTO de lo producido.
Tu output va directo a NKD — sé conciso, específico y accionable.`;

  const userMessage = `PRODUCCIÓN DE ESTA SEMANA:
${clientesStr}

BRAND REFERENCES:
${brandContextFIF.substring(0, 800)}

EVALÚA el CONJUNTO:
1. ¿La parrilla de FIF se ve como campaña coherente o piezas sueltas?
2. ¿Hay inconsistencias de paleta entre piezas del mismo cliente?
3. ¿El tono de copy es consistente con la voz de marca?
4. ¿Alguna pieza podría confundirse con la competencia?
5. ¿La calidad visual es consistente o hay outliers negativos?

Responde SOLO en JSON sin markdown:
{
  "scores_coherencia": { "FIF": 0-100 },
  "top_3_inconsistencias": ["inconsistencia específica 1", "2", "3"],
  "recomendaciones_siguiente_semana": ["recomendación accionable 1", "2"],
  "alertas_criticas": ["pieza o patrón que no debería entregarse"],
  "resumen_nkd": "2-3 oraciones para WhatsApp de NKD",
  "estado_general": "excelente|bueno|regular|critico"
}`;

  try {
    const result = await chat({
      model: MODEL,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 700,
      temperature: 0.3
    });

    let audit;
    try { audit = JSON.parse(result.content); }
    catch {
      audit = {
        scores_coherencia: {},
        top_3_inconsistencias: [],
        recomendaciones_siguiente_semana: [],
        alertas_criticas: [],
        resumen_nkd: result.content.substring(0, 300),
        estado_general: 'regular'
      };
    }

    // Guardar en oracle_memory para aprendizaje
    await supabase.from('oracle_memory').insert({
      type: 'brand_audit',
      content: JSON.stringify(audit),
      agent: 'BRAND_GUARDIAN',
      created_at: new Date().toISOString()
    }).catch(() => {});

    console.log(`[BrandGuardian] Auditoría completa — estado: ${audit.estado_general}`);
    return { ...audit, piezas_auditadas: piezas.length };

  } catch (err) {
    console.error('[BrandGuardian] Error:', err.message);
    return { error: err.message };
  }
}

module.exports = { weeklyBrandAudit, getWeeklyOutput };
