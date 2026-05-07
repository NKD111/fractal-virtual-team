// backend/src/agents/campaign-strategist.js
// FASE 6 — Agentes Estratégicos
// Piensa en arcos narrativos de 3 meses, no en posts individuales.
// Se activa al inicio de cada trimestre o cuando NKD lo solicita.

const { chat } = require('../core/anthropic');
const { supabase } = require('../core/supabase');
const contextLoader = require('../core/context-loader');

const MODEL = 'claude-sonnet-4-6';

/**
 * Obtiene historial de campañas de los últimos N meses.
 */
async function getCampaignHistory(cliente, meses = 6) {
  try {
    const { data } = await supabase
      .from('parrilla_briefs')
      .select('mes, tipo_pieza, concepto, headline, status, rondas_revision')
      .eq('cliente', cliente.toUpperCase())
      .order('mes', { ascending: false })
      .limit(meses * 10); // ~10 piezas por mes
    return data || [];
  } catch { return []; }
}

/**
 * generateCampaignArc(cliente, trimestre)
 *
 * Genera la estrategia narrativa de 3 meses para un cliente.
 * Considera historial, patrones, y oportunidades no exploradas.
 *
 * @param {string} cliente - 'FIF' u otro
 * @param {string} trimestre - 'Q1-2026' | 'Q2-2026' | etc.
 * @returns {Object} { mes1, mes2, mes3, patrones_evitar, oportunidades, resumen }
 */
async function generateCampaignArc(cliente = 'FIF', trimestre = null) {
  const currentQ = trimestre || getCurrentTrimestre();
  console.log(`[CampaignStrategist] Generando arco para ${cliente} — ${currentQ}`);

  const historial = await getCampaignHistory(cliente, 6);
  const clientContext = contextLoader.loadClientContext(cliente.toLowerCase()) || '';
  const hooksContext = contextLoader.loadFile('campanas/hooks-probados.md') || '';

  // Analizar patrones del historial
  const tiposUsados = [...new Set(historial.map(h => h.tipo_pieza).filter(Boolean))];
  const conceptosRecientes = historial.slice(0, 30).map(h => h.concepto || h.headline).filter(Boolean);
  const piezasConRevision = historial.filter(h => (h.rondas_revision || 0) > 1).length;

  const system = `Eres el Campaign Strategist de Fractal MX.
No piensas en posts individuales. Piensas en ARCOS NARRATIVOS de 3 meses.
Tu trabajo es crear coherencia estratégica entre meses, no briefs aislados.
Conoces profundamente al público empresarial mexicano B2B.`;

  const userMessage = `CLIENTE: ${cliente}
TRIMESTRE: ${currentQ}

HISTORIAL (últimos 6 meses):
Tipos de pieza usados: ${tiposUsados.join(', ')}
Temas recientes: ${conceptosRecientes.slice(0, 15).join(', ')}
Piezas que requirieron >1 revisión: ${piezasConRevision}

CONTEXTO DEL CLIENTE:
${clientContext.substring(0, 600)}

HOOKS QUE FUNCIONAN:
${hooksContext.substring(0, 400)}

GENERA la estrategia narrativa del trimestre ${currentQ}:

Para cada mes: tema narrativo central, emoción predominante, acción esperada,
tipos de pieza recomendados, qué NO repetir del trimestre anterior.

También: patrones documentados a evitar y oportunidades no explotadas aún.

Responde SOLO en JSON sin markdown:
{
  "trimestre": "${currentQ}",
  "cliente": "${cliente}",
  "tema_trimestral": "el hilo conductor que une los 3 meses",
  "mes1": {
    "mes": "nombre del mes",
    "narrativa": "la historia que contamos",
    "emocion_predominante": "urgencia|aspiracion|confianza|curiosidad",
    "accion_objetivo": "qué queremos que haga la audiencia",
    "tipos_pieza_recomendados": ["tipo1", "tipo2"],
    "no_repetir": "qué evitar del ciclo anterior"
  },
  "mes2": { ... },
  "mes3": { ... },
  "patrones_evitar": ["patrón documentado a no repetir 1", "2"],
  "oportunidades": ["tema o formato no explotado 1", "2"],
  "resumen_ejecutivo": "3 oraciones para NKD"
}`;

  try {
    const result = await chat({
      model: MODEL,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 1000,
      temperature: 0.6
    });

    let strategy;
    try { strategy = JSON.parse(result.content); }
    catch {
      strategy = {
        trimestre: currentQ,
        cliente,
        resumen_ejecutivo: result.content.substring(0, 500),
        error_parse: true
      };
    }

    // Guardar en oracle_memory
    await supabase.from('oracle_memory').insert({
      tipo:      'campaign_strategy',
      contenido: JSON.stringify(strategy),
      created_at: new Date().toISOString()
    }).catch(() => {});

    console.log(`[CampaignStrategist] Arco generado para ${cliente} ${currentQ}`);
    return strategy;

  } catch (err) {
    console.error('[CampaignStrategist] Error:', err.message);
    return { error: err.message, cliente, trimestre: currentQ };
  }
}

function getCurrentTrimestre() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q}-${now.getFullYear()}`;
}

module.exports = { generateCampaignArc, getCampaignHistory, getCurrentTrimestre };
