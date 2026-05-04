// backend/src/routes/oracle.js
// API routes for ORACLE — status + manual consult for testing.

const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');

// GET /api/oracle/status
router.get('/status', async (req, res) => {
  try {
    if (!global.oracle) return res.json({ initialized: false, message: 'Oracle not yet started' });
    const status = await global.oracle.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/oracle/queries?limit=20
router.get('/queries', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { data, error } = await supabase
      .from('oracle_queries')
      .select('agent_name, question, model_used, query_type, actual_cost, estimated_cost, response_time_ms, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ queries: data, count: data?.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/oracle/quotas
router.get('/quotas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('oracle_quotas')
      .select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ quotas: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/oracle/consult — for testing from outside agents
// Body: { question, agentName?, depth?, research? }
router.post('/consult', async (req, res) => {
  try {
    if (!global.oracle?.isInitialized) return res.status(503).json({ error: 'Oracle not initialized' });
    const { question, agentName = 'Tester', depth = 'auto', research = false, context = {} } = req.body || {};
    if (!question) return res.status(400).json({ error: 'question is required' });

    // Look up agent UUID by name (optional — if not found, query is logged with null agent_id)
    let agentObj = { id: null, name: agentName, role: 'tester' };
    try {
      const { data } = await supabase.from('agents').select('id, name, role').ilike('name', agentName).limit(1).maybeSingle();
      if (data) agentObj = { id: data.id, name: data.name, role: data.role };
    } catch (_) {}

    const result = await global.oracle.consult({
      question,
      agent: agentObj,
      context,
      depth,
      requireResearch: research
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
