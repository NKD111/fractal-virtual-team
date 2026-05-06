// backend/src/routines/oracle-daily-report.js
// Cron 8:00 AM CDMX — genera reporte ejecutivo del día y envía via Resend a NKD.
// Si Resend no está disponible o falla, fallback: WhatsApp via ChannelAdapter.

const cron = require('node-cron');
const { supabase } = require('../core/supabase');
const TZ = { timezone: 'America/Mexico_City' };

let _scheduled = null;

async function generateReport() {
  const now = new Date();
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // 1. System status (last health check or quick checks)
  let healthSummary = 'unknown';
  try {
    const axios = require('axios');
    const { data } = await axios.get('https://fractal-virtual-team-production.up.railway.app/webhook/health', { timeout: 5000 });
    healthSummary = data.status === 'healthy' ? '✅ healthy' : `⚠️ ${data.status}`;
  } catch (_) { healthSummary = '❌ unreachable'; }

  // 2. Active projects
  let projectsActive = [];
  try {
    const { data } = await supabase.from('projects')
      .select('client_name, project_type, status, deadline')
      .not('status', 'in', '("paid","cancelled")')
      .order('deadline', { ascending: true })
      .limit(10);
    projectsActive = data || [];
  } catch (_) {}

  // 3. Revenue this month
  let revenueMonthMxn = 0;
  let revenueMonthCount = 0;
  try {
    const { data } = await supabase.from('revenue_log')
      .select('amount_mxn').eq('status', 'confirmed').gte('timestamp', monthStart.toISOString());
    revenueMonthMxn = (data || []).reduce((a, r) => a + (r.amount_mxn || 0), 0);
    revenueMonthCount = (data || []).length;
  } catch (_) {}

  // 4. Top 3 AXIOM opportunities
  let topOpps = [];
  try {
    const { data } = await supabase.from('axiom_opportunities')
      .select('title, score_total, score, urgency, estimated_revenue_mxn')
      .in('status', ['detected', 'open'])
      .order('score_total', { ascending: false, nullsFirst: false })
      .limit(3);
    topOpps = data || [];
  } catch (_) {}

  // 5. Anomalies (errores en últimas 24h)
  let errorCount = 0;
  let lastError = null;
  try {
    const { data } = await supabase.from('audit_log')
      .select('action, error_code, timestamp')
      .eq('status', 'failed')
      .gte('timestamp', yesterday.toISOString())
      .order('timestamp', { ascending: false }).limit(5);
    errorCount = (data || []).length;
    lastError = data && data[0] ? `${data[0].action} (${data[0].error_code})` : null;
  } catch (_) {}

  // 6. Compose report (markdown)
  const md = `# ☀️ Fractal MX — Reporte ${now.toISOString().slice(0,10)}

## 🩺 Sistema
${healthSummary}
Last 24h errors: ${errorCount}${lastError ? ` (last: ${lastError})` : ''}

## 📋 Proyectos activos (${projectsActive.length})
${projectsActive.slice(0, 8).map(p => `- ${p.client_name || '?'} — ${p.project_type || '?'} — ${p.status} — deadline: ${p.deadline ? new Date(p.deadline).toISOString().slice(0,10) : 'sin fecha'}`).join('\n') || '(ninguno)'}

## 💰 Ingresos mes ${now.toISOString().slice(0,7)}
$${revenueMonthMxn.toLocaleString('es-MX')} MXN — ${revenueMonthCount} ventas

## 🔵 Top oportunidades AXIOM
${topOpps.map((o, i) => `${i+1}. **${o.title}** [${o.urgency}·${o.score_total ?? o.score ?? '?'}] — est. $${o.estimated_revenue_mxn || '?'} MXN/mes`).join('\n') || '(sin opps abiertas — verifica que AXIOM tenga datos: SELECT * FROM axiom_opportunities)'}

## 🎯 Sugerencia del día
${projectsActive.length > 5 ? '⚠️ Tienes 5+ proyectos activos. Considera priorizar deadlines más próximos.' : ''}
${errorCount > 5 ? '⚠️ +5 errores en 24h. Revisar audit_log.' : ''}
${revenueMonthMxn === 0 && now.getDate() > 7 ? '💡 Sin ingresos registrados este mes. Activar productos digitales o seguir leads activos.' : ''}
${topOpps.length > 0 && (topOpps[0].score_total >= 42 || topOpps[0].score >= 8) ? `🚀 Oportunidad top de AXIOM: "${topOpps[0].title}" — score alto, considera ejecutar hoy.` : ''}
`;

  return { md, plainSummary: `Sistema ${healthSummary}. ${projectsActive.length} proyectos. $${revenueMonthMxn} MXN mes. ${topOpps.length} opps abiertas.` };
}

async function sendReport() {
  const start = Date.now();
  try {
    const report = await generateReport();
    const RESEND_KEY = process.env.RESEND_API_KEY_FULL || process.env.RESEND_API_KEY;
    const NKD_EMAIL = process.env.NEIKY_EMAIL || 'nakedgeometry19@gmail.com';

    let sentVia = 'none';
    if (RESEND_KEY) {
      try {
        const axios = require('axios');
        const r = await axios.post('https://api.resend.com/emails', {
          from: 'mariana@fractalstudio.com.mx', // requires verified domain
          to: NKD_EMAIL,
          subject: `☀️ Fractal MX — Reporte ${new Date().toISOString().slice(0,10)}`,
          text: report.md
        }, { headers: { Authorization: `Bearer ${RESEND_KEY}` }, timeout: 12000 });
        sentVia = 'resend';
      } catch (e) {
        // Fallback WhatsApp via ChannelAdapter
        try {
          const ChannelAdapter = require('../core/channel-adapter');
          const phone = process.env.NEIKY_WHATSAPP || '+5215534189583';
          await ChannelAdapter.send(phone, report.md.slice(0, 1500));
          sentVia = 'whatsapp_fallback';
        } catch (_) { sentVia = 'failed'; }
      }
    } else {
      // No Resend → WhatsApp directo
      try {
        const ChannelAdapter = require('../core/channel-adapter');
        const phone = process.env.NEIKY_WHATSAPP || '+5215534189583';
        await ChannelAdapter.send(phone, report.md.slice(0, 1500));
        sentVia = 'whatsapp';
      } catch (_) { sentVia = 'failed'; }
    }

    await supabase.rpc('log_action', {
      p_actor: 'oracle',
      p_action: 'daily_report_sent',
      p_service: sentVia,
      p_status: sentVia === 'failed' ? 'failed' : 'success',
      p_details: { duration_ms: Date.now() - start, summary: report.plainSummary }
    }).then(() => {}).catch(() => {});

    console.log(`[oracle-daily] report sent via ${sentVia} in ${Date.now() - start}ms`);
    return { sentVia, summary: report.plainSummary };
  } catch (e) {
    console.error('[oracle-daily] failed:', e.message);
    return { sentVia: 'failed', error: e.message };
  }
}

function start() {
  if (_scheduled) return;
  _scheduled = cron.schedule('0 8 * * *', () => sendReport().catch(e => console.error('oracle-daily err:', e.message)), TZ);
  console.log('[oracle-daily] ⏰ cron registered: 8:00 AM CDMX daily');
}

function stop() {
  if (_scheduled) { _scheduled.stop(); _scheduled = null; }
}

module.exports = { start, stop, sendReport };
