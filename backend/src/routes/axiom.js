// backend/src/routes/axiom.js
// API routes for AXIOM Opportunity Scanner + Prospecting v2.

const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');
const axiomScan = require('../routines/axiom-scan');
const axiomProspector = require('../routines/axiom-prospector');

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

// ─── GET /api/axiom/prospector/status ────────────────────────────────────────
router.get('/prospector/status', (req, res) => {
  try {
    res.json({ ok: true, ...axiomProspector.status() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/axiom/prospect-scan ───────────────────────────────────────────
// Lanza pipeline completo: Apify → auditoría → score → mensajes WA → Supabase
// Body opcional: { industries: ['restaurantes','belleza'], zones: ['Polanco...'], maxPerSearch: 5, dryRun: false }
router.post('/prospect-scan', async (req, res) => {
  try {
    const { dryRun = false, industries, zones, maxPerSearch } = req.body || {};

    // Responder inmediatamente — el pipeline corre en background
    res.json({
      started: true,
      dry_run: dryRun,
      message: dryRun
        ? 'AXIOM prospect scan DRY RUN iniciado — no insertará en BD ni generará mensajes WA'
        : 'AXIOM prospect scan v2 iniciado en background — resultados en /api/axiom/prospects',
      config: axiomProspector.status(),
    });

    // Ejecutar pipeline en background
    axiomProspector.runProspectScan({ industries, zones, maxPerSearch, dryRun })
      .then(r => console.log(`[AXIOM-P] Prospect scan done: ${r.inserted} prospects insertados`))
      .catch(e => console.error('[AXIOM-P] Prospect scan error:', e.message));

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/axiom/prospects ─────────────────────────────────────────────────
// Lista prospectos con filtros. Ordenados por score desc.
// Query params: status, industria, zona, aprobado, limit
router.get('/prospects', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { status, industria, zona, aprobado } = req.query;

    let q = supabase
      .from('prospects')
      .select('id, nombre_empresa, industria, ciudad, zona, contacto_whatsapp, website, score, digital_score, servicio_sugerido, precio_sugerido, status, aprobado_nkd, enviado_mariana, rating_google, mensaje_contacto, created_at')
      .order('score', { ascending: false })
      .limit(limit);

    if (status)    q = q.eq('status', status);
    if (industria) q = q.eq('industria', industria);
    if (zona)      q = q.or(`zona.ilike.%${zona}%,ciudad.ilike.%${zona}%`);
    if (aprobado !== undefined) q = q.eq('aprobado_nkd', aprobado === 'true');

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ prospects: data || [], count: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/axiom/prospects/:id ────────────────────────────────────────────
// Detalle completo de un prospecto incluyendo mensaje WA
router.get('/prospects/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: 'Prospecto no encontrado' });
    res.json({ prospect: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/axiom/prospects/:id/approve ──────────────────────────────────
// NKD aprueba o rechaza mensaje WA. Body: { aprobado: true/false, mensaje_editado?: string }
router.patch('/prospects/:id/approve', async (req, res) => {
  try {
    const { aprobado, mensaje_editado, notas } = req.body || {};
    if (typeof aprobado !== 'boolean') {
      return res.status(400).json({ error: 'Se requiere campo "aprobado": true o false' });
    }

    const updates = {
      aprobado_nkd: aprobado,
      status: aprobado ? 'aprobado' : 'rechazado',
      updated_at: new Date().toISOString(),
    };
    if (mensaje_editado) updates.mensaje_contacto = mensaje_editado;
    if (notas) updates.notas_nkd = notas;

    const { data, error } = await supabase
      .from('prospects')
      .update(updates)
      .eq('id', req.params.id)
      .select('id, nombre_empresa, aprobado_nkd, status, mensaje_contacto')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({
      ok: true,
      prospect: data,
      next_step: aprobado ? 'Mariana puede enviar el mensaje de WhatsApp' : 'Prospecto descartado',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/axiom/prospects/:id/sent ─────────────────────────────────────
// Mariana confirma que envió el mensaje
router.patch('/prospects/:id/sent', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('prospects')
      .update({
        enviado_mariana: true,
        status: 'contactado',
        fecha_contacto: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select('id, nombre_empresa, status')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, prospect: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
