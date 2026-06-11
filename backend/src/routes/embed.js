// backend/src/routes/embed.js
// Endpoint del chat web embebido (widget Mariana en fractalstudio.com.mx).
// El widget POSTea a /api/embed/message y espera { reply, cta }.
// - Modelo: Haiku (claude-haiku-4-5-20251001)
// - Persona: Mariana Delgado (mariana-web.prompts.js)
// - Captura de lead → email a Neiky + proyectosfractalmx (background, vía Resend)

const express = require('express');
const router = express.Router();

const { chat } = require('../core/anthropic');
const { sendEmail } = require('../core/email');
const { MODELS } = require('../core/model-routing');
const { MARIANA_WEB_PROMPT, WHATSAPP_HUMANO } = require('../prompts/mariana-web.prompts');

const LEAD_TO  = process.env.NEIKY_EMAIL || 'nakedgeometry19@gmail.com';
const LEAD_CC  = process.env.FRACTAL_LEADS_CC || 'proyectosfractalmx@gmail.com';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Convierte la conversación del widget ({role:'user'|'bot', text}) a mensajes Claude.
// Claude exige que la lista empiece por 'user' y alterne; descartamos saludos del bot al inicio.
function toClaudeMessages(conversation = [], fallbackUserMessage = '') {
  let msgs = (Array.isArray(conversation) ? conversation : [])
    .filter(m => m && typeof m.text === 'string' && m.text.trim())
    .map(m => ({ role: m.role === 'bot' || m.role === 'assistant' ? 'assistant' : 'user', content: m.text.trim() }));

  // Descarta turnos 'assistant' al inicio (Claude debe arrancar en 'user')
  while (msgs.length && msgs[0].role === 'assistant') msgs.shift();

  // Colapsa turnos consecutivos del mismo rol (defensa)
  const collapsed = [];
  for (const m of msgs) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.role === m.role) last.content += '\n' + m.content;
    else collapsed.push({ ...m });
  }
  msgs = collapsed;

  // Garantiza que el último turno sea del usuario
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') {
    if (fallbackUserMessage && fallbackUserMessage.trim()) {
      msgs.push({ role: 'user', content: fallbackUserMessage.trim() });
    }
  }
  return msgs;
}

// Extrae y elimina los marcadores ocultos del texto visible.
function parseMarkers(raw) {
  let text = raw || '';
  let cta = false;
  let lead = null;

  if (/<<<CTA>>>/i.test(text)) {
    cta = true;
    text = text.replace(/<<<CTA>>>/gi, '');
  }

  const leadMatch = text.match(/<<<LEAD([^>]*)>>>/i);
  if (leadMatch) {
    const attrs = leadMatch[1];
    const get = (k) => {
      const m = attrs.match(new RegExp(k + '\\s*=\\s*"([^"]*)"', 'i'));
      return m ? m[1].trim() : '';
    };
    lead = { nombre: get('nombre'), empresa: get('empresa'), email: get('email') };
    text = text.replace(/<<<LEAD[^>]*>>>/gi, '');
  }

  return { text: text.trim(), cta, lead };
}

function buildTranscript(conversation, lastUser, lastBot) {
  const lines = (conversation || [])
    .filter(m => m && m.text)
    .map(m => `${m.role === 'bot' || m.role === 'assistant' ? 'Mariana' : 'Visitante'}: ${m.text}`);
  if (lastUser) lines.push(`Visitante: ${lastUser}`);
  if (lastBot)  lines.push(`Mariana: ${lastBot}`);
  return lines.join('\n');
}

// Email del lead — corre en background (no bloquea la respuesta del chat).
async function notifyLead({ lead, transcript, sourceUrl }) {
  try {
    const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

    // Resumen corto (Haiku, barato). Si falla, seguimos con el transcript.
    let resumen = '(sin resumen)';
    try {
      const r = await chat({
        system: 'Resume en 3-5 líneas, en español neutro, de qué trató esta conversación de un visitante con el chat de Fractal MX y en qué quedaron. Sin saludos ni preámbulos.',
        messages: [{ role: 'user', content: transcript.slice(0, 6000) }],
        model: MODELS.HAIKU,
        maxTokens: 300,
        temperature: 0.3,
      });
      if (r && r.content) resumen = r.content.trim();
    } catch (e) { /* resumen opcional */ }

    const subject = '🟢 Nueva conversación — Fractal MX Web';
    const esc = (s) => String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;color:#1a1a1a;line-height:1.5">
        <h2 style="margin:0 0 12px">🟢 Nueva conversación — Fractal MX Web</h2>
        <table style="border-collapse:collapse;font-size:14px">
          <tr><td style="padding:2px 10px 2px 0"><b>Nombre</b></td><td>${esc(lead.nombre) || '—'}</td></tr>
          <tr><td style="padding:2px 10px 2px 0"><b>Empresa</b></td><td>${esc(lead.empresa) || '—'}</td></tr>
          <tr><td style="padding:2px 10px 2px 0"><b>Correo</b></td><td>${esc(lead.email) || '—'}</td></tr>
          <tr><td style="padding:2px 10px 2px 0"><b>Fecha</b></td><td>${esc(fecha)}</td></tr>
          <tr><td style="padding:2px 10px 2px 0"><b>Origen</b></td><td>${esc(sourceUrl) || '—'}</td></tr>
        </table>
        <h3 style="margin:18px 0 6px">Resumen</h3>
        <p style="font-size:14px;white-space:pre-wrap">${esc(resumen)}</p>
        <h3 style="margin:18px 0 6px">Transcript completo</h3>
        <pre style="font-size:13px;white-space:pre-wrap;background:#f6f6f4;padding:12px;border-radius:8px">${esc(transcript)}</pre>
      </div>`;
    const text = `Nueva conversación — Fractal MX Web\n\nNombre: ${lead.nombre || '—'}\nEmpresa: ${lead.empresa || '—'}\nCorreo: ${lead.email || '—'}\nFecha: ${fecha}\nOrigen: ${sourceUrl || '—'}\n\nResumen:\n${resumen}\n\nTranscript:\n${transcript}`;

    await sendEmail({ to: LEAD_TO, cc: LEAD_CC, subject, html, text, fromName: 'Mariana · Fractal MX' });
    console.log(`[embed] Lead notificado: ${lead.email} → ${LEAD_TO} (cc ${LEAD_CC})`);
  } catch (err) {
    console.error('[embed] Error notificando lead:', err.message);
  }
}

// Persistencia best-effort en Supabase (no bloquea ni rompe si la tabla no existe).
async function persistLead({ visitorId, agency, sourceUrl, lead }) {
  try {
    const { supabase } = require('../core/supabase');
    await supabase.from('embed_leads').upsert({
      visitor_id: visitorId,
      agency: agency || 'fractal',
      source_url: sourceUrl || null,
      nombre: lead.nombre || null,
      empresa: lead.empresa || null,
      email: lead.email || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'visitor_id' });
  } catch (e) { /* best-effort */ }
}

// ─── POST /api/embed/message ─────────────────────────────────────────────────
router.post('/message', async (req, res) => {
  try {
    const { visitor_id, agency, source_url, message, conversation } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'message required' });
    }

    const messages = toClaudeMessages(conversation, message);
    if (!messages.length) {
      return res.status(400).json({ error: 'empty conversation' });
    }

    const result = await chat({
      system: MARIANA_WEB_PROMPT,
      messages,
      model: MODELS.HAIKU,
      maxTokens: 600,
      temperature: 0.7,
    });

    const { text, cta, lead } = parseMarkers(result.content);
    const reply = text || 'Con gusto te ayudo. ¿Me cuentas un poco más de lo que buscas crear?';

    // Respondemos YA al widget; el email/persistencia van en background.
    res.json({ reply, cta, ...(cta ? { cta_url: WHATSAPP_HUMANO, cta_label: 'Conversar con un humano' } : {}) });

    if (lead && (lead.email || lead.nombre)) {
      const transcript = buildTranscript(conversation, message, reply);
      // No await — background.
      notifyLead({ lead, transcript, sourceUrl: source_url });
      persistLead({ visitorId: visitor_id, agency, sourceUrl: source_url, lead });
    }
  } catch (err) {
    console.error('[embed/message]', err.message);
    res.status(500).json({ reply: 'Tuve un detalle técnico. ¿Me dejas tu correo y el equipo de Fractal te escribe?' });
  }
});

module.exports = router;
