// backend/src/routes/obsidian.js
// Endpoints de integración con BOVEDA NKD (Obsidian vault)
//
//  POST /api/obsidian/idea           → saveIdea
//  POST /api/obsidian/decision       → saveDecision
//  POST /api/obsidian/learning       → saveLearning
//  POST /api/obsidian/roadmap        → saveRoadmap
//  POST /api/obsidian/pull           → pullPendingNotes (drena cola Supabase)
//  GET  /api/obsidian/status         → estado del vault + pendientes

const express = require('express');
const router  = express.Router();
const obsidian = require('../services/obsidian-sync');

// ── GET /api/obsidian/status ───────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const { supabase } = require('../core/supabase');
    const vaultOk = obsidian.isVaultAvailable();

    const { count: pending } = await supabase
      .from('oracle_memory')
      .select('*', { count: 'exact', head: true })
      .eq('tipo', 'obsidian_pending');

    const { count: synced } = await supabase
      .from('oracle_memory')
      .select('*', { count: 'exact', head: true })
      .eq('tipo', 'obsidian_synced');

    res.json({
      success:         true,
      vault_available: vaultOk,
      vault_path:      obsidian.VAULT_PATH,
      pending_notes:   pending || 0,
      synced_notes:    synced  || 0,
      mode:            vaultOk ? 'direct_write' : 'supabase_queue',
      instructions:    !vaultOk
        ? 'Vault no accesible desde Railway. Llama POST /api/obsidian/pull desde tu máquina local para sincronizar.'
        : 'Vault disponible — escritura directa activa.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/obsidian/idea ────────────────────────────────────────────────
router.post('/idea', async (req, res) => {
  try {
    const { titulo, contenido, tags = [], origen = 'api' } = req.body;
    if (!titulo || !contenido) return res.status(400).json({ error: 'titulo y contenido requeridos' });

    const result = await obsidian.saveIdea(titulo, contenido, tags, origen);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/obsidian/decision ────────────────────────────────────────────
router.post('/decision', async (req, res) => {
  try {
    const { titulo, contexto, decision, impacto = '' } = req.body;
    if (!titulo || !decision) return res.status(400).json({ error: 'titulo y decision requeridos' });

    const result = await obsidian.saveDecision(titulo, contexto || '', decision, impacto);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/obsidian/learning ────────────────────────────────────────────
router.post('/learning', async (req, res) => {
  try {
    const { titulo, aprendizaje, proyecto = 'fractal', tipo = 'estrategico' } = req.body;
    if (!titulo || !aprendizaje) return res.status(400).json({ error: 'titulo y aprendizaje requeridos' });

    const result = await obsidian.saveLearning(titulo, aprendizaje, proyecto, tipo);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/obsidian/roadmap ─────────────────────────────────────────────
router.post('/roadmap', async (req, res) => {
  try {
    const { proyecto, estado, siguiente_paso, blockers = [] } = req.body;
    if (!proyecto || !estado || !siguiente_paso) {
      return res.status(400).json({ error: 'proyecto, estado y siguiente_paso requeridos' });
    }

    const result = await obsidian.saveRoadmap(proyecto, estado, siguiente_paso, blockers);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/obsidian/pull ────────────────────────────────────────────────
// Drena la cola de Supabase y escribe al vault local.
// Llamar desde Claude Code o Windows Task Scheduler cuando el vault esté disponible.
router.post('/pull', async (req, res) => {
  try {
    const result = await obsidian.pullPendingNotes();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
