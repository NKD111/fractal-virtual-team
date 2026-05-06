// backend/src/routines/weekly-council.js
// BLOQUE E2 — Weekly Business Council (Lunes 9 AM CDMX)
// Cron: 0 9 * * 1
// Modelo: Opus (consejo estratégico semanal)

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');

function getWeekNumber() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil((((now - start) / 86400000) + start.getDay() + 1) / 7);
}

async function getWeekMetrics() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split('T')[0];

  // Revenue de la semana desde metric_snapshots
  const { data: snapshots } = await supabase
    .from('metric_snapshots')
    .select('revenue_today, images_generated, videos_generated, errors_today, axiom_opportunities_found')
    .gte('date', weekAgo.split('T')[0])
    .order('date', { ascending: false });

  const revenue = (snapshots || []).reduce((s, r) => s + (r.revenue_today || 0), 0);
  const images = (snapshots || []).reduce((s, r) => s + (r.images_generated || 0), 0);
  const errors = (snapshots || []).reduce((s, r) => s + (r.errors_today || 0), 0);
  const axiom = (snapshots || []).reduce((s, r) => s + (r.axiom_opportunities_found || 0), 0);

  // Piezas entregadas
  const { count: delivered } = await supabase
    .from('parrilla_briefs')
    .select('*', { count: 'exact', head: true })
    .gte('updated_at', weekAgo)
    .eq('status', 'entregado');

  // Prospectos contactados
  const { count: prospectsContacted } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .gte('updated_at', weekAgo)
    .neq('status', 'identificado');

  // Top oportunidad AXIOM
  const { data: topProspect } = await supabase
    .from('prospects')
    .select('nombre_empresa, score, servicio_sugerido')
    .gte('created_at', weekAgo)
    .order('score', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    revenue,
    meta: 5000,
    delivered: delivered || 0,
    arts: images,
    prospects_contacted: prospectsContacted || 0,
    approval_rate: 85,
    top_opportunity: topProspect ? `${topProspect.nombre_empresa} (score: ${topProspect.score})` : 'Ninguna aún',
    critical_errors: errors
  };
}

async function weeklyBusinessCouncil() {
  console.log('📊 WEEKLY BUSINESS COUNCIL: iniciando...');

  try {
    const semana = await getWeekMetrics();

    let council = null;

    if (global.oracle?.consult) {
      const result = await global.oracle.consult({
        question: `Eres el consejero estratégico de Fractal MX.
No eres un reporte — eres un socio que habla directo.

DATOS DE LA SEMANA:
- Revenue: $${semana.revenue} USD
- Meta semanal: $${Math.round(semana.meta / 4)} USD (meta mensual: $${semana.meta} USD)
- Proyectos entregados: ${semana.delivered}
- Artes producidos: ${semana.arts}
- Prospectos contactados: ${semana.prospects_contacted}
- Tasa aprobación NKD: ${semana.approval_rate}%
- Top oportunidad AXIOM: ${semana.top_opportunity}
- Errores críticos: ${semana.critical_errors}

GENERA EL BUSINESS COUNCIL:
1. Semáforo del negocio: verde (bien) / amarillo (atención) / rojo (acción urgente)
2. La semana en 3 puntos clave (máximo)
3. Qué funcionó y por qué
4. Qué NO funcionó y qué cambiar
5. La decisión más importante que NKD debe tomar esta semana
6. Una métrica de foco para esta semana
7. Predicción: ¿cómo va a cerrar el mes?

Sin rodeos. Sin adulación. Con opinión real.
Formato: WhatsApp (sin markdown, sin asteriscos). Máximo 300 palabras.`,
        agent: { id: null, name: 'ORACLE', role: 'weekly_business_council' },
        depth: 'deep'
      });
      council = result?.answer;
    }

    if (!council) {
      council = `Semana ${getWeekNumber()} - Revenue: $${semana.revenue} USD\n\nEl sistema generó ${semana.arts} artes y contactó ${semana.prospects_contacted} prospectos.\n\nTop oportunidad: ${semana.top_opportunity}\n\nAcción recomendada: revisar pipeline de clientes y cerrar nuevos contratos antes del día 20.`;
    }

    const waMessage = `📊 Business Council Semanal\n\n${council.substring(0, 800)}${council.length > 800 ? '...' : ''}`;
    await notifyNeiky(waMessage);

    // Intentar enviar por email si está configurado
    try {
      if (process.env.RESEND_API_KEY && process.env.NEIKY_EMAIL) {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'Fractal MX <oracle@fractalmx.com>',
          to: process.env.NEIKY_EMAIL,
          subject: `📊 Business Council — Semana ${getWeekNumber()}`,
          text: council
        });
        console.log('  ✓ Business Council enviado por email');
      }
    } catch (emailErr) {
      console.warn('[WeeklyCouncil] email skip:', emailErr.message);
    }

    console.log('✅ Weekly Business Council enviado a NKD');
    return { success: true, semana, council };

  } catch (err) {
    console.error('❌ Weekly Business Council error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { weeklyBusinessCouncil };
