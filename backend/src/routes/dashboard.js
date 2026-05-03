const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');

// GET full dashboard data
router.get('/', async (req, res) => {
  try {
    const [
      { data: agents },
      { data: projects },
      { data: clients },
      { data: tasks },
      { data: recentMessages }
    ] = await Promise.all([
      supabase.from('agents').select('slug, name, status, mood, energy_level, color, current_task'),
      supabase.from('projects').select('id, name, status, priority, deadline').eq('status', 'active'),
      supabase.from('clients').select('id, name, tier').order('created_at', { ascending: false }).limit(10),
      supabase.from('tasks').select('id, title, status, priority, assigned_to').neq('status', 'completed').limit(20),
      supabase.from('messages').select('id, role, content, created_at').order('created_at', { ascending: false }).limit(20)
    ]);

    res.json({
      success: true,
      dashboard: {
        agents: agents || [],
        activeProjects: projects || [],
        recentClients: clients || [],
        pendingTasks: tasks || [],
        recentMessages: recentMessages?.reverse() || [],
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET office state (for PixiJS frontend)
router.get('/office', async (req, res) => {
  try {
    const { data } = await supabase
      .from('office_state')
      .select('*, agents(slug, name, color, status, mood)');
    res.json({ success: true, officeState: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET financial summary (Roberto's data)
router.get('/financials', async (req, res) => {
  try {
    const [{ data: invoices }, { data: payments }] = await Promise.all([
      supabase.from('invoices').select('status, total, currency').order('created_at', { ascending: false }).limit(50),
      supabase.from('payments').select('amount, currency, status').order('created_at', { ascending: false }).limit(50)
    ]);

    const totalBilled = invoices?.filter(i => i.status !== 'cancelled').reduce((s, i) => s + (i.total || 0), 0) || 0;
    const totalPaid = payments?.filter(p => p.status === 'confirmed').reduce((s, p) => s + (p.amount || 0), 0) || 0;
    const pending = invoices?.filter(i => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + (i.total || 0), 0) || 0;

    res.json({
      success: true,
      financials: {
        totalBilled,
        totalPaid,
        pendingCollection: pending,
        currency: 'MXN',
        invoiceCount: invoices?.length || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
