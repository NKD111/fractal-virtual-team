// backend/src/routes/payments.js
// Endpoints HTTP para crear payment links + webhook Stripe.

const express = require('express');
const router = express.Router();
const stripeClient = require('../core/stripe-client');

// Crea payment link
router.post('/create-link', async (req, res) => {
  try {
    const { amount_mxn, description, client_whatsapp, project_id, currency, metadata } = req.body || {};
    if (!amount_mxn || !description) {
      return res.status(400).json({ ok: false, error: 'amount_mxn y description son requeridos' });
    }
    const result = await stripeClient.createPaymentLink({ amount_mxn, description, client_whatsapp, project_id, currency, metadata });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[payments/create-link] error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
