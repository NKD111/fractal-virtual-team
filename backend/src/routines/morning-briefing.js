// backend/src/routines/morning-briefing.js
// TAREA 2 — Morning Briefing Diario
// Cron: 0 7 * * * (7 AM CDMX todos los días)
// Modelo: Sonnet — resumen operativo, no requiere Opus
//
// Envía a NKD el briefing más útil del día por WhatsApp.
// Máximo 200 palabras. Formato nativo WhatsApp.

'use strict';

const { supabase }    = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');
const { chat }        = require('../core/anthropic');

const MODEL = 'claude-sonnet-4-6';
const TZ_OPT = { timezone: 'America/Mexico_City' };

// ── Helpers de datos ──────────────────────────────────────────────────────────

async function getPipelineFIFStatus() {
  try {
    const mes = new Date().toISOString().substring(0, 7);
    const { data } = await supabase
      .from('parrilla_briefs')
      .select('status')
      .eq('cliente', 'FIF')
      .eq('mes', mes);
    const all = data || [];
    return {
      dia: Math.min(new Date().getDate(), 20),
      total: all.length,
      pendientes_revision: all.filter(b => b.status === 'aprobado_qa').length,
      entregados: all.filter(b => b.status === 'entregado').length,
      en_produccion: all.filter(b => ['en_produccion','listo_qc'].includes(b.status)).length
    };
  } catch { return { dia: new Date().getDate(), total: 0, pendientes_revision: 0, entregados: 0, en_produccion: 0 }; }
}

async function getRevenueStatus() {
  try {
    const mes = new Date().toISOString().substring(0, 7);
    const { data: snapshot } = await supabase
      .from('metric_snapshots')
      .select('revenue_month, revenue_today, api_cost_today')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    // Revenue productos digitales del mes
    const { data: sales } = await supabase
      .from('digital_products_sales')
      .select('precio_usd')
      .gte('fecha_venta', `${mes}-01`);
    const revenueProductos = (sales || []).reduce((s, r) => s + (r.precio_usd || 0), 0);
    const revenueMes = (snapshot?.revenue_month || 0) + revenueProductos;
    const meta = 5000;
    return {
      mes: Math.round(revenueMes),
      meta,
      pct: Math.round((revenueMes / meta) * 100),
      hoy: Math.round(snapshot?.revenue_today || 0),
      api_cost_hoy: Number((snapshot?.api_cost_today || 0).toFixed(2))
    };
  } catch { return { mes: 0, meta: 5000, pct: 0, hoy: 0, api_cost_hoy: 0 }; }
}

async function getTopProspect() {
  try {
    const { data } = await supabase
      .from('prospects')
      .select('nombre_empresa, score, servicio_sugerido, status')
      .order('score', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  } catch { return null; }
}

async function getNewProspectsCount() {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', hoy);
    return count || 0;
  } catch { return 0; }
}

async function getHealthScore() {
  try {
    const { data } = await supabase
      .from('metric_snapshots')
      .select('health_score')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.health_score || null;
  } catch { return null; }
}

async function getHiggsFieldCredits() {
  try {
    const { data } = await supabase
      .from('metric_snapshots')
      .select('higgsfield_credits_used')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    // Estimación: 500 créditos/mes, restar usados
    const usados = data?.higgsfield_credits_used || 0;
    return Math.max(0, 500 - usados);
  } catch { return null; }
}

// ── Generación del briefing con Claude ───────────────────────────────────────

async function generateBriefing(data) {
  const { pipeline, revenue, topProspecto, prospectos_nuevos, health_score, higgsfield_credits } = data;

  const healthEmoji = health_score >= 80 ? '🟢' : health_score >= 60 ? '🟡' : '🔴';
  const revenueEmoji = revenue.pct >= 80 ? '🟢' : revenue.pct >= 50 ? '🟡' : '🔴';

  const systemData = `
DATOS DEL SISTEMA (hoy ${new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}):

Pipeline FIF: Día ${pipeline.dia}/20 del mes
- Total piezas: ${pipeline.total}
- Esperando revisión NKD: ${pipeline.pendientes_revision}
- En producción: ${pipeline.en_produccion}
- Entregadas: ${pipeline.entregados}

Revenue:
- Mes actual: $${revenue.mes} USD / $${revenue.meta} USD (${revenue.pct}%)
- Hoy: $${revenue.hoy} USD
- Costo API hoy: $${revenue.api_cost_hoy} USD

Prospectos:
- Nuevos hoy: ${prospectos_nuevos}
- Top prospecto: ${topProspecto ? `${topProspecto.nombre_empresa} (score: ${topProspecto.score}, servicio: ${topProspecto.servicio_sugerido})` : 'Sin datos'}

Higgsfield: ~${higgsfield_credits ?? '?'} créditos disponibles
Health Score: ${health_score ?? 'calculando'}
  `.trim();

  const prompt = `Eres el sistema de morning briefing de Fractal MX.
Genera el briefing diario para Neiky. Máximo 200 palabras. Formato WhatsApp.

${systemData}

Estructura EXACTA:
"Buenos días Neiky 🧠

HOY EN EL SISTEMA:
→ Pipeline FIF: Día X de 20
→ X artes esperando tu revisión
→ X prospectos nuevos de AXIOM
→ Créditos Higgsfield: ~X disponibles
→ Revenue del mes: $X / $5,000 USD (X%) ${revenueEmoji}
→ Health Score: X/100 ${health_score ? healthEmoji : ''}

TU ÚNICA TAREA DE HOY:
[La acción más importante y específica que NKD debe hacer hoy — una sola, concreta, con nombre si aplica]

ORACLE DICE:
[Una observación estratégica en 1-2 líneas sobre el estado del negocio. Específica, no genérica.]"

Usa los datos reales provistos. No inventes números. Si hay artes pendientes, eso va en la tarea del día.`;

  try {
    const result = await chat({
      model: MODEL,
      system: 'Generas briefings concisos y útiles. Directo, sin relleno.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
      temperature: 0.4
    });
    return result.content.trim();
  } catch (err) {
    // Fallback: briefing sin IA si Claude falla
    const tarea = pipeline.pendientes_revision > 0
      ? `Revisar y aprobar ${pipeline.pendientes_revision} arte(s) en parrilla FIF`
      : topProspecto
        ? `Revisar propuesta para ${topProspecto.nombre_empresa} (score ${topProspecto.score})`
        : 'Revisar métricas del mes y ajustar estrategia';

    return `Buenos días Neiky 🧠

HOY EN EL SISTEMA:
→ Pipeline FIF: Día ${pipeline.dia} de 20
→ ${pipeline.pendientes_revision} artes esperando tu revisión
→ ${prospectos_nuevos} prospectos nuevos de AXIOM
→ Créditos Higgsfield: ~${higgsfield_credits ?? '?'} disponibles
→ Revenue del mes: $${revenue.mes} / $${revenue.meta} USD (${revenue.pct}%) ${revenueEmoji}${health_score ? `\n→ Health Score: ${health_score}/100 ${healthEmoji}` : ''}

TU ÚNICA TAREA DE HOY:
${tarea}

ORACLE DICE:
Pipeline al ${revenue.pct}% de meta. ${pipeline.pendientes_revision > 0 ? 'Hay artes esperando revisión — desbloquear esto acelera la entrega a FIF.' : 'Sin bloqueos críticos detectados. Foco en prospecting.'}`;
  }
}

// ── Función principal ─────────────────────────────────────────────────────────

async function runMorningBriefing() {
  const now = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  console.log(`[MorningBriefing] Generando briefing — ${now}`);

  try {
    // Recopilar todos los datos en paralelo
    const [pipeline, revenue, topProspecto, prospectos_nuevos, health_score, higgsfield_credits] = await Promise.all([
      getPipelineFIFStatus(),
      getRevenueStatus(),
      getTopProspect(),
      getNewProspectsCount(),
      getHealthScore(),
      getHiggsFieldCredits()
    ]);

    const briefing = await generateBriefing({
      pipeline, revenue, topProspecto, prospectos_nuevos, health_score, higgsfield_credits
    });

    await notifyNeiky(briefing);
    console.log('[MorningBriefing] ✅ Enviado a NKD');

    // Guardar en oracle_memory para contexto del día
    try {
      const { saveMemory } = require('../core/memory-engine');
      await saveMemory({
        tipo: 'aprendizaje',
        contenido: JSON.stringify({
          tipo: 'morning_briefing',
          fecha: now,
          pipeline_dia: pipeline.dia,
          revenue_pct: revenue.pct,
          health_score,
          prospectos_nuevos
        })
      });
    } catch { /* non-fatal */ }

    return { success: true, briefing, data: { pipeline, revenue, health_score } };

  } catch (err) {
    console.error('[MorningBriefing] Error:', err.message);
    // Intenta enviar briefing de emergencia mínimo
    try {
      await notifyNeiky(`Buenos días Neiky 🧠\n\nEl morning briefing falló esta mañana (${err.message.substring(0, 80)}). Revisa Railway logs.`);
    } catch { /* ignore */ }
    return { success: false, error: err.message };
  }
}

// ── Cron ──────────────────────────────────────────────────────────────────────

function startMorningBriefingCron() {
  try {
    const cron = require('node-cron');
    // 7 AM CDMX todos los días
    cron.schedule('0 7 * * *', () => {
      runMorningBriefing().catch(e => console.error('[MorningBriefing] cron error:', e.message));
    }, TZ_OPT);
    console.log('✅ Morning Briefing: cron 7 AM CDMX activo');
  } catch (e) {
    console.warn('[MorningBriefing] No se pudo iniciar cron:', e.message);
  }
}

module.exports = { runMorningBriefing, startMorningBriefingCron };
