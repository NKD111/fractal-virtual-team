// backend/src/routes/webhooks.js
// C4: Emergency Webhook (NEXUS → emergency triggers Oracle diagnosis + Neiky alert)

const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');

// POST /webhooks/emergency  (header: x-nexus-token)
router.post('/emergency', async (req, res) => {
  const { error_context, service, severity = 'critical' } = req.body || {};
  const token = req.headers['x-nexus-token'];
  if (!process.env.NEXUS_WEBHOOK_TOKEN) {
    return res.status(503).json({ error: 'NEXUS_WEBHOOK_TOKEN not configured' });
  }
  if (token !== process.env.NEXUS_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await supabase.from('system_events').insert({
      event_type: 'emergency_triggered',
      severity,
      service_key: service || 'unknown',
      details: { error_context, source: 'webhook' }
    });
  } catch (_) {}

  let diagnosis = null;
  if (global.oracle?.isInitialized) {
    try {
      const r = await global.oracle.consult({
        question: `Emergencia técnica detectada:
Servicio: ${service}
Error: ${error_context}

¿Qué puede estar causando esto y qué pasos tomar inmediatamente? Sé directo, máximo 5 puntos.`,
        agent: { id: null, name: 'NEXUS', role: 'guardian' },
        depth: 'standard'
      });
      diagnosis = r?.answer;
    } catch (err) { console.warn('[Emergency] oracle error:', err.message); }
  }

  try {
    await notifyNeiky(`🚨 *EMERGENCIA — ${service || 'unknown'}*\n\n${error_context || 'sin contexto'}\n\n${diagnosis ? '*Diagnóstico ORACLE:*\n' + diagnosis : ''}`);
  } catch (_) {}

  res.json({ received: true, diagnosis_provided: !!diagnosis, timestamp: new Date().toISOString() });
});

module.exports = router;
