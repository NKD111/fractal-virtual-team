// backend/src/routes/verification.js
// Trigger the full verification suite from outside.

const express = require('express');
const router = express.Router();
const { runFullVerification } = require('../tests/verification-suite');

// POST /api/verification/run — runs the full suite (5–60 seconds)
router.post('/run', async (req, res) => {
  try {
    const report = await runFullVerification();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

module.exports = router;
