// backend/src/routes/guardian.js
// API routes for System Guardian (NEXUS + ATLAS status)

const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');

// GET /api/guardian/health — Quick condensed health (no auth, for dashboards/uptime checks)
router.get('/health', async (req, res) => {
  try {
    const out = {
      ok: true,
      ts: new Date().toISOString(),
      guardian_initialized: !!global.guardian,
      services: { up: 0, degraded: 0, down: 0, total: 0 },
      recent_alerts_24h: 0,
      last_synthetic_test: null
    };

    // Service rollup
    try {
      const { data: services } = await supabase
        .from('monitored_services')
        .select('current_status')
        .eq('is_active', true);
      if (services?.length) {
        out.services.total = services.length;
        for (const s of services) {
          const st = (s.current_status || 'unknown').toLowerCase();
          if (st === 'up' || st === 'ok' || st === 'healthy') out.services.up++;
          else if (st === 'degraded' || st === 'warning' || st === 'slow') out.services.degraded++;
          else if (st === 'down' || st === 'error' || st === 'critical') out.services.down++;
        }
      }
    } catch {}

    // Alerts last 24h
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('predictive_alerts')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since);
      out.recent_alerts_24h = count || 0;
    } catch {}

    // Last synthetic test
    try {
      const { data: tests } = await supabase
        .from('synthetic_tests')
        .select('service_key, status, tested_at')
        .order('tested_at', { ascending: false })
        .limit(1);
      if (tests?.[0]) out.last_synthetic_test = tests[0];
    } catch {}

    out.ok = out.guardian_initialized && out.services.down === 0;
    res.json(out);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/guardian/status — Full guardian status
router.get('/status', async (req, res) => {
  try {
    if (!global.guardian) return res.json({ initialized: false, message: 'Guardian not yet started' });
    const status = await global.guardian.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/guardian/services — List all monitored services + current status
router.get('/services', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('monitored_services')
      .select('service_key, name, type, importance_level, current_status, last_checked_at, last_response_time_ms')
      .eq('is_active', true)
      .order('importance_level', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ services: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/guardian/predictions — Recent predictive alerts
router.get('/predictions', async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('predictive_alerts')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ predictions: data, since });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/guardian/events — Recent system events
router.get('/events', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 2;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('system_events')
      .select('*')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ events: data, since, hours });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/guardian/subscriptions — Financial subscriptions
router.get('/subscriptions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('service_subscriptions')
      .select('*')
      .order('next_billing_date', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ subscriptions: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/guardian/tests — Recent synthetic tests
router.get('/tests', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { data, error } = await supabase
      .from('synthetic_tests')
      .select('service_key, status, response_time_ms, error_message, tested_at')
      .order('tested_at', { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ tests: data, count: data?.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/guardian/test/:serviceKey — Trigger immediate test for a service
router.post('/test/:serviceKey', async (req, res) => {
  try {
    if (!global.guardian) return res.status(503).json({ error: 'Guardian not initialized' });
    const { serviceKey } = req.params;
    const result = await global.guardian.atlas.testNow(serviceKey);
    res.json({ serviceKey, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/guardian/repair/:serviceKey — Trigger manual repair
router.post('/repair/:serviceKey', async (req, res) => {
  try {
    if (!global.guardian) return res.status(503).json({ error: 'Guardian not initialized' });
    const { serviceKey } = req.params;
    const { issueType = 'generic' } = req.body;
    const result = await global.guardian.atlas.repair(serviceKey, issueType);
    res.json({ serviceKey, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
