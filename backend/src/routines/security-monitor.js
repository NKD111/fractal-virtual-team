// backend/src/routines/security-monitor.js
// Tarea 8 — Health monitor cada 30min + backup nocturno + log rotation.

const cron = require('node-cron');
const axios = require('axios');
const { supabase } = require('../core/supabase');
const TZ = { timezone: 'America/Mexico_City' };

let _healthCron = null;
let _backupCron = null;
let _rotationCron = null;
let _consecutiveFails = 0;

async function checkHealth() {
  try {
    const { data } = await axios.get('https://fractal-virtual-team-production.up.railway.app/webhook/health', { timeout: 8000 });
    const isHealthy = data.status === 'healthy';

    // Trackear failures consecutivas
    if (!isHealthy) {
      _consecutiveFails++;
      console.warn(`[health-monitor] degraded (${_consecutiveFails}/3)`);

      // 3 fallos seguidos → notificar a NKD
      if (_consecutiveFails === 3) {
        try {
          const ChannelAdapter = require('../core/channel-adapter');
          const NKD = process.env.NEIKY_WHATSAPP || '+5215534189583';
          const services = data.services || {};
          const failed = Object.entries(services).filter(([k, v]) => v !== 'healthy' && v !== 'not_configured').map(([k, v]) => `${k}=${v}`).join(', ');
          await ChannelAdapter.send(NKD,
            `🚨 Sistema Fractal MX degraded x3.\n\nServicios: ${failed || data.status}\n\nRevisa logs Railway.`
          );
        } catch (_) {}

        await supabase.rpc('log_action', {
          p_actor: 'health_monitor',
          p_action: 'alert_sent',
          p_service: 'system',
          p_status: 'success',
          p_details: { consecutive_fails: _consecutiveFails, services: data.services },
          p_error_code: 'HEALTH_DEGRADED_3X'
        }).catch(() => {});
      }
    } else {
      if (_consecutiveFails > 0) console.log('[health-monitor] recovered after', _consecutiveFails, 'fails');
      _consecutiveFails = 0;
    }
  } catch (err) {
    _consecutiveFails++;
    console.error('[health-monitor] check failed:', err.message);
  }
}

async function nightlyBackup() {
  console.log('[backup] starting nightly backup...');
  const tables = ['agents', 'clients', 'projects', 'revenue_log', 'audit_log', 'oracle_memory', 'conversations', 'messages', 'mariana_context', 'axiom_opportunities', 'digital_products'];
  const dump = {};
  let totalRows = 0;

  for (const t of tables) {
    try {
      const { data, count } = await supabase.from(t).select('*', { count: 'exact' }).limit(5000);
      dump[t] = { count: count || (data || []).length, rows: data || [] };
      totalRows += dump[t].count;
    } catch (e) {
      dump[t] = { error: e.message };
    }
  }

  // Save dump file in /tmp (Railway volume) o enviar via Resend si tiene full key
  const fs = require('fs');
  const path = require('path');
  const date = new Date().toISOString().slice(0, 10);
  const filename = `/tmp/fractal-backup-${date}.json`;
  try {
    fs.writeFileSync(filename, JSON.stringify(dump, null, 2));
    console.log(`[backup] saved to ${filename}, ${totalRows} rows total`);

    // Try email via Resend
    const RESEND_KEY = process.env.RESEND_API_KEY_FULL || process.env.RESEND_API_KEY;
    if (RESEND_KEY) {
      const NKD_EMAIL = process.env.NEIKY_EMAIL || 'nakedgeometry19@gmail.com';
      try {
        await axios.post('https://api.resend.com/emails', {
          from: 'mariana@fractalstudio.com.mx',
          to: NKD_EMAIL,
          subject: `🗄️ Backup Fractal MX ${date}`,
          text: `Backup automático nocturno.\n\nTotal rows: ${totalRows}\nTablas: ${Object.keys(dump).map(t => `${t}=${dump[t].count || 'err'}`).join(', ')}\n\n(Archivo en Railway /tmp/${path.basename(filename)})`
        }, { headers: { Authorization: `Bearer ${RESEND_KEY}` }, timeout: 12000 });
      } catch (e) { console.warn('[backup] email failed:', e.message); }
    }

    await supabase.rpc('log_action', {
      p_actor: 'backup',
      p_action: 'nightly_completed',
      p_service: 'backup',
      p_status: 'success',
      p_details: { total_rows: totalRows, tables: Object.keys(dump).length, filename }
    }).catch(() => {});
  } catch (e) {
    console.error('[backup] save failed:', e.message);
  }
}

async function logRotation() {
  console.log('[log-rotation] purging successful audit_log entries > 30 days...');
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { count } = await supabase.from('audit_log').delete({ count: 'exact' })
      .lt('timestamp', cutoff).eq('status', 'success');
    console.log(`[log-rotation] purged ${count || 0} success entries`);

    await supabase.rpc('log_action', {
      p_actor: 'log_rotation',
      p_action: 'purge_completed',
      p_service: 'audit_log',
      p_status: 'success',
      p_details: { purged_count: count || 0, cutoff }
    }).catch(() => {});
  } catch (e) {
    console.error('[log-rotation] failed:', e.message);
  }
}

function start() {
  if (!_healthCron) {
    // Cada 30 min
    _healthCron = cron.schedule('*/30 * * * *', () => checkHealth().catch(e => console.error('hc err:', e.message)), TZ);
    console.log('[security] health-monitor cron registered (every 30min)');
  }
  if (!_backupCron) {
    // 3:00 AM CDMX daily
    _backupCron = cron.schedule('0 3 * * *', () => nightlyBackup().catch(e => console.error('backup err:', e.message)), TZ);
    console.log('[security] backup cron registered (3:00 AM daily)');
  }
  if (!_rotationCron) {
    // Domingo 4:00 AM weekly
    _rotationCron = cron.schedule('0 4 * * 0', () => logRotation().catch(e => console.error('rotation err:', e.message)), TZ);
    console.log('[security] log-rotation cron registered (Sunday 4 AM)');
  }
}

function stop() {
  if (_healthCron) { _healthCron.stop(); _healthCron = null; }
  if (_backupCron) { _backupCron.stop(); _backupCron = null; }
  if (_rotationCron) { _rotationCron.stop(); _rotationCron = null; }
}

module.exports = { start, stop, checkHealth, nightlyBackup, logRotation };
