// backend/src/routes/unified.js
// Fase 7 — Unified Context API endpoints

const express = require('express');
const router = express.Router();
const { getUCM } = require('../unified-context/UnifiedContextManager');
const { supabase } = require('../core/supabase');

const ucm = getUCM();
global.ucm = ucm;

// POST /api/unified-message  { channel, identifier, message, agentName? }
router.post('/unified-message', async (req, res) => {
  try {
    const { channel = 'web', identifier, message, agentName = 'mariana' } = req.body || {};
    if (!identifier) return res.status(400).json({ error: 'identifier required' });
    if (!message) return res.status(400).json({ error: 'message required' });
    const result = await ucm.processMessage({ channel, identifier, message, agentName });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/:userId/:agentName
router.get('/conversations/:userId/:agentName', async (req, res) => {
  try {
    const { userId, agentName } = req.params;
    const { data: messages } = await supabase
      .from('messages')
      .select('id, role, content, agent_name, source_channel, created_at')
      .eq('user_id', userId)
      .or(`role.eq.user,agent_name.eq.${agentName}`)
      .order('created_at', { ascending: true })
      .limit(100);
    res.json({ messages: messages || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/me?session=...  — get-or-create web session user
router.get('/users/me', async (req, res) => {
  try {
    const session = req.query.session || `anon-${Date.now()}`;
    const user = await ucm.identifyUser({ channel: 'web', identifier: session });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/standup/run — manual trigger for the daily standup orchestrator.
// Used to verify the full pipeline works (agents report → Mariana synthesizes
// → WhatsApp arrives at +525534189583 → Office View shows chat bubbles).
router.post('/standup/run', async (req, res) => {
  try {
    const DailyStandup = require('../routines/daily-standup');
    const result = await DailyStandup.run();
    res.json({
      success: true,
      message: 'Standup ejecutado',
      whatsapp_sent: result.whatsapp_sent,
      summary: result.summary,
      standups: result.standups
    });
  } catch (err) {
    console.error('Standup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/standup/latest — last standup events from the log
router.get('/standup/latest', async (req, res) => {
  try {
    const { data } = await supabase
      .from('system_events')
      .select('event_type, details, started_at')
      .in('event_type', ['agent_standup', 'daily_summary'])
      .order('started_at', { ascending: false })
      .limit(20);
    res.json({ events: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/unified/status — for verification
router.get('/status', async (req, res) => {
  try {
    const { data: usersCount } = await supabase.from('users').select('id', { head: true, count: 'exact' });
    res.json({
      ok: true,
      ucm_initialized: !!global.ucm,
      io_connected: !!global.io,
      users_count: usersCount?.length ?? 'n/a'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
