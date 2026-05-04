// backend/src/workers/resources.worker.js
// Checks proyectosfractalmx@gmail.com periodically for client asset emails
// Triggered by BullMQ or can be called manually

const resourcesManager = require('../services/workflows/resources-manager');

// In-memory store for pending resource tasks (in production, use Supabase)
const pendingTasks = [];

/**
 * Register a pending resource task (called by Mariana when she asks client for assets)
 */
function registerPendingTask(task) {
  pendingTasks.push({
    id: task.id || require('uuid').v4(),
    clientName: task.clientName,
    projectName: task.projectName,
    subjectKeyword: task.subjectKeyword,
    registeredAt: new Date().toISOString(),
    notifyAgent: task.notifyAgent || 'DIEGO'
  });
  console.log(`[ResourcesWorker] Task registrada: "${task.subjectKeyword}" — esperando email en proyectosfractalmx@gmail.com`);
}

/**
 * Check for new client resources (run every 5 minutes via cron)
 */
async function checkResources() {
  if (pendingTasks.length === 0) return;
  console.log(`[ResourcesWorker] Checking ${pendingTasks.length} pending resource tasks...`);

  try {
    const processed = await resourcesManager.checkForNewResources(pendingTasks);

    for (const result of processed) {
      console.log(`[ResourcesWorker] ✅ Recursos procesados para "${result.task.projectName}": ${result.result.summary}`);

      // Notify assigned agent via Socket.io if available
      if (global.io) {
        global.io.emit('resources_ready', {
          taskId: result.task.id,
          project: result.task.projectName,
          client: result.task.clientName,
          driveFolders: result.result.folders,
          summary: result.result.summary
        });
      }

      // Remove from pending
      const idx = pendingTasks.findIndex(t => t.id === result.task.id);
      if (idx >= 0) pendingTasks.splice(idx, 1);
    }
  } catch (err) {
    console.error('[ResourcesWorker] Error checking resources:', err.message);
  }
}

/**
 * Start periodic check (called from index.js)
 */
function startResourcesWorker(intervalMs = 5 * 60 * 1000) {
  console.log(`[ResourcesWorker] Starting — checking every ${intervalMs / 60000} minutes`);
  setInterval(checkResources, intervalMs);
  // Also check immediately on start
  setTimeout(checkResources, 10000);
}

module.exports = { registerPendingTask, checkResources, startResourcesWorker };
