// backend/src/workers/promise.worker.js
// BullMQ Worker — ejecuta promesas de Mariana cuando vence el tiempo
// Se inicia desde index.js junto con el servidor

const { Worker } = require('bullmq');
const promiseTracker = require('../core/promise-tracker');

let worker = null;

function startPromiseWorker() {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;

  if (!redisUrl) {
    console.log('[PromiseWorker] Sin Redis — jobs se manejan con setTimeout (en-memoria)');
    return null;
  }

  const connection = { url: redisUrl, maxRetriesPerRequest: null };

  worker = new Worker('fractal-promises', async (job) => {
    console.log(`[PromiseWorker] ⚡ Job ejecutando: ${job.name} | id=${job.id}`);

    const { promiseId, promise, context } = job.data;
    await promiseTracker.executePromise({ promiseId, promise, context });

    console.log(`[PromiseWorker] ✅ Job completado: ${job.id}`);

  }, {
    connection,
    concurrency: 3,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 }
  });

  worker.on('completed', (job) => {
    console.log(`[PromiseWorker] Job ${job.id} completado exitosamente`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[PromiseWorker] Job ${job?.id} falló:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[PromiseWorker] Worker error:', err.message);
  });

  console.log('[PromiseWorker] ✅ BullMQ worker iniciado — escuchando cola fractal-promises');
  return worker;
}

function stopPromiseWorker() {
  return worker?.close();
}

module.exports = { startPromiseWorker, stopPromiseWorker };
