// backend/src/routes/axiom.js
// API routes for AXIOM Opportunity Scanner.

const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');
const axiomScan = require('../routines/axiom-scan');

// ─── GET /api/axiom/status ────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  try {
    res.json({
      ok: true,
      cron: '0 */6 * * * (00,06,12,18 CDMX)',
      ...axiomScan.status()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/axiom/scan ─────────────────────────────────────────────────────
// Dispara un scan manual en background (no bloquea la respuesta)
router.post('/scan', async (req, res) => {
  try {
    const { runAxiomScan } = require('../routines/axiom-scanner');
    runAxiomScan()
      .then(r => console.log(`[AXIOM] manual scan done: ${r.inserted} inserted`))
      .catch(e => console.error('[AXIOM] manual scan error:', e.message));
    res.json({ started: true, message: 'AXIOM scan iniciado en background' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/axiom/opportunities ────────────────────────────────────────────
// Fetch oportunidades detectadas. Filters: status, urgency, category, limit
router.get('/opportunities', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const { status, urgency, category } = req.query;

    let q = supabase
      .from('axiom_opportunities')
      .select('*')
      .order('score_total', { ascending: false, nullsFirst: false })
      .order('discovered_at', { ascending: false })
      .limit(limit);

    if (status) {
      q = q.eq('status', status);
    } else {
      q = q.in('status', ['detected', 'open']);
    }
    if (urgency) q = q.eq('urgency', urgency);
    if (category) q = q.eq('category', category);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ opportunities: data || [], count: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/axiom/opportunities/:id ──────────────────────────────────────
// Actualizar status de una oportunidad (open → in_progress / won / lost / dismissed)
router.patch('/opportunities/:id', async (req, res) => {
  try {
    const ALLOWED_STATUSES = ['open', 'in_progress', 'won', 'lost', 'dismissed'];
    const { status, notes } = req.body || {};
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status debe ser uno de: ${ALLOWED_STATUSES.join(', ')}` });
    }

    const updates = { status, updated_at: new Date().toISOString() };
    if (notes) updates.notes = notes;

    const { data, error } = await supabase
      .from('axiom_opportunities')
      .update(updates)
      .eq('id', req.params.id)
      .select('id, title, status, urgency, score_total')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, opportunity: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
