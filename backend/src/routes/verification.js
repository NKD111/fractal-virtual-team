// backend/src/routes/verification.js
// Trigger the full verification suite from outside.

const express = require('express');
const router = express.Router();
// Lazy/optional requires — varios tests fueron retirados en v7.0
function tryRequire(p) { try { return require(p); } catch { return null; } }
const _vs   = tryRequire('../tests/verification-suite')   || {};
const _pv   = tryRequire('../tests/promises-verification') || {};
const _f6   = tryRequire('../tests/fase6-stress')          || {};
const _vis  = tryRequire('../tests/vision-stress')         || {};
const _va   = tryRequire('../tests/vision-agents')         || {};
const _uc   = tryRequire('../tests/unified-context-stress') || {};

const stub = async () => ({ ok: false, error: 'suite retirada en v7.0' });
const runFullVerification    = _vs.runFullVerification    || stub;
const runPromisesVerification= _pv.runPromisesVerification|| stub;
const runFase6Stress         = _f6.runFase6Stress         || stub;
const runVisionStress        = _vis.runVisionStress       || stub;
const runVisionAgentsStress  = _va.runVisionAgentsStress  || stub;
const runUnifiedContextStress= _uc.runUnifiedContextStress|| stub;

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

// POST /api/verification/vision-agents — per-agent vision methods stress
router.post('/vision-agents', async (req, res) => {
  try {
    const report = await runVisionAgentsStress();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// POST /api/verification/unified — Fase 7 Unified Context stress
router.post('/unified', async (req, res) => {
  try {
    const report = await runUnifiedContextStress();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

module.exports = router;
