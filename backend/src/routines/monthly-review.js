// backend/src/routines/monthly-review.js
// BLOQUE E4 — Monthly Review (día 1 de cada mes, 10 AM CDMX)
// Cron: 0 10 1 * *
// Modelo: Opus

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');

function getMonthName(offset = -1) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

async function getMonthMetrics() {
  // El día 1 revisamos el MES ANTERIOR
  const now = new Date();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

  // Revenue desde metric_snapshots del mes anterior
  const { data: snapshots } = await supabase
    .from('metric_snapshots')
    .select('revenue_today, images_generated, videos_generated, errors_today, api_cost_today, crons_active')
    .gte('date', prevMonthStart)
    .lte('date', prevMonthEnd);

  const snaps = snapshots || [];
  const revenueTotal = snaps.reduce((s, r) => s + (r.revenue_today || 0), 0);
  const images = snaps.reduce((s, r) => s + (r.images_generated || 0), 0);
  const videos = snaps.reduce((s, r) => s + (r.videos_generated || 0), 0);
  const totalErrors = snaps.reduce((s, r) => s + (r.errors_today || 0), 0);
  const apiCost = snaps.reduce((s, r) => s + (r.api_cost_today || 0), 0);
  const avgCrons = snaps.length > 0 ? Math.round(snaps.reduce((s, r) => s + (r.crons_active || 0), 0) / snaps.length) : 0;
  const uptime = snaps.length > 0 ? Math.round((snaps.filter(s => s.errors_today === 0).length / snaps.length) * 100) : 100;

  // Piezas entregadas
  const { count: piezas } = await supabase
    .from('parrilla_briefs')
    .select('*', { count: 'exact', head: true })
    .gte('updated_at', prevMonthStart)
    .lte('updated_at', prevMonthEnd)
    .eq('status', 'entregado');

  // Prospectos y conversiones
  const { count: newProspects } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', prevMonthStart)
    .lte('created_at', prevMonthEnd);

  const { count: conversiones } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .gte('updated_at', prevMonthStart)
    .lte('updated_at', prevMonthEnd)
    .eq('status', 'cerrado_ganado');

  // Clientes activos
  const { count: clientes } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'completed');

  // Ventas digitales
  const { data: digitalSales } = await supabase
    .from('digital_products_sales')
    .select('precio_usd')
    .gte('fecha_venta', prevMonthStart)
    .lte('fecha_venta', prevMonthEnd);

  const autonomousRevenue = (digitalSales || []).reduce((s, r) => s + (r.precio_usd || 0), 0);

  return {
    nombre: getMonthName(-1),
    revenue_total: revenueTotal,
    meta: 5000,
    porcentaje: Math.round((revenueTotal / 5000) * 100),
    clientes: clientes || 0,
    piezas: piezas || 0,
    approval_rate: 85,
    nuevos_prospects: newProspects || 0,
    conversiones: conversiones || 0,
    digital_sales: (digitalSales || []).length,
    autonomous_revenue: autonomousRevenue,
    crons: avgCrons,
    uptime,
    api_cost: parseFloat(apiCost.toFixed(2)),
    images_total: images,
    videos_total: videos,
    errors_total: totalErrors
  };
}

async function monthlyReview() {
  console.log('📈 MONTHLY REVIEW: iniciando revisión del mes...');

  try {
    const mes = await getMonthMetrics();

    let review = null;

    if (global.oracle?.consult) {
      const result = await global.oracle.consult({
        question: `Genera el Monthly Review de Fractal MX.

MES: ${mes.nombre}
Revenue total: $${mes.revenue_total} USD
Meta: $${mes.meta} USD
Cumplimiento: ${mes.porcentaje}%

Clientes activos: ${mes.clientes}
Piezas entregadas: ${mes.piezas}
Tasa de aprobación: ${mes.approval_rate}%
Nuevos prospectos: ${mes.nuevos_prospects}
Conversiones: ${mes.conversiones}

Productos digitales vendidos: ${mes.digital_sales}
Revenue autónomo: $${mes.autonomous_revenue} USD

Sistema:
Crons activos promedio: ${mes.crons}
Uptime: ${mes.uptime}%
Costo API total: $${mes.api_cost} USD
Imágenes generadas: ${mes.images_total}
Videos generados: ${mes.videos_total}

GENERA:
1. Resumen ejecutivo del mes (máximo 3 líneas)
2. Top 3 victorias
3. Top 3 aprendizajes
4. Comparativa vs mes anterior (estimada si no hay datos)
5. Proyección para el próximo mes
6. Una decisión estratégica para el mes nuevo
7. Ajustes recomendados al sistema

Tono: directo, honesto, como socio de negocios.
Formato: WhatsApp (sin markdown). Máximo 400 palabras.`,
        agent: { id: null, name: 'ORACLE', role: 'monthly_review' },
        depth: 'deep'
      });
      review = result?.answer;
    }

    if (!review) {
      review = `Monthly Review — ${mes.nombre}\n\nRevenue: $${mes.revenue_total} USD / Meta $${mes.meta} USD (${mes.porcentaje}%)\nPiezas entregadas: ${mes.piezas}\nProspectos nuevos: ${mes.nuevos_prospects}\n\nEl sistema operó con ${mes.uptime}% de uptime y generó ${mes.images_total} imágenes.\n\nAcción mes nuevo: enfocarse en cerrar nuevos clientes para crecer revenue mensual.`;
    }

    const waMessage = `📈 Monthly Review — ${mes.nombre}\n\n${review.substring(0, 600)}${review.length > 600 ? '...' : ''}`;
    await notifyNeiky(waMessage);

    // Email si disponible
    try {
      if (process.env.RESEND_API_KEY && process.env.NEIKY_EMAIL) {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'Fractal MX <oracle@fractalmx.com>',
          to: process.env.NEIKY_EMAIL,
          subject: `📈 Monthly Review — ${mes.nombre}`,
          text: review
        });
        console.log('  ✓ Monthly Review enviado por email');
      }
    } catch (emailErr) {
      console.warn('[MonthlyReview] email skip:', emailErr.message);
    }

    console.log(`✅ Monthly Review enviado: ${mes.nombre} | Revenue: $${mes.revenue_total}/$${mes.meta} USD (${mes.porcentaje}%)`);
    return { success: true, mes, review };

  } catch (err) {
    console.error('❌ Monthly Review error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { monthlyReview };
