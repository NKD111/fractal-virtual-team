// backend/src/routines/axiom-scan.js
// Cron job que dispara AxiomAgent.scanCycle() cada 6 horas.
// Se registra en el RoutineManager (backend/src/routines/index.js)
// con schedule '0 */6 * * *' en TZ America/Mexico_City.

const cron = require('node-cron');
const TZ = { timezone: 'America/Mexico_City' };

let _scanCron = null;
let _running = false;
let _lastRun = null;

function _getAxiomAgent() {
  const AxiomAgent = require('../agents/axiom.agent');
  return new AxiomAgent();
}

/**
 * Ejecuta una scan cycle. Si ya está corriendo, no lanza una nueva (lock).
 */
async function runScan(reason = 'cron') {
  if (_running) {
    console.log(`[axiom-scan] skip — ya corriendo (last started ${_lastRun})`);
    return { skipped: true, reason: 'already_running' };
  }
  _running = true;
  _lastRun = new Date().toISOString();
  try {
    const axiom = _getAxiomAgent();
    if (typeof axiom.init === 'function') await axiom.init();
    const result = await axiom.scanCycle();
    console.log(`[axiom-scan] ${reason} done:`, JSON.stringify(result.summary));
    return result;
  } catch (err) {
    console.error('[axiom-scan] failed:', err.message);
    throw err;
  } finally {
    _running = false;
  }
}

/**
 * Inicia el cron — cada 6 horas (00:00, 06:00, 12:00, 18:00 CDMX).
 * Llamado desde RoutineManager.initialize() en backend/src/routines/index.js.
 */
function start() {
  if (_scanCron) {
    console.log('[axiom-scan] already started');
    return;
  }
  _scanCron = cron.schedule('0 */6 * * *', () => runScan('cron').catch(e => console.error('[axiom-scan] cron err:', e.message)), TZ);
  console.log('[axiom-scan] ⏰ cron registered: every 6h CDMX (00,06,12,18)');

  // Run immediately on boot (after a 30s delay para que todo esté inicializado)
  setTimeout(() => runScan('boot').catch(e => console.error('[axiom-scan] boot err:', e.message)), 30 * 1000);
}

/**
 * Para el cron — útil en tests o shutdown graceful.
 */
function stop() {
  if (_scanCron) {
    _scanCron.stop();
    _scanCron = null;
    console.log('[axiom-scan] cron stopped');
  }
}

/**
 * Estado actual del scanner.
 */
function status() {
  return {
    cron_active: !!_scanCron,
    running_now: _running,
    last_run_started: _lastRun
  };
}

module.exports = { start, stop, runScan, status };
