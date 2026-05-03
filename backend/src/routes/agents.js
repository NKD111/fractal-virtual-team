const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');
const { processIncoming } = require('../core/orchestrator');

// GET all agents with their current state
router.get('/', async (req, res) => {
  try {
    const { data: agents, error } = await supabase
      .from('agents')
      .select('id, name, slug, role, area, status, current_mood, energy_level, last_active')
      .order('name');
    if (error) throw error;
    res.json({ success: true, agents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single agent
router.get('/:slug', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('agents')
      .select('id, name, slug, role, area, status, current_mood, energy_level, last_active')
      .eq('slug', req.params.slug)
      .single();
    if (error) throw error;
    res.json({ success: true, agent: data });
  } catch (err) {
    res.status(404).json({ success: false, error: 'Agent not found' });
  }
});

// POST send message to specific agent
router.post('/:slug/message', async (req, res) => {
  try {
    const { text, from = 'web_user', channel = 'web' } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });

    const result = await processIncoming({ from, text, channel });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET agent conversation history
router.get('/:slug/history', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('slug', req.params.slug)
      .single();

    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { data: messages } = await supabase
      .from('messages')
      .select('*, conversations!inner(agent_id)')
      .eq('conversations.agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    res.json({ success: true, messages: messages?.reverse() || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET daily report for agent
router.get('/:slug/report', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: agent } = await supabase.from('agents').select('id').eq('slug', req.params.slug).single();
    const { data: report } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('agent_id', agent.id)
      .eq('report_date', today)
      .single();

    res.json({ success: true, report: report || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
