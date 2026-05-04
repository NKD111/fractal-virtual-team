// backend/src/routes/verification.js
// Trigger the full verification suite from outside.

const express = require('express');
const router = express.Router();
const { runFullVerification } = require('../tests/verification-suite');
const { runPromisesVerification } = require('../tests/promises-verification');
const { runFase6Stress } = require('../tests/fase6-stress');
const { runVisionStress } = require('../tests/vision-stress');

// POST /api/verification/run — runs the full suite (5–60 seconds)
router.post('/run', async (req, res) => {
  try {
    const report = await runFullVerification();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// POST /api/verification/promises — focused test of Mariana's anti-empty-promises system
router.post('/promises', async (req, res) => {
  try {
    const report = await runPromisesVerification();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// POST /api/verification/fase6 — stress test for Fase 6 + non-regression checks
router.post('/fase6', async (req, res) => {
  try {
    const report = await runFase6Stress();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// POST /api/verification/vision — stress test for Fase 6.5 Vision Layer
router.post('/vision', async (req, res) => {
  try {
    const report = await runVisionStress();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

module.exports = router;
