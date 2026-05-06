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

// GET /api/oracle/report — último reporte diario desde oracle_memory
router.get('/report', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    // Leer oracle_memory ordenado por relevance y timestamp
    const { data: memories, error: memErr } = await supabase
      .from('oracle_memory')
      .select('id, timestamp, category, content, relevance_score, times_applied, source')
      .order('relevance_score', { ascending: false })
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (memErr) {
      console.warn('[Oracle /report] oracle_memory error:', memErr.message);
    }

    // Estado del oracle si está disponible
    let oracleStatus = null;
    try {
      if (global.oracle?.isInitialized) oracleStatus = await global.oracle.getStatus();
    } catch (_) {}

    // Últimas consultas del día para contexto
    const today = new Date().toISOString().split('T')[0];
    const { data: todayQueries } = await supabase
      .from('oracle_queries')
      .select('agent_name, model_used, actual_cost, query_type, created_at')
      .gte('created_at', today)
      .order('created_at', { ascending: false })
      .limit(20)
      .catch(() => ({ data: [] }));

    const totalCostToday = (todayQueries || []).reduce(
      (s, q) => s + Number(q.actual_cost || 0), 0
    );

    res.json({
      generated_at: new Date().toISOString(),
      oracle_status: oracleStatus,
      memories: memories || [],
      memories_count: memories?.length || 0,
      today_queries: (todayQueries || []).length,
      today_cost_usd: Number(totalCostToday.toFixed(4)),
      summary: memories?.length
        ? `${memories.length} entradas en oracle_memory. Top categoría: ${memories[0]?.category || 'n/a'}.`
        : 'oracle_memory vacío. Los agentes irán poblando la memoria al operar.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/oracle/memory — insertar entrada manual en oracle_memory
router.post('/memory', async (req, res) => {
  try {
    const { category, content, relevance_score = 5, source = 'manual' } = req.body || {};
    if (!category || !content) return res.status(400).json({ error: 'category y content requeridos' });

    const { data, error } = await supabase
      .from('oracle_memory')
      .insert({ category, content, relevance_score, source })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, memory: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
