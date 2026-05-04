// backend/src/workers/proactive.worker.js
// BullMQ Worker — ejecuta jobs proactivos de Mariana
// (check-ins, follow-ups, alertas críticas)

const { Worker } = require('bullmq');
const { executeJobType } = require('../core/proactive-scheduler');

let worker = null;

function startProactiveWorker() {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;

  if (!redisUrl) {
    console.log('[ProactiveWorker] Sin Redis — checks periódicos via setInterval (proactive-scheduler)');
    return null;
  }

  const connection = { url: redisUrl, maxRetriesPerRequest: null };

  worker = new Worker('fractal-proactive', async (job) => {
    console.log(`[ProactiveWorker] ⚡ Job: ${job.name} | type=${job.data.type}`);
    await executeJobType(job.data.type);
    console.log(`[ProactiveWorker] ✅ Job completado: ${job.name}`);
  }, {
    connection,
    concurrency: 2,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 30 }
  });

  worker.on('completed', (job) => {
    console.log(`[ProactiveWorker] ${job.name} completado`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[ProactiveWorker] ${job?.name} falló:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[ProactiveWorker] Worker error:', err.message);
  });

  console.log('[ProactiveWorker] ✅ BullMQ worker proactivo iniciado');
  return worker;
}

function stopProactiveWorker() {
  return worker?.close();
}

module.exports = { startProactiveWorker, stopProactiveWorker };
