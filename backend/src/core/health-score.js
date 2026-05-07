// backend/src/core/health-score.js
// TAREA 4 — Health Score del Negocio (0-100)
// Cron de cálculo: 0 23 * * * (11 PM CDMX, guarda en metric_snapshots)
//
// Fórmula:
//   Revenue vs meta        (30%) — revenue_mes / meta_mes * 30
//   Tasa aprobación        (20%) — artes aprobados / total artes * 20
//   Velocidad de entrega   (20%) — entregas a tiempo / total entregas * 20
//   Prospectos en pipeline (15%) — avg score / 100 * 15
//   Salud técnica          (15%) — crons activos / 27 * 15
//
// Interpretación:
//   🟢 80-100: Sistema en modo óptimo
//   🟡 60-79:  Hay algo que atender
//   🔴 0-59:   NKD necesita intervenir hoy
//
// SQL requerido en Supabase (una vez):
//   ALTER TABLE metric_snapshots ADD COLUMN IF NOT EXISTS health_score INT DEFAULT 0;
//   ALTER TABLE metric_snapshots ADD COLUMN IF NOT EXISTS health_breakdown JSONB;

'use strict';

const { supabase } = require('./supabase');

const META_REVENUE_USD  = 5000;
const TOTAL_CRONS       = 27;   // número objetivo de crons activos en el sistema
const TZ_OPT            = { timezone: 'America/Mexico_City' };

// ── Componentes del score ─────────────────────────────────────────────────────

/**
 * Componente 1 (30%): Revenue del mes vs meta
 */
async function scoreRevenue() {
  try {
    const mes = new Date().toISOString().substring(0, 7);
    const { data: snapshot } = await supabase
      .from('metric_snapshots')
      .select('revenue_month')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Sumar productos digitales
    const { data: sales } = await supabase
      .from('digital_products_sales')
      .select('precio_usd')
      .gte('fecha_venta', `${mes}-01`);
    const revenueProductos = (sales || []).reduce((s, r) => s + (r.precio_usd || 0), 0);
    const revenueMes = (snapshot?.revenue_month || 0) + revenueProductos;
    const raw = (revenueMes / META_REVENUE_USD) * 30;
    return {
      score: Math.min(30, Math.round(raw)),
      max: 30,
      label: 'Revenue vs meta',
      detail: `$${Math.round(revenueMes)} / $${META_REVENUE_USD} USD (${Math.round((revenueMes / META_REVENUE_USD) * 100)}%)`
    };
  } catch (e) {
    return { score: 0, max: 30, label: 'Revenue vs meta', detail: `Error: ${e.message}`, error: true };
  }
}

/**
 * Componente 2 (20%): Tasa de aprobación de clientes
 * Artes aprobados sin cambios / total artes del mes
 */
async function scoreAprobacion() {
  try {
    const mes = new Date().toISOString().substring(0, 7);
    const { data: briefs } = await supabase
      .from('parrilla_briefs')
      .select('status, rondas_revision')
      .eq('mes', mes);

    const all = briefs || [];
    const total = all.length;
    if (total === 0) return { score: 15, max: 20, label: 'Tasa aprobación', detail: 'Sin datos del mes (score neutro)' };

    // Aprobados sin revisiones = rondas_revision <= 1
    const aprobadosSinCambios = all.filter(b =>
      ['aprobado_qa', 'entregado', 'aprobado_nkd'].includes(b.status) &&
      (b.rondas_revision || 1) <= 1
    ).length;
    const aprobadosTotal = all.filter(b =>
      ['aprobado_qa', 'entregado', 'aprobado_nkd'].includes(b.status)
    ).length;

    // Usar aprobados totales si no hay sin cambios
    const tasa = aprobadosTotal / total;
    const raw = tasa * 20;
    return {
      score: Math.min(20, Math.round(raw)),
      max: 20,
      label: 'Tasa aprobación clientes',
      detail: `${aprobadosTotal}/${total} aprobados (${Math.round(tasa * 100)}%) | ${aprobadosSinCambios} sin cambios`
    };
  } catch (e) {
    return { score: 10, max: 20, label: 'Tasa aprobación', detail: `Error: ${e.message}`, error: true };
  }
}

/**
 * Componente 3 (20%): Velocidad de entrega
 * Entregas al cliente antes del deadline vs total del mes
 */
async function scoreVelocidad() {
  try {
    const mes = new Date().toISOString().substring(0, 7);
    const { data: briefs } = await supabase
      .from('parrilla_briefs')
      .select('status, created_at, updated_at')
      .eq('mes', mes)
      .eq('status', 'entregado');

    const entregados = briefs || [];
    const total_mes_target = 20; // FIF = 20 piezas por mes objetivo

    // Dia actual del mes — si es día 20+, 100% de las 20 piezas deberían estar
    const diaActual = new Date().getDate();
    const entregados_esperados = Math.min(total_mes_target, Math.round((diaActual / 20) * total_mes_target));

    if (entregados_esperados === 0) {
      return { score: 20, max: 20, label: 'Velocidad entrega', detail: 'Inicio de mes — sin entregas esperadas aún' };
    }

    const tasa = Math.min(1, entregados.length / entregados_esperados);
    const raw = tasa * 20;
    return {
      score: Math.min(20, Math.round(raw)),
      max: 20,
      label: 'Velocidad entrega',
      detail: `${entregados.length}/${entregados_esperados} esperadas al día ${diaActual} (${Math.round(tasa * 100)}%)`
    };
  } catch (e) {
    return { score: 10, max: 20, label: 'Velocidad entrega', detail: `Error: ${e.message}`, error: true };
  }
}

/**
 * Componente 4 (15%): Prospectos en pipeline AXIOM
 * Score promedio de prospectos activos / 100 * 15
 */
async function scoreProspectos() {
  try {
    const { data: prospects } = await supabase
      .from('prospects')
      .select('score')
      .not('score', 'is', null)
      .gt('score', 0)
      .order('score', { ascending: false })
      .limit(10);

    const all = prospects || [];
    if (all.length === 0) return { score: 5, max: 15, label: 'Prospectos AXIOM', detail: 'Sin prospectos activos' };

    const avgScore = all.reduce((s, p) => s + (p.score || 0), 0) / all.length;
    const raw = (avgScore / 100) * 15;
    return {
      score: Math.min(15, Math.round(raw)),
      max: 15,
      label: 'Prospectos AXIOM',
      detail: `${all.length} prospectos | avg score: ${Math.round(avgScore)}/100`
    };
  } catch (e) {
    return { score: 5, max: 15, label: 'Prospectos AXIOM', detail: `Error: ${e.message}`, error: true };
  }
}

/**
 * Componente 5 (15%): Salud técnica del sistema
 * Crons activos / TOTAL_CRONS * 15
 */
async function scoreSistemaTecnico() {
  try {
    // Verificar via metric_snapshots si hay registro reciente de crons
    const { data: snapshot } = await supabase
      .from('metric_snapshots')
      .select('crons_active, system_health')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const cronsActivos = snapshot?.crons_active || TOTAL_CRONS; // si no hay dato, asumir OK
    const systemHealth = snapshot?.system_health || 'unknown';

    // Bonus si system_health es 'ok'
    const healthBonus = systemHealth === 'ok' ? 2 : systemHealth === 'degraded' ? -3 : 0;
    const raw = (cronsActivos / TOTAL_CRONS) * 15 + healthBonus;

    return {
      score: Math.max(0, Math.min(15, Math.round(raw))),
      max: 15,
      label: 'Salud técnica',
      detail: `${cronsActivos}/${TOTAL_CRONS} crons | sistema: ${systemHealth}`
    };
  } catch (e) {
    return { score: 10, max: 15, label: 'Salud técnica', detail: `Error: ${e.message}`, error: true };
  }
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * calculateHealthScore()
 * Calcula el health score completo del negocio.
 * @returns {{ score, breakdown, emoji, interpretation }}
 */
async function calculateHealthScore() {
  const [c1, c2, c3, c4, c5] = await Promise.allSettled([
    scoreRevenue(),
    scoreAprobacion(),
    scoreVelocidad(),
    scoreProspectos(),
    scoreSistemaTecnico()
  ]);

  const componentes = [
    c1.status === 'fulfilled' ? c1.value : { score: 0, max: 30, label: 'Revenue', detail: 'Error', error: true },
    c2.status === 'fulfilled' ? c2.value : { score: 10, max: 20, label: 'Aprobación', detail: 'Error', error: true },
    c3.status === 'fulfilled' ? c3.value : { score: 10, max: 20, label: 'Velocidad', detail: 'Error', error: true },
    c4.status === 'fulfilled' ? c4.value : { score: 5, max: 15, label: 'Prospectos', detail: 'Error', error: true },
    c5.status === 'fulfilled' ? c5.value : { score: 10, max: 15, label: 'Sistema', detail: 'Error', error: true }
  ];

  const total = componentes.reduce((s, c) => s + c.score, 0);
  const emoji = total >= 80 ? '🟢' : total >= 60 ? '🟡' : '🔴';
  const interpretation =
    total >= 80 ? 'Sistema en modo óptimo' :
    total >= 60 ? 'Hay algo que atender' :
    'NKD necesita intervenir hoy';

  return {
    score:          total,
    emoji,
    interpretation,
    breakdown:      componentes,
    calculated_at:  new Date().toISOString()
  };
}

/**
 * saveHealthScore()
 * Calcula y guarda en metric_snapshots la columna health_score.
 */
async function saveHealthScore() {
  const today = new Date().toISOString().split('T')[0];
  const result = await calculateHealthScore();

  console.log(`[HealthScore] ${result.emoji} ${result.score}/100 — ${result.interpretation}`);
  result.breakdown.forEach(c => console.log(`  ${c.label}: ${c.score}/${c.max} — ${c.detail}`));

  try {
    // Upsert en metric_snapshots para el día de hoy
    const { error } = await supabase
      .from('metric_snapshots')
      .upsert({
        date:             today,
        health_score:     result.score,
        health_breakdown: result.breakdown
      }, { onConflict: 'date' });

    if (error) console.warn('[HealthScore] Supabase upsert error:', error.message);
    else console.log(`[HealthScore] ✅ Guardado en metric_snapshots (${today})`);
  } catch (err) {
    console.error('[HealthScore] Error guardando:', err.message);
  }

  return result;
}

/**
 * formatHealthScoreMessage(result)
 * Formatea para uso en morning briefing / WhatsApp.
 */
function formatHealthScoreMessage(result) {
  const lines = result.breakdown.map(c => `  · ${c.label}: ${c.score}/${c.max} — ${c.detail}`);
  return `${result.emoji} Health Score: *${result.score}/100* — ${result.interpretation}\n${lines.join('\n')}`;
}

// ── Cron ──────────────────────────────────────────────────────────────────────

function startHealthScoreCron() {
  try {
    const cron = require('node-cron');
    // 11 PM CDMX — cálculo diario al cierre
    cron.schedule('0 23 * * *', () => {
      saveHealthScore().catch(e => console.error('[HealthScore] cron error:', e.message));
    }, TZ_OPT);
    console.log('✅ Health Score: cron 11 PM CDMX activo');
  } catch (e) {
    console.warn('[HealthScore] No se pudo iniciar cron:', e.message);
  }
}

module.exports = {
  calculateHealthScore,
  saveHealthScore,
  formatHealthScoreMessage,
  startHealthScoreCron,
  META_REVENUE_USD,
  TOTAL_CRONS
};
