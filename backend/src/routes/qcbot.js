// backend/src/routes/qcbot.js
// API routes for QC-BOT — Quality Control System.

const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');

// ─── GET /api/qcbot/status ────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const agentReady = !!(global.qcbot?.think);          // QCBotAgent (full)
    const featureReady = !!(global.qcBot?.reviewDeliverable); // Feature wrapper (oracle)

    // Últimos 5 resultados
    let recentChecks = [];
    try {
      const { data } = await supabase
        .from('qc_checks')
        .select('id, task_id, check_type, status, reviewed_at')
        .order('reviewed_at', { ascending: false })
        .limit(5);
      recentChecks = data || [];
    } catch (_) {}

    res.json({
      ok: true,
      agent_ready: agentReady,
      feature_ready: featureReady,
      capabilities: ['text_check', 'design_check', 'video_check', 'content_check', 'visual_qc'],
      endpoints: {
        review: 'POST /api/qcbot/review  — oracle-driven (projectId, deliverableType, content)',
        check:  'POST /api/qcbot/check   — full report (taskId, assetType, assetDescription, brief)',
        results:'GET  /api/qcbot/results — últimos resultados'
      },
      recent_checks: recentChecks
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/qcbot/review ───────────────────────────────────────────────────
// Oracle-driven review. Evalúa contenido vs criterios del tipo.
// Body: { projectId, deliverableType: 'video'|'branding'|'copy', content, checklistId? }
router.post('/review', async (req, res) => {
  try {
    if (!global.qcBot?.reviewDeliverable) {
      return res.status(503).json({ error: 'QC-BOT feature no inicializado' });
    }
    const { projectId, deliverableType, content, checklistId } = req.body || {};
    if (!deliverableType || !content) {
      return res.status(400).json({ error: 'deliverableType y content son requeridos' });
    }
    const result = await global.qcBot.reviewDeliverable({ projectId, deliverableType, content, checklistId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/qcbot/check ────────────────────────────────────────────────────
// Full QC check con reporte técnico por tipo de asset.
// Body: { taskId, assetType: 'design'|'video'|'content', assetDescription, brief, createdBy? }
router.post('/check', async (req, res) => {
  try {
    if (!global.qcbot?.processCheck) {
      return res.status(503).json({ error: 'QCBotAgent no inicializado' });
    }
    const { taskId, assetType, assetDescription, brief, createdBy } = req.body || {};
    if (!taskId || !assetType || !assetDescription) {
      return res.status(400).json({ error: 'taskId, assetType y assetDescription son requeridos' });
    }
    const report = await global.qcbot.processCheck({ taskId, assetType, assetDescription, brief: brief || {}, createdBy });
    const passed = report.includes('✅ APROBADO');
    res.json({ ok: true, passed, report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/qcbot/text ─────────────────────────────────────────────────────
// Check rápido de texto (ortografía, gramática, datos)
// Body: { text, client? }
router.post('/text', async (req, res) => {
  try {
    if (!global.qcbot?.quickTextCheck) {
      return res.status(503).json({ error: 'QCBotAgent no inicializado' });
    }
    const { text, client } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text es requerido' });
    const result = await global.qcbot.quickTextCheck(text, client || {});
    const passed = result.includes('Sin issues');
    res.json({ ok: true, passed, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/qcbot/results ───────────────────────────────────────────────────
// Últimos resultados de QC desde qc_checks
router.get('/results', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { status, check_type } = req.query;

    let q = supabase
      .from('qc_checks')
      .select('id, task_id, check_type, status, qc_report, reviewed_at')
      .order('reviewed_at', { ascending: false })
      .limit(limit);

    if (status) q = q.eq('status', status);
    if (check_type) q = q.eq('check_type', check_type);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ results: data || [], count: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
