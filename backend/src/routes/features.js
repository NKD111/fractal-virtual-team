// backend/src/routes/features.js
// API endpoints for the 22 features

const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');

// ─── A1: Brief Generator ─────────────────────────────────────────────────────
router.post('/brief/generate', async (req, res) => {
  try {
    const { conversationId, clientId, projectType } = req.body || {};
    if (!conversationId || !clientId || !projectType) {
      return res.status(400).json({ error: 'conversationId, clientId, projectType required' });
    }
    const r = await global.briefGenerator.generateFromConversation({ conversationId, clientId, projectType });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── A2: Quote Builder ───────────────────────────────────────────────────────
router.get('/quotes/services', (req, res) => {
  res.json({ services: global.quoteBuilder?.listServices() || [] });
});
router.post('/quotes/build', async (req, res) => {
  try {
    const { clientId, serviceType, complexity, briefId, specialNotes } = req.body || {};
    if (!clientId || !serviceType) return res.status(400).json({ error: 'clientId, serviceType required' });
    const r = await global.quoteBuilder.buildQuote({ clientId, serviceType, complexity, briefId, specialNotes });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── A3: Project Tracker ─────────────────────────────────────────────────────
router.get('/projects/dashboard', async (req, res) => {
  try { res.json(await global.projectTracker.getDashboard()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/projects/:id/status', async (req, res) => {
  try {
    const r = await global.projectTracker.updateStatus(req.params.id, req.body.status, req.body.updatedBy);
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── A4: Client Health ───────────────────────────────────────────────────────
router.post('/clients/:id/health', async (req, res) => {
  try { res.json(await global.clientHealth.calculateScore(req.params.id)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/clients/health', async (req, res) => {
  try {
    const { data } = await supabase
      .from('client_health_scores').select('*, clients(name)')
      .order('calculated_at', { ascending: false }).limit(50);
    res.json({ scores: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── A5: Delivery Checklist ──────────────────────────────────────────────────
router.post('/checklists', async (req, res) => {
  try {
    const { projectId, projectType } = req.body || {};
    res.json(await global.deliveryChecklist.createForProject(projectId, projectType));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/checklists/:id/items/:itemId/done', async (req, res) => {
  try {
    res.json(await global.deliveryChecklist.markItemDone(req.params.id, parseInt(req.params.itemId), req.body.doneBy));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── A6: Revision Tracker ────────────────────────────────────────────────────
router.post('/revisions', async (req, res) => {
  try { res.json(await global.revisionTracker.logRevision(req.body || {})); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── B1: Proactive Followups (manual trigger) ───────────────────────────────
router.post('/followups/run', async (req, res) => {
  try {
    const ProactiveFollowups = require('../features/proactive-followups');
    res.json(await new ProactiveFollowups().runDailyScan());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── B2: Financial Report (manual trigger) ──────────────────────────────────
router.post('/financial/weekly', async (req, res) => {
  try {
    const FinancialReport = require('../features/financial-report');
    res.json(await new FinancialReport().generateWeekly());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── B3: Analytics ───────────────────────────────────────────────────────────
router.get('/analytics/realtime', async (req, res) => {
  try {
    const AnalyticsDashboard = require('../features/analytics-dashboard');
    res.json(await new AnalyticsDashboard().getRealtimeData());
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/analytics/kpis/today', async (req, res) => {
  try {
    const AnalyticsDashboard = require('../features/analytics-dashboard');
    res.json(await new AnalyticsDashboard().generateDailyKPIs());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── B4: QC-Bot ──────────────────────────────────────────────────────────────
router.post('/qc/review', async (req, res) => {
  try { res.json(await global.qcBot.reviewDeliverable(req.body || {})); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── B5: Diana Health Check (manual trigger) ────────────────────────────────
router.post('/diana/health-check', async (req, res) => {
  try {
    const DianaHealthCheck = require('../features/diana-health-check');
    res.json(await new DianaHealthCheck().runWeekly());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── B6: Sprint Tracker ──────────────────────────────────────────────────────
router.post('/sprints', async (req, res) => {
  try {
    const SprintTracker = require('../features/sprint-tracker');
    res.json(await new SprintTracker().createSprint(req.body || {}));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/sprints/:projectId/scrum', async (req, res) => {
  try {
    const SprintTracker = require('../features/sprint-tracker');
    res.json(await new SprintTracker().getDailyScrumReport(req.params.projectId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── C: Routines manual triggers (for testing) ──────────────────────────────
router.post('/routines/morning-prep', async (req, res) => {
  try { res.json(await global.routines.morningPrep()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/routines/nightly', async (req, res) => {
  try { res.json(await global.routines.nightlyMaintenance()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── D3: Report Exporter ─────────────────────────────────────────────────────
router.get('/reports/project/:id', async (req, res) => {
  try {
    const ReportExporter = require('../features/report-exporter');
    const r = await new ReportExporter().generateProjectReport(req.params.id);
    res.set('Content-Type', 'text/html');
    res.send(r.html);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── D4: Executive Summary ───────────────────────────────────────────────────
router.get('/summary/executive', async (req, res) => {
  try {
    const ExecutiveSummary = require('../features/executive-summary');
    res.json(await new ExecutiveSummary().generate());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── D5: Projects at risk ────────────────────────────────────────────────────
router.get('/projects/at-risk', async (req, res) => {
  try {
    const cutoff = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('projects').select('id, name, status, deadline, clients(name)')
      .not('status', 'in', '("completed","cancelled")')
      .lt('deadline', cutoff);
    res.json({ at_risk: data || [], count: (data || []).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── D6: KPI Dashboard ───────────────────────────────────────────────────────
router.get('/kpis/realtime', async (req, res) => {
  try {
    const AnalyticsDashboard = require('../features/analytics-dashboard');
    res.json(await new AnalyticsDashboard().getRealtimeData());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Status: see which features are loaded ──────────────────────────────────
router.get('/status', (req, res) => {
  res.json({
    briefGenerator: !!global.briefGenerator,
    quoteBuilder: !!global.quoteBuilder,
    projectTracker: !!global.projectTracker,
    clientHealth: !!global.clientHealth,
    deliveryChecklist: !!global.deliveryChecklist,
    revisionTracker: !!global.revisionTracker,
    qcBot: !!global.qcBot,
    notifications: !!global.notifications,
    routines: !!global.routines && global.routines._initialized
  });
});

module.exports = router;
