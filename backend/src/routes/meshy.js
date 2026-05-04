// backend/src/routes/meshy.js
// Endpoints for Meshy image-to-3D pipeline.
// Status: armed only when MESHY_API_KEY is set.

const express = require('express');
const router = express.Router();
const { getMeshy } = require('../meshy/MeshyPipeline');
const { supabase } = require('../core/supabase');

const meshy = getMeshy();

// GET /api/meshy/status — show armed state without invoking Meshy
router.get('/status', (req, res) => {
  res.json(meshy.status());
});

// POST /api/meshy/generate  { imageUrl, agentSlug, style? }
router.post('/generate', async (req, res) => {
  try {
    const { imageUrl, agentSlug, style } = req.body || {};
    if (!imageUrl || !agentSlug) return res.status(400).json({ error: 'imageUrl and agentSlug required' });
    const r = await meshy.generateModel({ imageUrl, agentSlug, style });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/meshy/task/:taskId — current status of a task
router.get('/task/:taskId', async (req, res) => {
  try {
    const r = await meshy.checkStatus(req.params.taskId);
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/meshy/download  { taskId, agentSlug }
router.post('/download', async (req, res) => {
  try {
    const { taskId, agentSlug } = req.body || {};
    if (!taskId || !agentSlug) return res.status(400).json({ error: 'taskId and agentSlug required' });
    const r = await meshy.downloadGLB(taskId, agentSlug);
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/meshy/full  { imageUrl, agentSlug, style? } — generate + poll + download
router.post('/full', async (req, res) => {
  try {
    const { imageUrl, agentSlug, style } = req.body || {};
    if (!imageUrl || !agentSlug) return res.status(400).json({ error: 'imageUrl and agentSlug required' });
    const r = await meshy.fullPipeline({ imageUrl, agentSlug, style });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/meshy/asset/:agentSlug — returns the GLB URL for an agent (or 404)
// Used by frontend HumanoidGLB to know if we should swap out VoxelHumanoid.
router.get('/asset/:agentSlug', async (req, res) => {
  try {
    const { agentSlug } = req.params;
    const { data } = await supabase
      .from('meshy_jobs')
      .select('task_id, agent_slug, status, model_urls')
      .eq('agent_slug', agentSlug)
      .eq('status', 'SUCCEEDED')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return res.status(404).json({ error: 'no_asset' });
    const url = data.model_urls?.glb || null;
    if (!url) return res.status(404).json({ error: 'no_glb_url' });
    res.json({ agent_slug: agentSlug, glb_url: url, task_id: data.task_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/meshy/assets — registry of all agent GLBs available
router.get('/assets', async (req, res) => {
  try {
    const { data } = await supabase
      .from('meshy_jobs')
      .select('agent_slug, status, model_urls, completed_at')
      .eq('status', 'SUCCEEDED');
    const map = {};
    (data || []).forEach(j => {
      if (j.model_urls?.glb && !map[j.agent_slug]) {
        map[j.agent_slug] = { glb_url: j.model_urls.glb, completed_at: j.completed_at };
      }
    });
    res.json({ assets: map, count: Object.keys(map).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
