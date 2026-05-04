// backend/src/routes/models.js
const router = require('express').Router();
const modelRouter = require('../services/workflows/model-router');
const projectClassifier = require('../services/workflows/project-classifier');

router.get('/status', (req, res) => {
  res.json({ models: modelRouter.getModelStatus(), timestamp: new Date().toISOString() });
});

router.post('/classify', (req, res) => {
  const { description, answers } = req.body;
  if (!description) return res.status(400).json({ error: 'description required' });
  try {
    const classification = projectClassifier.classify(description, answers || {});
    res.json({ classification, summary: projectClassifier.formatSummary(classification) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
