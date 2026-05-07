// backend/src/routines/telemetry-alerts.js
// UPGRADE 5 — Alertas automáticas de telemetría
// Cron: cada 15 minutos — verifica costo, latencia y error rate
//
// Alertas configuradas:
//   💰 Costo diario > $10 USD     → WhatsApp NKD
//   🐢 QA latencia media > 15s    → WhatsApp NKD
//   🔴 Error rate > 10%           → WhatsApp NKD
//
// Activar en index.js:
//   const { startTelemetryAlertsCron } = require('./routines/telemetry-alerts');
//   startTelemetryAlertsCron();

'use strict';

const { getCostsToday, getLatencyByTask, getErrorRate } = require('../core/telemetry');
const { notifyNeiky } = require('../core/whatsapp');

// ── Thresholds ────────────────────────────────────────────────────────────────
const THRESHOLDS = {
  costo_warn_usd:     5,    // Aviso temprano
  costo_critical_usd: 10,   // Alerta crítica
  latencia_warn_ms:   15000, // 15s
  error_rate_warn:    10,   // 10%
  error_rate_critical: 25   // 25%
};

// ── Anti-spam: una alerta por tipo por hora ───────────────────────────────────
const _lastAlerted = {};
function shouldAlert(key, cooldownMs = 3_600_000) {
  const now = Date.now();
  if (_lastAlerted[key] && now - _lastAlerted[key] < cooldownMs) return false;
  _lastAlerted[key] = now;
  return true;
}

async function checkTelemetryAlerts() {
  const now = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  console.log(`[TelemetryAlerts] Check ${now}`);

  const alerts = [];

  // ── ALERTA 1: Costo diario ────────────────────────────────────────────────
  try {
    const { total: costHoy, by_provider } = await getCostsToday();

    if (costHoy >= THRESHOLDS.costo_critical_usd && shouldAlert('cost_critical')) {
      const proyeccion = costHoy / (new Date().getHours() || 1) * 24;
      alerts.push(
        `💰 ALERTA COSTO CRÍTICO\n` +
        `API: $${costHoy.toFixed(2)} USD hoy\n` +
        `Por proveedor: ${Object.entries(by_provider || {}).map(([k, v]) => `${k}: $${v.toFixed(3)}`).join(', ')}\n` +
        `Proyección fin de día: ~$${proyeccion.toFixed(2)} USD`
      );
    } else if (costHoy >= THRESHOLDS.costo_warn_usd && shouldAlert('cost_warn', 7_200_000)) {
      alerts.push(`📊 Costo API hoy: $${costHoy.toFixed(3)} USD (aviso temprano a $${THRESHOLDS.costo_warn_usd})`);
    }
  } catch (e) {
    console.warn('[TelemetryAlerts] Costo check error:', e.message);
  }

  // ── ALERTA 2: Latencia alta ───────────────────────────────────────────────
  try {
    const latencias = await getLatencyByTask(1); // última hora
    const slowTasks = latencias.filter(t => t.avg_ms > THRESHOLDS.latencia_warn_ms);

    if (slowTasks.length > 0 && shouldAlert('latency', 1_800_000)) {
      const lista = slowTasks.map(t => `  • ${t.task}: ${(t.avg_ms/1000).toFixed(1)}s (${t.calls} calls)`).join('\n');
      alerts.push(
        `🐢 ALERTA LATENCIA\n` +
        `Tareas lentas (>${THRESHOLDS.latencia_warn_ms/1000}s):\n${lista}\n` +
        `QA turbo objetivo: <8s. Verificar circuit breakers.`
      );
    }
  } catch (e) {
    console.warn('[TelemetryAlerts] Latencia check error:', e.message);
  }

  // ── ALERTA 3: Error rate ──────────────────────────────────────────────────
  try {
    const { overall: errRate } = await getErrorRate(1); // última hora
    const rate = parseFloat(errRate) || 0;

    if (rate >= THRESHOLDS.error_rate_critical && shouldAlert('error_critical')) {
      alerts.push(
        `🔴 ERROR RATE CRÍTICA: ${rate}%\n` +
        `Umbral: ${THRESHOLDS.error_rate_critical}%\n` +
        `Sistema en modo degradado. Verificar Railway logs.`
      );
    } else if (rate >= THRESHOLDS.error_rate_warn && shouldAlert('error_warn', 1_800_000)) {
      alerts.push(`⚠️ Error rate elevada: ${rate}% (umbral warn: ${THRESHOLDS.error_rate_warn}%)`);
    }
  } catch (e) {
    console.warn('[TelemetryAlerts] Error rate check error:', e.message);
  }

  // ── Enviar alertas ────────────────────────────────────────────────────────
  if (alerts.length > 0) {
    const msg =
      `🤖 FRACTAL MX — Telemetría Alert\n` +
      `${now}\n\n` +
      alerts.join('\n\n─────────────\n') +
      `\n\n📊 Ver detalle: GET /api/dashboard/telemetry`;

    try {
      await notifyNeiky(msg);
      console.log(`[TelemetryAlerts] ${alerts.length} alerta(s) enviadas a NKD`);
    } catch (e) {
      console.warn('[TelemetryAlerts] WhatsApp send error:', e.message);
    }
  } else {
    console.log('[TelemetryAlerts] No alerts — sistema OK');
  }

  return { alerts_count: alerts.length, alerts };
}

function startTelemetryAlertsCron() {
  try {
    const cron = require('node-cron');
    // Cada 15 minutos
    cron.schedule('*/15 * * * *', () => {
      checkTelemetryAlerts().catch(e =>
        console.error('[TelemetryAlerts] cron error:', e.message)
      );
    }, { timezone: 'America/Mexico_City' });

    console.log('✅ Telemetry Alerts: cron cada 15min activo');
  } catch (e) {
    console.warn('[TelemetryAlerts] No se pudo iniciar cron:', e.message);
  }
}

module.exports = { checkTelemetryAlerts, startTelemetryAlertsCron, THRESHOLDS };
