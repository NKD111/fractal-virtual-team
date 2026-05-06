// backend/src/pipelines/n8n-workflows.js
// BLOQUE K — 5 workflows N8N para automatización operacional
// Requiere N8N_WEBHOOK_URL + N8N_API_KEY en env vars

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');

// ─── Definición de workflows ─────────────────────────────────────────────────
const WORKFLOWS = [
  {
    id: 'WF-1',
    nombre: 'parrilla_fif_entrega_claudia',
    descripcion: 'Entrega automática de parrilla FIF a Claudia cuando NKD aprueba.',
    trigger: 'Supabase: parrilla_briefs status = aprobado_nkd',
    acciones: [
      'Recopilar todas las artes del mes aprobadas',
      'Generar email formal de entrega',
      'Enviar email a CLAUDIA_EMAIL con artes adjuntas',
      'Actualizar status a "entregado" en Supabase',
      'Notificar a NKD por WhatsApp con confirmación',
      'Registrar $1,000 USD en revenue'
    ],
    env_vars: ['CLAUDIA_EMAIL', 'N8N_WEBHOOK_URL'],
    prioridad: 'alta'
  },
  {
    id: 'WF-2',
    nombre: 'axiom_lead_a_mariana',
    descripcion: 'Activa a Mariana cuando AXIOM detecta prospecto caliente.',
    trigger: 'Supabase: prospects score > 40',
    acciones: [
      'Leer datos del prospecto (empresa, mensaje sugerido, score)',
      'Si score > 70: notificar NKD para aprobación primero',
      'Si score 40-70: notificar Mariana directamente con mensaje sugerido',
      'Registrar fecha_primer_contacto en Supabase',
      'Crear seguimiento en 48h si no hay respuesta'
    ],
    env_vars: ['N8N_WEBHOOK_URL', 'NEIKY_WHATSAPP'],
    prioridad: 'alta'
  },
  {
    id: 'WF-3',
    nombre: 'metricas_a_sheets',
    descripcion: 'Exporta métricas diarias a Google Sheets para tracking visual.',
    trigger: 'Cron diario 23:30 CDMX',
    acciones: [
      'Leer último registro de metric_snapshots',
      'Formatear datos (fecha, revenue, proyectos, AXIOM, sistema)',
      'Append row en Google Sheet "Fractal MX Métricas"',
      'Actualizar dashboard Tab con totales del mes',
      'Si revenue < 70% de meta: flag en rojo'
    ],
    env_vars: ['GOOGLE_SHEETS_ID', 'GOOGLE_SERVICE_ACCOUNT', 'N8N_WEBHOOK_URL'],
    prioridad: 'media'
  },
  {
    id: 'WF-4',
    nombre: 'nuevo_cliente_onboarding',
    descripcion: 'Onboarding automático cuando entra un nuevo cliente/pago.',
    trigger: 'Stripe: nuevo pago recurrente aprobado',
    acciones: [
      'Crear proyecto en Supabase con datos del cliente',
      'Notificar a Sofia y Diana para iniciar gestión',
      'Enviar email de bienvenida al cliente (Resend)',
      'Actualizar ROBERTO con nuevas métricas de revenue',
      'Notificar a NKD con resumen del nuevo cliente'
    ],
    env_vars: ['STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'N8N_WEBHOOK_URL'],
    prioridad: 'media'
  },
  {
    id: 'WF-5',
    nombre: 'revenue_alert',
    descripcion: 'Alerta urgente si revenue está por debajo del 70% de la meta mensual el día 20.',
    trigger: 'Cron día 20 mediodía CDMX',
    condicion: 'Revenue mes < $3,500 USD (70% de $5,000)',
    acciones: [
      'Calcular revenue acumulado del mes actual',
      'Si < 70% de meta: enviar alerta urgente a NKD',
      'Activar a AXIOM en modo intensivo (scan cada 2h por 5 días)',
      'ORACLE genera análisis: qué falló, qué hacer urgente',
      'Sugerir a NKD 3 acciones concretas para recuperar el mes'
    ],
    env_vars: ['N8N_WEBHOOK_URL', 'NEIKY_WHATSAPP'],
    prioridad: 'critica'
  }
];

// ─── Trigger helper ───────────────────────────────────────────────────────────

/**
 * Dispara un webhook de N8N para activar un workflow específico.
 *
 * @param {string} workflowName - nombre del workflow (ej: 'parrilla_fif_entrega_claudia')
 * @param {object} data - payload a enviar al workflow
 */
async function triggerN8NWorkflow(workflowName, data = {}) {
  const baseUrl = process.env.N8N_WEBHOOK_URL;
  if (!baseUrl) {
    console.warn(`[N8N] N8N_WEBHOOK_URL no configurado — skip trigger: ${workflowName}`);
    return { skipped: true, reason: 'N8N_WEBHOOK_URL not set' };
  }

  const url = `${baseUrl.replace(/\/$/, '')}/${workflowName}`;

  try {
    const https = require('https');
    const http = require('http');
    const client = url.startsWith('https') ? https : http;
    const body = JSON.stringify({ workflow: workflowName, data, timestamp: new Date().toISOString() });
    const parsed = new URL(url);

    await new Promise((resolve, reject) => {
      const req = client.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(process.env.N8N_API_KEY ? { 'X-N8N-API-KEY': process.env.N8N_API_KEY } : {})
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
          else reject(new Error(`N8N returned ${res.statusCode}: ${body.slice(0, 200)}`));
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('N8N webhook timeout')); });
      req.write(body);
      req.end();
    });

    console.log(`[N8N] ✅ workflow triggered: ${workflowName}`);
    return { success: true, workflow: workflowName };
  } catch (err) {
    console.error(`[N8N] ❌ trigger failed (${workflowName}):`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── Revenue Alert (WF-5 logic) ──────────────────────────────────────────────

async function checkRevenueAlert() {
  try {
    const now = new Date();
    if (now.getDate() !== 20) return { skipped: true, reason: 'Not day 20' };

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const { data: sales } = await supabase
      .from('digital_products_sales')
      .select('precio_usd')
      .gte('created_at', monthStart);

    const revenueMes = (sales || []).reduce((s, r) => s + (r.precio_usd || 0), 0);
    const meta = 5000;
    const porcentaje = Math.round((revenueMes / meta) * 100);

    if (revenueMes < meta * 0.7) {
      const mensaje = `🚨 REVENUE ALERT — Día 20\n\nRevenue acumulado: $${revenueMes} USD (${porcentaje}% de la meta)\nMeta: $${meta} USD\nFalta: $${meta - revenueMes} USD\n\nACCIÓN URGENTE: AXIOM intensificando scan a cada 2h por 5 días.\nRevisar pipeline de ventas y activar ORACLE para análisis.`;

      await notifyNeiky(mensaje);
      await triggerN8NWorkflow('revenue_alert', { revenue_mes: revenueMes, meta, porcentaje });

      // Guardar evento en system_events
      await supabase.from('system_events').insert({
        event_type: 'revenue_alert_day20',
        severity: 'critical',
        service_key: 'revenue',
        details: { revenue_mes: revenueMes, meta, porcentaje }
      });

      console.log(`🚨 [N8N] Revenue alert enviado: $${revenueMes}/$${meta} (${porcentaje}%)`);
      return { alerted: true, revenue_mes: revenueMes, meta, porcentaje };
    }

    console.log(`✅ [N8N] Revenue check día 20: $${revenueMes}/$${meta} (${porcentaje}%) — OK`);
    return { alerted: false, revenue_mes: revenueMes, meta, porcentaje };
  } catch (err) {
    console.error('[N8N] checkRevenueAlert error:', err.message);
    return { error: err.message };
  }
}

// ─── Listar status de workflows ──────────────────────────────────────────────

function getWorkflowsStatus() {
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  return WORKFLOWS.map(wf => ({
    ...wf,
    configurado: wf.env_vars.every(v => !!process.env[v]),
    env_faltantes: wf.env_vars.filter(v => !process.env[v])
  }));
}

module.exports = { triggerN8NWorkflow, checkRevenueAlert, getWorkflowsStatus, WORKFLOWS };
