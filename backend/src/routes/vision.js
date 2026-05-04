// backend/src/routes/vision.js
// API endpoints for Vision Layer (Fase 6.5)

const express = require('express');
const router = express.Router();

router.get('/status', async (req, res) => {
  try {
    if (!global.visionService) return res.json({ initialized: false, message: 'Vision not yet started' });
    res.json(await global.visionService.getStatus());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/vision/analyze-url   { url, agentName?, focus?, useCache? }
router.post('/analyze-url', async (req, res) => {
  try {
    if (!global.visionService?.isInitialized) return res.status(503).json({ error: 'Vision not initialized' });
    const { url, agentName = 'tester', focus = 'general', useCache = true } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    const result = await global.visionService.analyzeURL({
      url,
      agent: { id: null, name: agentName, role: 'tester' },
      focus,
      useCache
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/vision/analyze-image  { imageUrl?, imageBase64?, agentName?, focus? }
router.post('/analyze-image', async (req, res) => {
  try {
    if (!global.visionService?.isInitialized) return res.status(503).json({ error: 'Vision not initialized' });
    const { imageUrl, imageBase64, agentName = 'tester', focus = 'design' } = req.body || {};
    if (!imageUrl && !imageBase64) return res.status(400).json({ error: 'imageUrl or imageBase64 required' });
    res.json(await global.visionService.analyzeImage({
      imageUrl, imageBase64,
      agent: { id: null, name: agentName, role: 'tester' },
      focus
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/vision/compare  { sourceA, sourceB, comparisonType? }
router.post('/compare', async (req, res) => {
  try {
    if (!global.visionService?.isInitialized) return res.status(503).json({ error: 'Vision not initialized' });
    const { sourceA, sourceB, comparisonType = 'style', agentName = 'tester' } = req.body || {};
    if (!sourceA || !sourceB) return res.status(400).json({ error: 'sourceA and sourceB required' });
    res.json(await global.visionService.compareDesigns({
      sourceA, sourceB,
      agent: { id: null, name: agentName, role: 'tester' },
      comparisonType
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
